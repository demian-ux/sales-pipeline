// Discoveries ingestion pipeline. Ported from Opportunity Terminal, adapted to:
//   - the renamed `discoveries` table (was `opportunities`)
//   - the unified ai client (with timeouts + jsonrepair parsing)
//   - the lazy Supabase admin client
//
// One run = fetch RSS sources in parallel → dedup raw articles → classify
// each candidate cheaply → for the keepers, run deep analysis → store as
// Discovery rows. Caps per-run and per-source to keep cost predictable.

import { getSupabaseAdmin } from '@/lib/supabase'
import { getCompanies } from '@/lib/sheets'
import { classifyArticle } from '@/lib/prompts/discoveries/classify'
import { analyzeArticle } from '@/lib/prompts/discoveries/analyze'
import { analyzeOpportunitySignal } from '@/lib/prompts/discoveries/analyze-opportunity-signal'
import { computeDiscoveryScore, scoreToTier } from './scoring'
import { computeIcpFit, sectorFitFromSector } from './icp'
import { computeOpportunityScore, fitTierFromScore } from './opportunity-score'
import { segmentToSector, getSegmentConfig } from './opportunity-segments'
import { isInTargetGeo, OUT_OF_GEO_SCORE_CAP } from './target-geo'
import { isDropSignalType } from './signal-type'
import { makeProjectKey } from './project-key'
import { extractDiscoveryEntities, matchEntitiesToCompanies, entityMatches } from './roster-match'
import { fetchRSSFeed, type RawArticleFromRSS } from './rss'
import { resolveGoogleNewsUrl, isGoogleNewsUrl } from './googleNewsResolver'
import type { DiscoverySignalTier, Company, DiscoveryKind, SuggestedTargetFirm, FitTier } from '@/lib/types'

