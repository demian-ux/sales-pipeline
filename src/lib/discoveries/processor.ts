// Discoveries ingestion pipeline. Ported from Opportunity Terminal, adapted to:
//   - the renamed `discoveries` table (was `opportunities`)
//   - the unified ai client (with timeouts + jsonrepair parsing)
//   - the lazy Supabase admin client
//
// One run = fetch RSS sources in parallel → dedup raw articles → classify
// each candidate cheaply → for the keepers, run deep analysis → store as
// Discovery rows. Caps per-run and per-source to keep cost predictable.

import { getSupabaseAdmin } from '@/lib/supabase'
import { classifyArticle } from '@/lib/prompts/discoveries/classify'
import { analyzeArticle } from '@/lib/prompts/discoveries/analyze'
import { computeDiscoveryScore, scoreToTier } from './scoring'
import { computeIcpFit, sectorFitFromSector } from './icp'
import { isInTargetGeo, OUT_OF_GEO_SCORE_CAP } from './target-geo'
import { fetchRSSFeed, type RawArticleFromRSS } from './rss'
import { resolveGoogleNewsUrl, isGoogleNewsUrl } from './googleNewsResolver'
import type { DiscoverySignalTier } from '@/lib/types'

/**
 * Resolves a Google News redirect URL, swallowing any resolution error and
 * returning the original URL as a fallback. We never want a Google News
 * decoding failure to drop an otherwise good discovery — the downstream
 * find-firms UI now surfaces the error clearly if Jina later fails.
 */
async function resolveSourceUrlSafe(url: string): Promise<string> {
  if (!isGoogleNewsUrl(url)) return url
  try {
    return await resolveGoogleNewsUrl(url)
  } catch (err) {
    console.warn(`[ingest] Google News URL resolve failed for ${url}: ${err instanceof Error ? err.message : err}`)
    return url
  }
}

interface Source {
  name: string
  url: string
}

interface SourceFetchResult {
  source: Source
  articles: RawArticleFromRSS[]
  error?: string
}

interface CandidateArticle {
  source: Source
  article: RawArticleFromRSS
  // analysis_attempts already recorded on the raw_articles row (0 for fresh
  // articles). Threaded through so terminal status updates can increment it.
  priorAttempts: number
}

export interface IngestProgress {
  articles_new: number
  articles_found: number
  raw_articles_new: number
  raw_articles_duplicate: number
  articles_skipped_old: number
  articles_skipped_irrelevant: number
  articles_analyzed: number
  failed_sources: string[]
  errors: string[]
}

export interface IngestResult {
  success: boolean
  partial?: boolean
  run_id: string
  sources_processed: number
  articles_found: number
  raw_articles_new: number
  raw_articles_duplicate: number
  articles_skipped_old: number
  articles_skipped_irrelevant: number
  articles_analyzed: number
  articles_new: number
  errors: string[]
  failed_sources: string[]
}

const MAX_NEW_PER_RUN = 50
const MAX_PER_SOURCE = 2
const ARTICLE_FRESHNESS_DAYS = 365
const MIN_CONTENT_LENGTH_FOR_ANALYSIS = 600
const ARTICLE_FETCH_TIMEOUT_MS = 8_000
// An article whose analysis failed transiently is retried on later runs,
// up to this many total attempts, before being skipped for good.
const MAX_ANALYSIS_ATTEMPTS = 3
// Concurrent classify→analyze chains. 3 stays well inside API rate limits
// while cutting wall-clock roughly 3× vs the old serial loop.
const ANALYSIS_CONCURRENCY = 3

export function createIngestProgress(): IngestProgress {
  return {
    articles_new: 0,
    articles_found: 0,
    raw_articles_new: 0,
    raw_articles_duplicate: 0,
    articles_skipped_old: 0,
    articles_skipped_irrelevant: 0,
    articles_analyzed: 0,
    failed_sources: [],
    errors: [],
  }
}

