// NY-native structured signal sourcing (2026-08-04). NY doesn't announce via
// press — it files papers. This module reads the filings the RSS lanes can't:
//
//   socrata_dob        DOB NOW new-building filings (NYC Open Data, JSON)
//                      → discovery_kind 'permit_filing', COLD-early, medium score
//   socrata_zap        DCP ZAP / ULURP project data (NYC Open Data, JSON)
//                      → discovery_kind 'opportunity_signal' (VALUE lane),
//                        work_categories development+architecture, geo nyc
//   ag_offering_plans  NYS AG offering-plan database — NO public API, and the
//                      JSP search app is not reliably scrapable headless. The
//                      lane exists as a MANUAL step: enter accepted plans via
//                      POST /api/discoveries with discovery_kind 'offering_plan'
//                      (see docs/ny-native-sources.md). A source row of this
//                      type that is switched active fails loudly, not silently.
//
// Rows enter the same discoveries table + dedup machinery as ingested articles
// (findPriorDiscovery on project_key = address/name + city), so a filing that
// later hits the press collapses onto the same row instead of duplicating.

import { getSupabaseAdmin } from '@/lib/supabase'
import { makeProjectKey } from './project-key'
import { findPriorDiscovery, hasInheritedVerdict, noteDuplicateUrl } from './dedup'
import { gate0Reason } from './gate0'
import type { IngestProgress } from './processor'

export const STRUCTURED_SOURCE_TYPES = ['socrata_dob', 'socrata_zap', 'ag_offering_plans'] as const

export interface StructuredSourceRow {
  name: string
  url: string
  source_type?: string | null
}

export function isStructuredSource(source: StructuredSourceRow): boolean {
  return (STRUCTURED_SOURCE_TYPES as readonly string[]).includes(source.source_type ?? '')
}

const FETCH_TIMEOUT_MS = 15_000
const LOOKBACK_DAYS = 120
const MAX_RECORDS_PER_SOURCE = 100
// DOB thresholds (handoff A3): towers or big-budget only.
const DOB_MIN_STORIES = 15
const DOB_MIN_COST = 50_000_000
// ZAP thresholds (handoff A2): only major residential/mixed-use — small-ULURP
// noise is enormous.
const ZAP_MIN_UNITS = 100
const ZAP_MIN_SQFT = 200_000

// Corridor whitelist (handoff A3). Matched against address + job description.
const DOB_CORRIDORS = [
  '57th street', 'west 57', 'east 57', 'billionaire',
  'tribeca', 'west chelsea', 'high line', 'hudson yards',
  'williamsburg', 'greenpoint', 'dumbo',
]
const DOB_BOROUGHS = new Set(['manhattan', 'brooklyn'])

type JsonRecord = Record<string, unknown>

// A normalized filing ready to insert as a discovery row.
interface StructuredSignal {
  discovery_kind: 'permit_filing' | 'opportunity_signal'
  title: string
  project_name: string
  source_url: string
  date_published: string | null
  brief_summary: string
  why_it_matters: string
  developer: string | null
  signal_tier: 'strong_opportunity' | 'watchlist'
  discovery_score: number
  // opportunity_signal extras (ZAP)
  source_org?: string | null
  signal_event?: string | null
  program_scope?: string | null
  work_categories?: string[]
  tags: string[]
}

/**
 * Run every structured (non-RSS) source for a mode, sharing the RSS runner's
 * progress object + run record. Failures are per-source (failed_sources), never
 * a reason to abort the run.
 */
export async function runStructuredIngestion(
  sources: StructuredSourceRow[],
  progress: IngestProgress,
  deadlineMs?: number,
): Promise<void> {
  const seenProjectKeys = new Set<string>()

  for (const source of sources) {
    if (deadlineMs && Date.now() > deadlineMs) {
      progress.errors.push(`Time budget reached before structured source ${source.name}`)
      return
    }
    try {
      const signals = await fetchStructuredSource(source, progress)
      for (const signal of signals) {
        const outcome = await insertStructuredSignal(signal, source.name, seenProjectKeys)
        if (outcome === 'inserted') progress.articles_new++
        else if (outcome === 'duplicate') progress.raw_articles_duplicate++
      }
    } catch (err) {
      const msg = `${source.name}: ${err instanceof Error ? err.message : String(err)}`
      progress.errors.push(msg)
      progress.failed_sources.push(source.name)
      console.error(`[ingest] Structured source failed: ${msg}`)
    }
  }
}