// Lightweight company roster snapshot, loaded once per run for already_engaged
// cross-reference (avoids a Sheets read per article).
type CompanyRoster = Pick<Company, 'company_id' | 'company_name'>[]

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
  // Which discovery mode this run is for. 'project_launch' = the original
  // direct-ICP pipeline; 'opportunity_signal' = upstream demand events mapped
  // to target design/dev firms (a different analyzer + scorer + no DROP gate).
  mode: DiscoveryKind = 'project_launch',
): Promise<IngestResult> {
  const supabase = getSupabaseAdmin()

  console.log(`[ingest] Starting (${mode}) — ${sources.length} sources | max ${MAX_NEW_PER_RUN} candidates | max ${MAX_PER_SOURCE}/source`)
  await updateRunProgress(runId, progress, 'Starting research', 1)

  // Supply-health instrumentation: stamp which mode this run is, once. Covers
  // every run-creation path (manual + both cron branches) since they all funnel
  // here. Tolerate 42703 (column not added until the 2026-07-06 migration runs).
  {
    const { error: kindErr } = await supabase
      .from('ingestion_runs')
      .update({ discovery_kind: mode })
      .eq('id', runId)
    if (kindErr && kindErr.code !== '42703') {
      console.warn('[ingest] discovery_kind stamp warning:', kindErr.message)
    }
  }

  // Load the CRM company roster once for already_engaged cross-reference.
  // Tolerate a Sheets failure — cross-ref is additive, never a reason to fail
  // the whole run; the tag just stays false this run.
  let roster: CompanyRoster = []
  try {
    roster = (await getCompanies()).map((c) => ({ company_id: c.company_id, company_name: c.company_name }))
    console.log(`[ingest] Loaded ${roster.length} companies for CRM cross-reference`)
  } catch (err) {
    console.warn(`[ingest] Company roster load failed — already_engaged tagging off this run: ${err instanceof Error ? err.message : err}`)
  }

  // project_keys claimed during THIS run. The DB SELECT in processArticle
  // catches cross-run duplicates; this set closes the within-run race where two
  // concurrent workers both pass the SELECT before either has inserted. The
  // check+add runs synchronously (no await between), so the single-threaded
  // event loop guarantees only one worker can claim a given key.
  const seenProjectKeys = new Set<string>()

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
    // Opportunity-signal mode skips the cheap classifier: it is tuned for the
    // launch lens ("is there a development signal") and would wrongly drop
    // upstream demand events (a museum expansion, a competition, an airport
    // program). Opp volume is lower, so we analyze every prepared candidate.
    if (mode === 'project_launch') {
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
    }

    progress.articles_analyzed++
    console.log(`[ingest] Analyzing (${mode}): "${article.title.slice(0, 70)}"`)

    try {
      // Resolve Google News redirect URLs FIRST so enrichment fetches the
      // real publisher page, not Google's interstitial.
      const resolvedUrl = await resolveSourceUrlSafe(article.link)
      const enrichedArticle = await enrichArticleForAnalysis(article, resolvedUrl)
      const result = mode === 'opportunity_signal'
        ? await processOpportunitySignal(enrichedArticle, resolvedUrl, roster, seenProjectKeys)
        : await processArticle(enrichedArticle, resolvedUrl, roster, seenProjectKeys)
      // articles_new counts new ACTIVE discoveries only. Off-type (DROP) rows are
      // still inserted, but as status='archived' and return 'archived', so they
      // don't inflate this count.
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
async function processArticle(article: RawArticleFromRSS, resolvedUrl: string, roster: CompanyRoster, seenProjectKeys: Set<string>): Promise<ProcessResult> {
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
    // Genuinely off-topic (not even a recognized off-type event). Never inserted.
    await recordAnalyzed(article, 'archive')
    return 'archived'
  }

  // Event-type gate: a recognized off-type event (resale, financing, completion,
  // policy, roundup, infrastructure, …) is still INSERTED — but as status
  // 'archived' so it's auditable/recoverable in the Archived view — rather than
  // surfacing on the active board. KEEP types stay 'active'.
  const isDrop = isDropSignalType(analysis.signal_type)
  const status: 'active' | 'archived' = isDrop ? 'archived' : 'active'

  // Project-level dedup: the same development arriving via a second outlet (a
  // different URL than the source_url unique constraint catches) shouldn't
  // appear twice. Keyed on the analyzer's project_name + city. Only de-dupe
  // KEEP rows against other non-archived rows — drops are already off the board.
  const projectKey = makeProjectKey(analysis.project_name, analysis.city)
  if (!isDrop && projectKey) {
    // Cross-run duplicate: the same project is already on the board from an
    // earlier run.
    const { data: dupe } = await supabase
      .from('discoveries')
      .select('id')
      .eq('project_key', projectKey)
      .eq('discovery_kind', 'project_launch')   // never dedup a launch against an opp row
      .neq('status', 'archived')
      .limit(1)
      .maybeSingle()
    // Within-run duplicate: claim the key synchronously so a concurrent worker
    // processing the same project via a different outlet loses the race here
    // rather than both inserting.
    if (dupe || seenProjectKeys.has(projectKey)) {
      console.log(`[ingest] Duplicate project (already seen): "${analysis.project_name}" — "${article.title.slice(0, 50)}"`)
      await recordAnalyzed(article, tier)
      return 'archived'
    }
    seenProjectKeys.add(projectKey)
  }

  // CRM cross-reference: tag the discovery if a named actor matches a Company
  // already in the roster, so worked firms are badged rather than re-surfaced
  // as new. Off the active board only via the UI filter — never auto-archived.
  const engaged = roster.length
    ? matchEntitiesToCompanies(extractDiscoveryEntities(analysis), roster)
    : null

  // ICP-fit: a second, additive axis — does this match the kind of deal oaki
  // sells into? sector_fit is derived from the sector the analyzer picked; the
  // rest are extracted ICP signals. combined_score is DB-generated (not written).
  const sectorFit = sectorFitFromSector(analysis.sector)
  const icp = computeIcpFit({
    signal_type: analysis.signal_type,
    tenure: analysis.tenure,
    has_for_sale_residential: analysis.has_for_sale_residential,
    project_stage: analysis.project_stage,
    deployment_horizon: analysis.deployment_horizon,
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

    // Event-type gate + project identity + CRM cross-reference
    signal_type:          analysis.signal_type,
    project_name:         analysis.project_name,
    project_key:          projectKey,
    already_engaged:      !!engaged,
    engaged_company_id:   engaged?.company_id ?? null,
    engaged_company_name: engaged?.company_name ?? null,
    // Work-tracking: a firm already in the CRM starts as already_engaged so it
    // drops off the new-signal board into the existing-account view; everything
    // else starts unworked. (2026-07-06)
    work_status:          engaged ? 'already_engaged' : 'unworked',

    // ICP-fit layer (combined_score is DB-generated — never inserted)
    tenure:                   analysis.tenure,
    has_for_sale_residential: analysis.has_for_sale_residential,
    project_stage:            analysis.project_stage,
    // Capital events + entitlement grading (2026-07-06)
    entitlement_evidence:     analysis.entitlement_evidence,
    deployment_horizon:       analysis.deployment_horizon,
    intent_evidence:          analysis.intent_evidence,
    intent_source_url:        analysis.intent_source_url,
    sector_fit:               sectorFit,
    viz_buyer_role:           analysis.viz_buyer_role,
    viz_buyer_entity:         analysis.viz_buyer_entity,
    incumbent_viz:            analysis.incumbent_viz,
    est_scale_vs_floor:       analysis.est_scale_vs_floor,
    icp_fit_score:            icp.icp_fit_score,
    fit_tier:                 icp.fit_tier,
    fit_reason:               icp.fit_reason,
    partner_radar:            icp.partner_radar,

    status,
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

  await recordAnalyzed(article, isDrop ? 'archive' : tier)

  if (isDrop) {
    console.log(`[ingest] Archived off-type (${analysis.signal_type}): "${article.title.slice(0, 60)}"`)
    return 'archived'
  }

  console.log(`[ingest] Saved ${tier === 'strong_opportunity' ? 'STRONG' : 'WATCHLIST'}${engaged ? ` [engaged: ${engaged.company_name}]` : ''}: "${article.title.slice(0, 60)}"`)
  return tier === 'strong_opportunity' ? 'saved_strong' : 'saved_watchlist'
}

// Opportunity-signal counterpart to processArticle. Uses the opportunity-signal
// analyzer + the dedicated (non-dollar-weighted) opportunity score, BYPASSES the
// launch-mode DROP gate and the ICP-fit axis (both score the source org, which
// is never the prospect here), and cross-references the suggested TARGET FIRMS
// (not the source org's actors) against the CRM roster. opportunity_score is
// mirrored into discovery_score so the DB-generated combined_score and every
// existing board sort/index/filter work unchanged for opp rows.
async function processOpportunitySignal(
  article: RawArticleFromRSS,
  resolvedUrl: string,
  roster: CompanyRoster,
  seenProjectKeys: Set<string>,
): Promise<ProcessResult> {
  const supabase = getSupabaseAdmin()
  const analysis = await analyzeOpportunitySignal(article.title, article.content, article.link)

  // Not a real upstream demand signal (named/awarded design team, not a
  // demand-creating event, or off-segment) — record and drop, never inserted.
  if (!analysis.is_opportunity_signal) {
    console.log(`[ingest] Not an opportunity signal: "${article.title.slice(0, 60)}"`)
    await recordAnalyzed(article, 'archive')
    return 'archived'
  }

  const cfg = getSegmentConfig(analysis.segment)
  const opp = computeOpportunityScore({
    segment: analysis.segment,
    creates_design_demand: analysis.creates_design_demand,
    design_scope: analysis.design_scope,
    timing: analysis.timing,
    targets: analysis.targets,
    region: analysis.region,
  })

  // Deterministic geo cap — same guarantee as launch mode: out-of-target work
  // can never tier strong, however good the signal.
  let score = opp.opportunity_score
  let fitTier: FitTier = opp.fit_tier
  if (!isInTargetGeo(analysis.region)) {
    score = Math.min(score, OUT_OF_GEO_SCORE_CAP)
    // The cap lowered the score below its original band — re-derive fit_tier
    // from the capped score so the card badge can never contradict the stored
    // opportunity_score ("Prime 55"). Only downgrade; a hard disqualifier stays.
    if (fitTier !== 'disqualified') fitTier = fitTierFromScore(score)
  }

  // Surfacing + board tier are driven by the opportunity fit_tier (the axis the
  // card shows), NOT scoreToTier — so the badge and the board never disagree.
  // Weak/disqualified signals are recorded but not surfaced (mirrors launch's
  // archive-but-recoverable posture).
  if (fitTier === 'weak' || fitTier === 'disqualified') {
    await recordAnalyzed(article, 'archive')
    return 'archived'
  }
  const tier: DiscoverySignalTier = fitTier === 'prime' ? 'strong_opportunity' : 'watchlist'

  // Event-level dedup — the same program arriving via a second outlet shouldn't
  // appear twice. Scoped to opportunity-signal rows so it never collides with a
  // launch project of a similar name.
  const projectKey = makeProjectKey(analysis.event_name, analysis.city)
  if (projectKey) {
    const { data: dupe } = await supabase
      .from('discoveries')
      .select('id')
      .eq('project_key', projectKey)
      .eq('discovery_kind', 'opportunity_signal')
      .neq('status', 'archived')
      .limit(1)
      .maybeSingle()
    if (dupe || seenProjectKeys.has(projectKey)) {
      console.log(`[ingest] Duplicate opportunity event: "${analysis.event_name}" — "${article.title.slice(0, 50)}"`)
      await recordAnalyzed(article, tier)
      return 'archived'
    }
    seenProjectKeys.add(projectKey)
  }

  // LOCKED RULE (deterministic, not prompt-dependent): never propose emailing
  // the source org. Drop any suggested "target firm" that name-matches the
  // source org BEFORE it can reach the card or the CRM cross-ref, and dedup by
  // name so the list is clean. Mirrors the launch-side posture of keeping safety
  // gates in code (see signal-type.ts), not in the analyzer prompt alone.
  const seenFirm = new Set<string>()
  const cleanFirms = analysis.suggested_target_firms.filter((f) => {
    if (!f.firm) return false
    if (analysis.source_org && entityMatches(f.firm, analysis.source_org)) return false
    const key = f.firm.trim().toLowerCase()
    if (seenFirm.has(key)) return false
    seenFirm.add(key)
    return true
  })
  // Surface a firm the article already named (the stronger, specific lead) ahead
  // of analyzer-suggested candidates for an open brief. Stable within each group.
  cleanFirms.sort((a, b) => Number(b.already_named) - Number(a.already_named))

  // CRM cross-reference on the TARGET FIRMS (the prospects), not the source org.
  // Tag already_engaged when a suggested firm is already a Company, and flag
  // each firm's in_crm for the card badge.
  const firmNames = cleanFirms.map((f) => f.firm)
  const engaged = roster.length ? matchEntitiesToCompanies(firmNames, roster) : null
  const suggestedFirms: SuggestedTargetFirm[] = cleanFirms.map((f) => ({
    firm: f.firm,
    why_fit: f.why_fit,
    geography: f.geography,
    in_crm: roster.length > 0 && roster.some((c) => c.company_name && entityMatches(f.firm, c.company_name)),
    already_named: f.already_named,
    apollo_org_id: null,
    // Suggestions are unverified hints — never a card's primary prospect. Only
    // excavation (with independent evidence) fills verified_principal. (2026-07-06)
    confidence: 'unverified_hint' as const,
  }))

  const { error } = await supabase.from('discoveries').insert({
    title: analysis.title || article.title,
    date_published: article.pubDate ? safeIsoDate(article.pubDate) : null,
    source: article.sourceName,
    source_url: resolvedUrl,
    source_type: 'rss',

    region: analysis.region,
    city: analysis.city,
    country: analysis.country,
    sector: segmentToSector(analysis.segment),

    brief_summary: analysis.brief_summary,
    why_it_matters: analysis.why_it_matters,
    deep_analysis: analysis.deep_analysis,
    suggested_action: analysis.suggested_action,
    tags: analysis.tags,

    signal_tier: tier,
    discovery_score: score,         // mirror → drives combined_score + sort
    opportunity_score: score,
    urgency_score: analysis.urgency_score,
    confidence_score: analysis.confidence_score,

    // Opportunity-signal columns
    discovery_kind: 'opportunity_signal',
    source_org: analysis.source_org,
    signal_event: analysis.signal_event,
    beneficiary_segment: analysis.beneficiary_segment || cfg.label,
    outreach_angle: analysis.outreach_angle,
    suggested_target_firms: suggestedFirms,

    // Reused identity + CRM-cross-ref + fit columns
    project_name: analysis.event_name,
    project_key: projectKey,
    already_engaged: !!engaged,
    engaged_company_id: engaged?.company_id ?? null,
    engaged_company_name: engaged?.company_name ?? null,
    work_status: engaged ? 'already_engaged' : 'unworked',
    fit_tier: fitTier,
    fit_reason: opp.fit_reason,

    status: 'active',
    raw_content: article.content.slice(0, 5000),
  })

  if (error) {
    if (error.code === '23505') {
      console.log(`[ingest] Duplicate opportunity (already saved): "${article.title.slice(0, 60)}"`)
      await recordAnalyzed(article, tier)
      return 'archived'
    }
    console.error('[ingest] opportunity insert error:', error.message)
    return 'error'
  }

  await recordAnalyzed(article, tier)
  console.log(`[ingest] Saved OPPORTUNITY ${tier === 'strong_opportunity' ? 'STRONG' : 'WATCHLIST'} [${cfg.label}]${engaged ? ` [engaged: ${engaged.company_name}]` : ''}: "${article.title.slice(0, 60)}"`)
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
  // Opportunity-signal lanes — demand-creating events the launch keyword set
  // would otherwise pre-drop (museums, lounges, competitions, flagships, …).
  'lounge', 'terminal', 'museum', 'gallery', 'library', 'university', 'civic',
  'cultural', 'competition', 'flagship', 'experience center', 'branded residences',
  'exhibition', 'performing arts', 'hospitality',
  'aeroport', 'amenagement', 'chantier', 'developpement', 'immobilier',
  'logement', 'urbanisme',
]

function looksRelevantEnough(article: RawArticleFromRSS): boolean {
  const haystack = `${article.title} ${article.content}`.toLowerCase()
  return RELEVANCE_KEYWORDS.some((keyword) => haystack.includes(keyword))
}