export async function runIngestion(
  sources: Source[],
  runId: string,
  progress: IngestProgress = createIngestProgress(),
  // Wall-clock deadline (ms epoch). On Vercel the function is hard-killed at
  // `maxDuration` — without a deadline the run record stays 'running' forever
  // and unprocessed candidates are stranded. We stop cleanly before the wall;
  // deferred candidates keep status='new' and are reclaimed by the next run.
  deadlineMs?: number,
): Promise<IngestResult> {
  const supabase = getSupabaseAdmin()

  console.log(`[ingest] Starting — ${sources.length} sources | max ${MAX_NEW_PER_RUN} candidates | max ${MAX_PER_SOURCE}/source`)
  await updateRunProgress(runId, progress, 'Starting research', 1)

  const freshnessCutoff = new Date()
  freshnessCutoff.setDate(freshnessCutoff.getDate() - ARTICLE_FRESHNESS_DAYS)

  await updateRunProgress(runId, progress, `Scanning ${sources.length} sources`, 5)
  const sourceResults = await Promise.all(sources.map(fetchSourceArticles))
  progress.articles_found += sourceResults.reduce((sum, r) => sum + r.articles.length, 0)
  await updateRunProgress(runId, progress, `Found ${progress.articles_found} articles`, 15)

  const candidates = await prepareCandidateArticles(sourceResults, freshnessCutoff, runId, progress)
  await updateRunProgress(runId, progress, `Prepared ${candidates.length} candidates`, 40)

  // Process candidates with a small worker pool — the serial loop took
  // 15-40s per article and routinely outlived the function's time budget.
  // 3 concurrent chains sit comfortably inside API rate limits.
  let nextIndex = 0
  let completed = 0

  const takeNext = (): number | null => {
    if (nextIndex >= candidates.length) return null
    if (deadlineMs && Date.now() > deadlineMs) return null
    return nextIndex++
  }

  const processCandidate = async ({ source, article, priorAttempts }: CandidateArticle): Promise<void> => {
    const classification = await classifyArticle(article.title, article.content, article.link)
    if (classification && !classification.should_analyze) {
      progress.articles_skipped_irrelevant++
      await updateRawArticleStatus(article.link, 'skipped_classifier', classification.reason)
      console.log(`[ingest] Classifier skipped: "${article.title.slice(0, 70)}" — ${classification.reason}`)
      return
    }

    if (!classification) {
      console.log(`[ingest] Classifier inconclusive, analyzing: "${article.title.slice(0, 70)}"`)
    }

    progress.articles_analyzed++
    console.log(`[ingest] Analyzing: "${article.title.slice(0, 70)}"`)

    try {
      // Resolve Google News redirect URLs FIRST so enrichment fetches the
      // real publisher page, not Google's interstitial.
      const resolvedUrl = await resolveSourceUrlSafe(article.link)
      const enrichedArticle = await enrichArticleForAnalysis(article, resolvedUrl)
      const result = await processArticle(enrichedArticle, resolvedUrl)
      if (result === 'saved_strong' || result === 'saved_watchlist') {
        progress.articles_new++
      }
      await updateRawArticleAfterProcessing(article.link, result, enrichedArticle.content, priorAttempts)
    } catch (err) {
      const msg = `${source.name} / "${article.title.slice(0, 60)}": ${err instanceof Error ? err.message : String(err)}`
      progress.errors.push(msg)
      // 'failed' is retryable: the next run reclaims this article until
      // MAX_ANALYSIS_ATTEMPTS is reached. Never tombstone on a transient error.
      await updateRawArticleStatus(article.link, 'failed', msg, undefined, priorAttempts)
      console.error(`[ingest] Article error: ${msg}`)
    }
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      const idx = takeNext()
      if (idx === null) return
      await processCandidate(candidates[idx])
      completed++
      const pct = candidates.length === 0
        ? 95
        : 40 + Math.round((completed / candidates.length) * 55)
      await updateRunProgress(
        runId,
        progress,
        `Processed ${completed} of ${candidates.length} candidates — ${progress.articles_new} saved`,
        Math.min(97, pct),
      )
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, Math.max(candidates.length, 1)) }, worker),
  )

  const deferred = candidates.length - nextIndex
  if (deferred > 0) {
    const note = `Time budget reached — ${deferred} candidate(s) deferred to the next run`
    progress.errors.push(note)
    console.warn(`[ingest] ${note}`)
  }

  const finalStep = deferred > 0
    ? `Research complete — ${deferred} deferred to next run`
    : 'Research complete'

  const finalUpdate = {
    finished_at: new Date().toISOString(),
    sources_count: sources.length,
    articles_found: progress.articles_found,
    raw_articles_new: progress.raw_articles_new,
    raw_articles_duplicate: progress.raw_articles_duplicate,
    articles_skipped_old: progress.articles_skipped_old,
    articles_skipped_irrelevant: progress.articles_skipped_irrelevant,
    articles_analyzed: progress.articles_analyzed,
    articles_new: progress.articles_new,
    errors: progress.errors,
    current_step: finalStep,
    progress_percent: 100,
    status: 'done',
  }

  // Write failed_sources too, but tolerate the column not existing yet
  // (migration 2026-06-09). A failed final update would strand the run as
  // 'running' forever, so fall back to the legacy column set on error.
  const { error: finishError } = await supabase
    .from('ingestion_runs')
    .update({ ...finalUpdate, failed_sources: progress.failed_sources })
    .eq('id', runId)
  if (finishError) {
    const { error: fallbackError } = await supabase
      .from('ingestion_runs')
      .update(finalUpdate)
      .eq('id', runId)
    if (fallbackError) {
      console.error('[ingest] FAILED to finalize run record:', fallbackError.message)
    }
  }

  console.log(
    `[ingest] Finished — ${progress.articles_new} saved / ${progress.articles_found} found / ` +
    `${progress.articles_analyzed} deeply analyzed / ${progress.failed_sources.length} failed sources` +
    (deferred > 0 ? ` / ${deferred} deferred` : ''),
  )

  return {
    success: true,
    partial: deferred > 0,
    run_id: runId,
    sources_processed: sources.length,
    articles_found: progress.articles_found,
    raw_articles_new: progress.raw_articles_new,
    raw_articles_duplicate: progress.raw_articles_duplicate,
    articles_skipped_old: progress.articles_skipped_old,
    articles_skipped_irrelevant: progress.articles_skipped_irrelevant,
    articles_analyzed: progress.articles_analyzed,
    articles_new: progress.articles_new,
    errors: progress.errors,
    failed_sources: progress.failed_sources,
  }
}