async function fetchStructuredSource(
  source: StructuredSourceRow,
  progress: IngestProgress,
): Promise<StructuredSignal[]> {
  switch (source.source_type) {
    case 'socrata_dob':
      return fetchDobFilings(source, progress)
    case 'socrata_zap':
      return fetchZapProjects(source, progress)
    case 'ag_offering_plans':
      // Deliberate loud failure — see module header. The offering_plan lane is
      // manual until the AG exposes something scrapable.
      throw new Error(
        'NYS AG offering plans have no API — enter Monday pre-sweep finds via POST /api/discoveries with discovery_kind=offering_plan (docs/ny-native-sources.md)',
      )
    default:
      throw new Error(`Unknown structured source_type: ${source.source_type}`)
  }
}

// ── DOB NOW new-building filings (Socrata) ──────────────────────────────────

async function fetchDobFilings(source: StructuredSourceRow, progress: IngestProgress): Promise<StructuredSignal[]> {
  const since = lookbackIso()
  const url =
    `${source.url}?$limit=${MAX_RECORDS_PER_SOURCE}&$order=filing_date%20DESC` +
    `&$where=${encodeURIComponent(`job_type='New Building' AND filing_date>'${since}'`)}`
  const records = await fetchJsonArray(url)
  progress.articles_found += records.length

  const signals: StructuredSignal[] = []
  for (const r of records) {
    const borough = str(r, 'borough').toLowerCase()
    if (!DOB_BOROUGHS.has(borough)) { progress.articles_skipped_irrelevant++; continue }

    const address = [str(r, 'house_no', 'house__', 'house_number'), str(r, 'street_name')]
      .filter(Boolean).join(' ').trim()
    const description = str(r, 'job_description')
    const stories = num(r, 'proposed_no_of_stories')
    const cost = num(r, 'initial_cost')
    const corridorHit = matchesCorridor(`${address} ${description}`)
    const bigEnough = stories >= DOB_MIN_STORIES || cost >= DOB_MIN_COST
    if (!corridorHit || !bigEnough) { progress.articles_skipped_irrelevant++; continue }

    const owner = str(r, 'owner_s_business_name', 'owner_business_name') || null
    const jobId = str(r, 'job_filing_number', 'job__', 'job_number') || address
    const filed = str(r, 'filing_date') || null
    if (!address) { progress.articles_skipped_irrelevant++; continue }

    signals.push({
      discovery_kind: 'permit_filing',
      title: `NB filing — ${address}, ${cap(borough)}`,
      project_name: address,
      source_url: `https://data.cityofnewyork.us/resource/w9ak-ipjd.json#${encodeURIComponent(jobId)}`,
      date_published: filed,
      brief_summary:
        `DOB new-building filing at ${address}, ${cap(borough)}: ` +
        `${stories ? `${stories} stories` : 'stories n/a'}, ` +
        `${cost ? `est. cost $${Math.round(cost / 1_000_000)}M` : 'cost n/a'}` +
        `${owner ? `, owner ${owner}` : ''}. ${description}`.trim(),
      why_it_matters:
        'Pre-design window — the site exists, the design does not. The angle that converted on Extell 65th St. Speculative hook: the draft carries a conditional per the skill.',
      developer: owner,
      signal_tier: 'watchlist',
      discovery_score: 55,
      tags: ['ny-native', 'dob', 'permit'],
    })
  }
  return signals
}

// ── DCP ZAP / ULURP projects (Socrata) ──────────────────────────────────────

async function fetchZapProjects(source: StructuredSourceRow, progress: IngestProgress): Promise<StructuredSignal[]> {
  const since = lookbackIso()
  const url =
    `${source.url}?$limit=${MAX_RECORDS_PER_SOURCE}&$order=app_filed_date%20DESC` +
    `&$where=${encodeURIComponent(`app_filed_date>'${since}' AND dcp_visibility='General Public'`)}`
  const records = await fetchJsonArray(url)
  progress.articles_found += records.length

  const signals: StructuredSignal[] = []
  for (const r of records) {
    const name = str(r, 'project_name')
    const brief = str(r, 'project_brief')
    const applicant = str(r, 'primary_applicant') || null
    const projectId = str(r, 'project_id')
    if (!name || !projectId) { progress.articles_skipped_irrelevant++; continue }

    // Major residential/mixed-use only: the brief must talk about that kind of
    // program AND clear a scale bar (units or sqft parsed from the brief).
    const residential = /residential|mixed[- ]use|dwelling|apartment|housing|hotel/i.test(brief)
    const units = extractNumber(brief, /([\d,]+)\s*(?:dwelling\s+)?(?:units|dwellings|apartments|residences)/i)
    const sqft = extractNumber(brief, /([\d,]+)\s*(?:sf|sq\.?\s*ft|square[- ]feet|square[- ]foot)/i)
    const major = units >= ZAP_MIN_UNITS || sqft >= ZAP_MIN_SQFT
    if (!residential || !major) { progress.articles_skipped_irrelevant++; continue }

    const stage = str(r, 'current_milestone') || str(r, 'ulurp_non')
    signals.push({
      discovery_kind: 'opportunity_signal',
      title: `ULURP/ZAP — ${name}`,
      project_name: name,
      source_url: `https://zap.planning.nyc.gov/projects/${projectId}`,
      date_published: str(r, 'app_filed_date') || null,
      brief_summary: brief.slice(0, 1200),
      why_it_matters:
        'Rezonings/ULURPs unlock districts years before the buildings — the NY version of Trafford (Brooklyn Marine Terminal came from here). Upstream value-lane signal.',
      developer: applicant,
      source_org: applicant,
      signal_event: `ULURP/ZAP filing${stage ? ` — ${stage}` : ''} (${str(r, 'ulurp_numbers') || projectId})`,
      program_scope: brief.slice(0, 600),
      work_categories: ['development', 'architecture'],
      signal_tier: 'watchlist',
      discovery_score: 60,
      tags: ['ny-native', 'zap', 'ulurp'],
    })
  }
  return signals
}

