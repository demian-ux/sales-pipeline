// Signal → firm-pool join (rewritten 2026-11-26 for the 2027 ruling "se busca
// por dónde está la firma, no por dónde está el proyecto").
//
// Before: firms were matched by category ∩ the PROJECT's geo, so a Nashville
// hotel (geo 'other') reached no firm at all. Now a signal reaches every pool
// firm whose categories fit, across ALL focus firm geos; geography only ORDERS
// the result. Pure functions — the routes do the I/O.

import type { Geo, WorkCategory } from '@/lib/types'
import {
  FOCUS_FIRM_GEOS,
  focusGeoRank,
  isFocusFirmGeo,
  isOpenFocusFirmGeo,
} from '@/lib/discoveries/target-geo'

// The geos the pool query spans. A manual override narrows it to one geo (and
// may be any geo, e.g. 'europe' for a hand-run batch to existing markets).
export function joinGeos(overrideGeo?: string | null): readonly string[] {
  return overrideGeo ? [overrideGeo] : FOCUS_FIRM_GEOS
}

export interface JoinOrderInput {
  // The signal's own (project) geo.
  projectGeo?: string | null
  // hq_geo of the firms the article names.
  namedFirmGeos?: readonly (string | null | undefined)[] | null
}

// Geo order for the join result: firms in the project's own geo first, then
// the geos of the firms the article names (their neighbours compete for the
// same work), then the remaining focus geos in standing priority.
export function geoPriority(input: JoinOrderInput): Geo[] {
  const out: Geo[] = []
  const push = (g: string | null | undefined) => {
    if (isFocusFirmGeo(g) && !out.includes(g)) out.push(g)
  }
  push(input.projectGeo)
  for (const g of input.namedFirmGeos ?? []) push(g)
  for (const g of FOCUS_FIRM_GEOS) push(g)
  return out
}

interface PoolFirmLike {
  categories?: readonly string[] | null
  geo?: string | null
  pool_status?: string | null
  fit_level?: string | null
  signal_ref?: string | null
}

// Inside one geo, clear fits come first: A, then B, then firms with no level
// yet. (Firms researched as not fitting are stored as 'excluded' and never
// reach this point.)
const LEVEL_RANK: Record<string, number> = { A: 0, B: 1, C: 3, X: 4 }
const levelRank = (l: string | null | undefined) => (l && l in LEVEL_RANK ? LEVEL_RANK[l] : 2)

// Firms that belong to a campaign of their own carry this prefix in signal_ref
// (e.g. 'campaign:luxury-homes', the studios that only do private luxury
// homes). They are contactable, but NOT through the general signal join: their
// campaign reads them with GET /api/firm-pool?signal_ref=campaign:<name>.
export const CAMPAIGN_PREFIX = 'campaign:'
export const LUXURY_HOMES_CAMPAIGN = 'campaign:luxury-homes'
export const isCampaignFirm = (f: { signal_ref?: string | null }) => !!f.signal_ref && f.signal_ref.startsWith(CAMPAIGN_PREFIX)

export interface MatchInput extends JoinOrderInput {
  categories: readonly WorkCategory[] | readonly string[]
  // Manual filter (?geo=). When set, only that geo is returned.
  overrideGeo?: string | null
}

/**
 * The firms a signal reaches: category overlap, in a focus firm geo (or the
 * override geo), not excluded/converted — ordered by geoPriority, then by fit
 * level (A before B). The sort is stable, so the caller's order holds inside
 * each geo and level.
 *
 * This is the GENERAL campaign's join: level C firms and firms that belong to
 * a campaign of their own (signal_ref 'campaign:…') are left out.
 */
export function matchPoolFirms<T extends PoolFirmLike>(firms: readonly T[], input: MatchInput): T[] {
  const wanted = new Set<string>(input.categories)
  const geos = joinGeos(input.overrideGeo)
  const priority = geoPriority(input)
  const rank = (geo: string | null | undefined) => {
    const i = priority.indexOf(geo as Geo)
    return i === -1 ? priority.length + focusGeoRank(geo) : i
  }
  return firms
    .filter((f) => f.pool_status !== 'excluded' && f.pool_status !== 'converted')
    .filter((f) => f.fit_level !== 'C' && f.fit_level !== 'X' && !isCampaignFirm(f))
    .filter((f) => (f.categories ?? []).some((c) => wanted.has(c)))
    .filter((f) => !!f.geo && geos.includes(f.geo))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.geo) - rank(b.f.geo) || levelRank(a.f.fit_level) - levelRank(b.f.fit_level) || a.i - b.i)
    .map(({ f }) => f)
}

// ── Example firms → pool candidates ─────────────────────────────────────────

interface ExampleFirmLike {
  firm?: string | null
  hq_geo?: string | null
}

export interface CandidateSeed {
  name: string
  geo: Geo
}

/**
 * Which of a signal's example firms may enter the pool as candidates, and under
 * which geo. A firm is filed under ITS OWN headquarters geo — never the
 * project's — and only when that is an OPEN focus geo: Chicago and DC hold
 * hand-picked firms only, and a firm based anywhere else is not a target.
 *
 * Rows analyzed before 2026-11-26 carry no hq_geo; for those the signal's geo
 * stands in (the old analyzer picked examples "in the target geography"), under
 * the same open-focus rule.
 */
export function candidateSeedsFromExamples(
  examples: readonly ExampleFirmLike[],
  signalGeo?: string | null,
): { seeds: CandidateSeed[]; skipped: { name: string; reason: string }[] } {
  const seeds: CandidateSeed[] = []
  const skipped: { name: string; reason: string }[] = []
  const seen = new Set<string>()
  for (const ex of examples) {
    const name = ex.firm?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const geo = ex.hq_geo == null ? signalGeo : ex.hq_geo
    if (isOpenFocusFirmGeo(geo)) {
      seeds.push({ name, geo })
    } else if (isFocusFirmGeo(geo)) {
      skipped.push({ name, reason: `${geo} holds hand-picked firms only` })
    } else {
      skipped.push({ name, reason: `headquarters not in a focus geo (${geo ?? 'unknown'})` })
    }
  }
  return { seeds, skipped }
}