// ─── Candidate preparation ─────────────────────────────────────────────────

async function prepareCandidateArticles(
  sourceResults: SourceFetchResult[],
  freshnessCutoff: Date,
  runId: string,
  progress: IngestProgress,
): Promise<CandidateArticle[]> {
  const candidates: CandidateArticle[] = []

  for (const [sourceIndex, { source, articles, error }] of sourceResults.entries()) {
    if (candidates.length >= MAX_NEW_PER_RUN) break

    const prepPercent = 15 + Math.round((sourceIndex / Math.max(sourceResults.length, 1)) * 25)
    await updateRunProgress(runId, progress, `Preparing candidates from ${source.name}`, prepPercent)

    if (error) {
      progress.errors.push(error)
      progress.failed_sources.push(source.name)
      continue
    }
    if (articles.length === 0) continue

    let sourceCandidates = 0
    for (const article of articles) {
      if (candidates.length >= MAX_NEW_PER_RUN) break
      if (sourceCandidates >= MAX_PER_SOURCE) break
      if (!article.link || !article.title) continue

      const rawStatus = await storeRawArticle(article, source.url, runId)
      if (rawStatus.status === 'duplicate') {
        progress.raw_articles_duplicate++
        await updateRunProgress(runId, progress, `Skipping already stored articles from ${source.name}`, prepPercent)
        continue
      }

      let priorAttempts = 0
      if (rawStatus.status === 'retry') {
        // Seen before but never successfully analyzed (still 'new' after a
        // killed run, or 'failed' after a transient error) — reclaim it.
        priorAttempts = rawStatus.attempts
        console.log(`[ingest] Reclaiming unprocessed article (attempt ${priorAttempts + 1}): "${article.title.slice(0, 60)}"`)
      } else if (rawStatus.status === 'error') {
        progress.errors.push(rawStatus.error)
        const isDup = await isAlreadyAnalyzed(article.link)
        if (isDup) {
          progress.raw_articles_duplicate++
          continue
        }
      } else {
        progress.raw_articles_new++
      }

      if (isOlderThan(article.pubDate, freshnessCutoff)) {
        progress.articles_skipped_old++
        await updateRawArticleStatus(article.link, 'skipped_old', `Published before ${freshnessCutoff.toISOString().slice(0, 10)}`)
        continue
      }

      if (!looksRelevantEnough(article)) {
        progress.articles_skipped_irrelevant++
        await updateRawArticleStatus(article.link, 'skipped_irrelevant', 'No development/real-estate/architecture/urban/infrastructure signal in title or snippet')
        continue
      }

      candidates.push({ source, article, priorAttempts })
      sourceCandidates++
    }
  }

  return candidates
}