// ── Persistence (shared) ────────────────────────────────────────────────────

type InsertOutcome = 'inserted' | 'duplicate' | 'error'

async function insertStructuredSignal(
  signal: StructuredSignal,
  sourceName: string,
  seenProjectKeys: Set<string>,
): Promise<InsertOutcome> {
  const supabase = getSupabaseAdmin()

  // Dedup by address/name + city — the handoff's "dirección+sponsor, not just
  // title" requirement: the key IS the address for DOB, the project name for ZAP.
  const projectKey = makeProjectKey(signal.project_name, 'New York')
  if (projectKey) {
    const prior = await findPriorDiscovery(supabase, projectKey)
    if (prior) {
      if (hasInheritedVerdict(prior) || prior.status !== 'archived') {
        await noteDuplicateUrl(supabase, prior.id, signal.source_url)
        return 'duplicate'
      }
    }
    if (seenProjectKeys.has(projectKey)) return 'duplicate'
    seenProjectKeys.add(projectKey)
  }

  // Gate-0 on the filing text (affordable/conversion noise etc. — handoff A1/C).
  const gate0 = gate0Reason({
    title: signal.title,
    brief_summary: signal.brief_summary,
    region: 'New York',
    country: 'USA',
  })

  const isOpp = signal.discovery_kind === 'opportunity_signal'
  const { error } = await supabase.from('discoveries').insert({
    title: signal.title,
    date_published: signal.date_published,
    source: sourceName,
    source_url: signal.source_url,
    source_type: 'api',

    region: 'New York',
    city: 'New York',
    country: 'USA',
    geo: 'nyc',

    brief_summary: signal.brief_summary,
    why_it_matters: signal.why_it_matters,
    tags: signal.tags,
    developer: signal.developer,

    discovery_kind: signal.discovery_kind,
    signal_tier: signal.signal_tier,
    discovery_score: signal.discovery_score,
    ...(isOpp
      ? {
          opportunity_score: signal.discovery_score,
          source_org: signal.source_org,
          signal_event: signal.signal_event,
          program_scope: signal.program_scope,
          work_categories: signal.work_categories,
          briefs_status: 'unawarded',
          future_work_test: true,
          future_work_reason: 'Entitlement filing — buildings, briefs, and teams all still ahead',
          fit_tier: 'workable',
        }
      : {
          signal_type: 'approval_filing',
        }),

    project_name: signal.project_name,
    project_key: projectKey,
    work_status: gate0 ? 'rejected' : 'unworked',
    work_reason: gate0 ? `ingestion gate-0: ${gate0}` : null,

    status: 'active',
  })

  if (error) {
    if (error.code === '23505') return 'duplicate'
    console.error(`[ingest] structured insert error (${sourceName}):`, error.message)
    return 'error'
  }
  console.log(`[ingest] Saved ${signal.discovery_kind}${gate0 ? ` [gate-0: ${gate0}]` : ''}: "${signal.title.slice(0, 70)}"`)
  return 'inserted'
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJsonArray(url: string): Promise<JsonRecord[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'OakiDiscoveries/1.0 (research reader)' },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error('Expected a JSON array (Socrata resource endpoint)')
    return data as JsonRecord[]
  } finally {
    clearTimeout(timeoutId)
  }
}

function lookbackIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - LOOKBACK_DAYS)
  return d.toISOString().slice(0, 19)
}

// Tolerant field access — DOB dataset schemas vary between BIS and DOB NOW.
function str(r: JsonRecord, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return ''
}

function num(r: JsonRecord, ...keys: string[]): number {
  const raw = str(r, ...keys)
  const parsed = Number(raw.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function extractNumber(text: string, pattern: RegExp): number {
  const m = text.match(pattern)
  if (!m) return 0
  const parsed = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function matchesCorridor(text: string): boolean {
  const t = text.toLowerCase()
  return DOB_CORRIDORS.some((c) => t.includes(c))
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}