// ─── Per-article persistence ───────────────────────────────────────────────

type ProcessResult = 'saved_strong' | 'saved_watchlist' | 'archived' | 'error'

// `resolvedUrl` is the publisher URL (Google News redirects already resolved
// by the caller, who also used it for content enrichment). Stored as
// source_url so downstream Jina/find-firms flows get a clean URL.
// Throws on analysis failure — the caller records 'failed' (retryable).
async function processArticle(article: RawArticleFromRSS, resolvedUrl: string): Promise<ProcessResult> {
  const supabase = getSupabaseAdmin()
  const analysis = await analyzeArticle(article.title, article.content, article.link)

  let discoveryScore = computeDiscoveryScore(analysis.scores)
  let tier: DiscoverySignalTier = analysis.signal_tier ?? scoreToTier(discoveryScore)

  // Deterministic geo cap: out-of-target discoveries can never be strong
  // opportunities, however good the project. Enforced in code — not in the
  // prompt — so rubric drift can't reintroduce geography bleed (Brisbane /
  // Chicago / Dubai articles were tiering strong at 65–79).
  if (!isInTargetGeo(analysis.region)) {
    discoveryScore = Math.min(discoveryScore, OUT_OF_GEO_SCORE_CAP)
    if (tier === 'strong_opportunity') tier = 'watchlist'
  }

  if (tier === 'archive') {
    await recordAnalyzed(article, 'archive')
    return 'archived'
  }

  // ICP-fit: a second, additive axis — does this match the kind of deal oaki
  // sells into? sector_fit is derived from the sector the analyzer picked; the
  // rest are extracted ICP signals. combined_score is DB-generated (not written).
  const sectorFit = sectorFitFromSector(analysis.sector)
  const icp = computeIcpFit({
    tenure: analysis.tenure,
    has_for_sale_residential: analysis.has_for_sale_residential,
    project_stage: analysis.project_stage,
    sector_fit: sectorFit,
    viz_buyer_role: analysis.viz_buyer_role,
    est_scale_vs_floor: analysis.est_scale_vs_floor,
    incumbent_viz: analysis.incumbent_viz,
    region: analysis.region,
  })

  const { error } = await supabase.from('discoveries').insert({
    title: analysis.title || article.title,
    date_published: article.pubDate ? safeIsoDate(article.pubDate) : null,
    source: article.sourceName,
    source_url: resolvedUrl,
    source_type: 'rss',

    region: analysis.region,
    city: analysis.city,
    country: analysis.country,

    sector: analysis.sector,
    project_type: analysis.project_type,
    opportunity_type: analysis.opportunity_type,
    target_client_types: analysis.target_client_types,

    investment_size: analysis.investment_size,
    timeline: analysis.timeline,
    main_actors: analysis.main_actors,
    developer: analysis.developer,
    architect: analysis.architect,
    government_body: analysis.government_body,

    brief_summary: analysis.brief_summary,
    why_it_matters: analysis.why_it_matters,
    deep_analysis: analysis.deep_analysis,
    suggested_action: analysis.suggested_action,
    tags: analysis.tags,

    signal_tier: tier,
    discovery_score: discoveryScore,
    urgency_score: analysis.urgency_score,
    confidence_score: analysis.confidence_score,

    score_opportunity_clarity: analysis.scores.opportunity_clarity,
    score_investment_size:     analysis.scores.investment_size,
    score_timing:              analysis.scores.timing,
    score_actors:              analysis.scores.actors,
    score_sector_growth:       analysis.scores.sector_growth,
    score_region_strategic:    analysis.scores.region_strategic,

    // ICP-fit layer (combined_score is DB-generated — never inserted)
    tenure:                   analysis.tenure,
    has_for_sale_residential: analysis.has_for_sale_residential,
    project_stage:            analysis.project_stage,
    sector_fit:               sectorFit,
    viz_buyer_role:           analysis.viz_buyer_role,
    viz_buyer_entity:         analysis.viz_buyer_entity,
    incumbent_viz:            analysis.incumbent_viz,
    est_scale_vs_floor:       analysis.est_scale_vs_floor,
    icp_fit_score:            icp.icp_fit_score,
    fit_tier:                 icp.fit_tier,
    fit_reason:               icp.fit_reason,
    partner_radar:            icp.partner_radar,

    status: 'active',
    raw_content: article.content.slice(0, 5000),
  })

  if (error) {
    if (error.code === '23505') {
      // Same story already saved as a discovery (e.g. reached via another
      // feed that resolved to the same publisher URL). A duplicate is not a
      // failure — record it so it stops being retried.
      console.log(`[ingest] Duplicate discovery (already saved): "${article.title.slice(0, 60)}"`)
      await recordAnalyzed(article, tier)
      return 'archived'
    }
    console.error('[ingest] discoveries insert error:', error.message)
    return 'error'
  }

  await recordAnalyzed(article, tier)
  console.log(`[ingest] Saved ${tier === 'strong_opportunity' ? 'STRONG' : 'WATCHLIST'}: "${article.title.slice(0, 60)}"`)
  return tier === 'strong_opportunity' ? 'saved_strong' : 'saved_watchlist'
}

async function recordAnalyzed(article: RawArticleFromRSS, tier: DiscoverySignalTier): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('analyzed_articles').insert({
    url: article.link,
    title: article.title,
    source: article.sourceName,
    published_at: article.pubDate ? safeIsoDate(article.pubDate) : null,
    signal_tier: tier,
  })
  if (error && error.code !== '23505') {
    console.warn('[ingest] analyzed_articles insert warning:', error.message)
  }
}

// ─── Raw-article tracking ──────────────────────────────────────────────────

type RawStoreResult =
  | { status: 'inserted' }
  | { status: 'duplicate' }
  | { status: 'retry'; attempts: number }
  | { status: 'error'; error: string }

async function storeRawArticle(article: RawArticleFromRSS, sourceFeedUrl: string, runId: string): Promise<RawStoreResult> {
  const supabase = getSupabaseAdmin()
  const normalizedUrl = normalizeArticleUrl(article.link)
  const publishedAt = article.pubDate ? safeIsoDate(article.pubDate) : null

  const { error } = await supabase.from('raw_articles').insert({
    url: article.link,
    normalized_url: normalizedUrl,
    title: article.title,
    source: article.sourceName,
    source_feed_url: sourceFeedUrl,
    published_at: publishedAt,
    raw_content: article.content.slice(0, 10_000),
    research_run_id: runId,
    status: 'new',
  })

  if (!error) return { status: 'inserted' }
  if (error.code === '23505') {
    // Already stored. Distinguish "fully handled" from "never successfully
    // analyzed": rows still 'new' (a previous run was killed mid-flight) or
    // 'failed' (transient analysis error) get reclaimed as candidates until
    // MAX_ANALYSIS_ATTEMPTS is exhausted.
    const { data: existing } = await supabase
      .from('raw_articles')
      .select('status, analysis_attempts')
      .eq('normalized_url', normalizedUrl)
      .maybeSingle()

    await supabase
      .from('raw_articles')
      .update({
        last_seen_at: new Date().toISOString(),
        research_run_id: runId,
      })
      .eq('normalized_url', normalizedUrl)

    const attempts = Number(existing?.analysis_attempts ?? 0)
    const reclaimable =
      existing &&
      (existing.status === 'new' || existing.status === 'failed') &&
      attempts < MAX_ANALYSIS_ATTEMPTS

    if (reclaimable) return { status: 'retry', attempts }
    return { status: 'duplicate' }
  }
  return { status: 'error', error: `raw_articles insert failed: ${error.message}` }
}

async function updateRawArticleAfterProcessing(
  url: string,
  result: ProcessResult,
  rawContent?: string,
  priorAttempts?: number,
): Promise<void> {
  const statusByResult: Record<ProcessResult, string> = {
    saved_strong:    'saved_discovery',
    saved_watchlist: 'saved_discovery',
    archived:        'archived',
    error:           'failed',
  }
  await updateRawArticleStatus(url, statusByResult[result], undefined, rawContent, priorAttempts)
}

async function updateRawArticleStatus(
  url: string,
  status: string,
  skipReason?: string,
  rawContent?: string,
  priorAttempts?: number,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const normalizedUrl = normalizeArticleUrl(url)
  const update: Record<string, string | number | null> = {
    status,
    skip_reason: skipReason ?? null,
    last_seen_at: new Date().toISOString(),
  }

  if (status === 'saved_discovery' || status === 'archived' || status === 'failed') {
    update.analyzed_at = new Date().toISOString()
    update.analysis_attempts = (priorAttempts ?? 0) + 1
  }
  if (rawContent) {
    update.raw_content = rawContent.slice(0, 10_000)
  }

  const { error } = await supabase
    .from('raw_articles')
    .update(update)
    .eq('normalized_url', normalizedUrl)

  if (error && error.code !== '42P01') {
    console.warn('[ingest] raw_articles update warning:', error.message)
  }
}

// ─── Run progress tracking ─────────────────────────────────────────────────

async function updateRunProgress(
  runId: string,
  progress: IngestProgress,
  currentStep: string,
  progressPercent: number,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      articles_found: progress.articles_found,
      raw_articles_new: progress.raw_articles_new,
      raw_articles_duplicate: progress.raw_articles_duplicate,
      articles_skipped_old: progress.articles_skipped_old,
      articles_skipped_irrelevant: progress.articles_skipped_irrelevant,
      articles_analyzed: progress.articles_analyzed,
      articles_new: progress.articles_new,
      errors: progress.errors,
      current_step: currentStep,
      progress_percent: Math.max(0, Math.min(99, progressPercent)),
    })
    .eq('id', runId)

  if (error && error.code !== '42703') {
    console.warn('[ingest] progress update warning:', error.message)
  }
}

// ─── Source fetching ───────────────────────────────────────────────────────

async function fetchSourceArticles(source: Source): Promise<SourceFetchResult> {
  try {
    const articles = await fetchRSSFeed(source.url, source.name)
    return { source, articles }
  } catch (err) {
    return {
      source,
      articles: [],
      error: `${source.name}: fetch failed — ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── Content enrichment (paywall-tolerant best effort) ─────────────────────

// `fetchUrl` is the resolved publisher URL — fetching the raw Google News
// redirect URL used to return Google's interstitial page as "content".
async function enrichArticleForAnalysis(
  article: RawArticleFromRSS,
  fetchUrl?: string,
): Promise<RawArticleFromRSS> {
  if (article.content.trim().length >= MIN_CONTENT_LENGTH_FOR_ANALYSIS) return article

  const enrichedContent = await fetchArticleText(fetchUrl ?? article.link)
  if (!enrichedContent || enrichedContent.length <= article.content.length) return article

  return { ...article, content: enrichedContent }
}

async function fetchArticleText(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'OakiDiscoveries/1.0 (research reader)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null

    const html = await response.text()
    return stripHtmlForAnalysis(html).slice(0, 8000)
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function stripHtmlForAnalysis(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function isAlreadyAnalyzed(url: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const [analyzed, discovery] = await Promise.all([
    supabase.from('analyzed_articles').select('id').eq('url', url).maybeSingle(),
    supabase.from('discoveries').select('id').eq('source_url', url).maybeSingle(),
  ])
  return !!(analyzed.data ?? discovery.data)
}

function normalizeArticleUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith('utm_') ||
        ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())
      ) {
        parsed.searchParams.delete(key)
      }
    }
    return parsed.toString()
  } catch {
    return url.trim()
  }
}

function safeIsoDate(pubDate: string): string | null {
  const date = new Date(pubDate)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isOlderThan(pubDate: string | null, cutoff: Date): boolean {
  if (!pubDate) return false
  const date = new Date(pubDate)
  return !Number.isNaN(date.getTime()) && date < cutoff
}

const RELEVANCE_KEYWORDS = [
  'adaptive reuse', 'airport', 'architecture', 'architect', 'brownfield',
  'building', 'capital improvement', 'commercial real estate', 'construction',
  'cultural district', 'developer', 'development', 'downtown', 'hotel',
  'housing', 'infrastructure', 'interior design', 'investment', 'land use',
  'master plan', 'mixed-use', 'mixed use', 'office tower', 'planning approval',
  'project', 'property', 'public realm', 'real estate', 'redevelopment',
  'renovation', 'residential', 'resort', 'rezoning', 'rfp', 'tender',
  'transit', 'urban', 'urbanism', 'zoning',
  'aeroport', 'amenagement', 'chantier', 'developpement', 'immobilier',
  'logement', 'urbanisme',
]

function looksRelevantEnough(article: RawArticleFromRSS): boolean {
  const haystack = `${article.title} ${article.content}`.toLowerCase()
  return RELEVANCE_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

