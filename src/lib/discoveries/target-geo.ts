// Single source of truth for Oaki's target geography. Consumed by the triage
// classifier prompt, both analyzer prompts, gate-0, the deterministic score cap
// and the firm-pool join — entering a new market is a change here, not five
// prompt edits.
//
// 2027 ruling (Demian, 26-Nov-2026): "Se busca por dónde está la firma, no por
// dónde está el proyecto." Two concepts that used to be one list:
//
//   • FIRM geography   — where the design/development firms we write to are
//                        based. THIS decides scope.
//   • PROJECT geography — where the work is. A ranking input, never a filter
//                        for US work. New York firms mostly design projects
//                        outside New York.
//
// Europe is out for 2027 as a region of interest (existing European leads and
// the `europe` geo value stay — Naos and Lawrence and Long are clients). Abroad,
// the project regions of interest are the Caribbean and the Middle East.

import type { Geo } from '@/lib/types'

// ── Firm geography (decides scope) ──────────────────────────────────────────

// Order is the working priority (seats, join ordering): New York, South
// Florida (Palm Beach folds in here), California, Seattle, then Chicago and DC.
export const FOCUS_FIRM_GEOS = [
  'nyc', 'south_florida', 'california', 'seattle', 'chicago', 'dc',
] as const satisfies readonly Geo[]

// Chicago and Washington DC are focus geos for HAND-PICKED firms only: the pool
// holds a short list of large hospitality design firms there, with no broad
// sourcing. A Chicago/DC firm named in an article therefore does not put a
// signal in scope by itself and is never auto-added to the pool.
export const HAND_PICKED_FIRM_GEOS = ['chicago', 'dc'] as const satisfies readonly Geo[]

// Focus geos where any fitting firm is a target.
export const OPEN_FOCUS_FIRM_GEOS = FOCUS_FIRM_GEOS.filter(
  (g) => !(HAND_PICKED_FIRM_GEOS as readonly string[]).includes(g),
) as readonly Geo[]

export function isFocusFirmGeo(geo: string | null | undefined): geo is Geo {
  return !!geo && (FOCUS_FIRM_GEOS as readonly string[]).includes(geo)
}

export function isOpenFocusFirmGeo(geo: string | null | undefined): geo is Geo {
  return !!geo && (OPEN_FOCUS_FIRM_GEOS as readonly string[]).includes(geo)
}

// Sort key: focus geos first, in FOCUS_FIRM_GEOS order; everything else after.
export function focusGeoRank(geo: string | null | undefined): number {
  const i = (FOCUS_FIRM_GEOS as readonly string[]).indexOf(geo ?? '')
  return i === -1 ? FOCUS_FIRM_GEOS.length : i
}

// Normalized headquarters bucket the analyzers return for every firm an article
// names. The firm-pool `geo` vocabulary plus 'unknown'.
export const FIRM_HQ_GEOS = [
  'nyc', 'south_florida', 'california', 'seattle', 'chicago', 'dc',
  'europe', 'middle_east', 'other', 'unknown',
] as const
export type FirmHqGeo = (typeof FIRM_HQ_GEOS)[number]

// ── Project geography (ranking input) ───────────────────────────────────────

// The `region` enum both analyzer prompts return — where the PROJECT is.
// 'France' is legacy (pre-2027 rows); new analyses fold it into 'Europe'.
export const PROJECT_REGIONS = [
  'New York', 'Miami', 'California', 'Seattle', 'US Other',
  'Caribbean', 'Middle East', 'Europe', 'Other',
] as const
export type ProjectRegion = (typeof PROJECT_REGIONS)[number]

// Pipe-joined for the prompts' JSON templates.
export const PROJECT_REGION_ENUM = PROJECT_REGIONS.join('|')

// Project regions that coincide with an open focus firm geo — the work is in a
// focus market itself.
const FOCUS_PROJECT_REGIONS: readonly string[] = ['New York', 'Miami', 'California', 'Seattle']
const US_PROJECT_REGIONS: readonly string[] = [...FOCUS_PROJECT_REGIONS, 'US Other']

// Puerto Rico is a US territory: the analyzer may name it as the country.
const US_COUNTRY = /^(united states( of america)?|u\.?s\.?a?\.?|america|puerto rico)$/i

// Middle East + Caribbean-luxury country allow-lists (standing rulings; kept as
// they were in gate-0). These are the project regions of interest abroad. Egypt
// is deliberately absent (killed 25-Aug-2026).
export const MIDDLE_EAST_ALLOW =
  /united arab emirates|\buae\b|dubai|abu dhabi|saudi|qatar|kuwait|bahrain|oman|israel|jordan/i
export const CARIBBEAN_ALLOW =
  /bahamas|turks|caicos|st\.? ?barth|barbados|anguilla|antigua|cayman|bermuda|virgin islands|st\.? ?(lucia|kitts|martin)|dominican republic|jamaica/i

export function isUSProject(region: string | null | undefined, country?: string | null): boolean {
  if (US_PROJECT_REGIONS.includes((region ?? '').trim())) return true
  // Legacy rows carry region 'Other' for the rest of the US; the country tells.
  return US_COUNTRY.test((country ?? '').trim())
}

export function isFocusProjectRegion(region: string | null | undefined): boolean {
  return FOCUS_PROJECT_REGIONS.includes((region ?? '').trim())
}

// Caribbean / Middle East project in an allow-listed country. When the analyzer
// labels the region but leaves the country blank, the label is trusted.
export function isAbroadRegionOfInterest(region: string | null | undefined, country?: string | null): boolean {
  const c = (country ?? '').trim()
  if (c) return MIDDLE_EAST_ALLOW.test(c) || CARIBBEAN_ALLOW.test(c)
  const r = (region ?? '').trim()
  return r === 'Caribbean' || r === 'Middle East'
}

// ── Scope: one function for gate-0, the score cap and the geography points ──

export type GeoFit = 'full' | 'partial' | 'none'

export interface GeoFitInput {
  region: string | null | undefined
  country?: string | null
  // hq_geo of every firm the ARTICLE names as designer / architect / developer
  // of the work (not the analyzer's illustrative examples).
  namedFirmGeos?: readonly (string | null | undefined)[] | null
}

/**
 *   full    — a named firm is based in an open focus geo (wherever the project
 *             is), or the project itself is in a focus market.
 *   partial — a US project with no focus-geo firm named yet, or a Caribbean /
 *             Middle East project. In scope: used to reach the pool firms that
 *             fit the profile.
 *   none    — everything else. Rejected at gate-0, score capped.
 */
export function geoFit(input: GeoFitInput): GeoFit {
  if ((input.namedFirmGeos ?? []).some(isOpenFocusFirmGeo)) return 'full'
  if (isFocusProjectRegion(input.region)) return 'full'
  if (isUSProject(input.region, input.country)) return 'partial'
  if (isAbroadRegionOfInterest(input.region, input.country)) return 'partial'
  return 'none'
}

// Share of the geography sub-score each fit earns.
export const GEO_FIT_WEIGHT: Record<GeoFit, number> = { full: 1, partial: 0.6, none: 0 }

export function geoPoints(fit: GeoFit, maxPoints: number): number {
  return Math.round(maxPoints * GEO_FIT_WEIGHT[fit])
}

// Out-of-scope discoveries (geoFit 'none') can never tier above watchlist, and
// their score is capped below the strong_opportunity threshold (70). Enforced
// in code so prompt drift can't reintroduce geography bleed.
export const OUT_OF_GEO_SCORE_CAP = 55

// ── Prompt fragments ────────────────────────────────────────────────────────

export const FOCUS_FIRM_GEO_DESCRIPTION =
  'New York (metro), Miami / South Florida (including Palm Beach), California, and Seattle'

export const PROJECT_SCOPE_DESCRIPTION =
  'anywhere in the United States, plus the Caribbean and the Middle East (UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Israel, Jordan)'

// How to fill a firm's hq_geo. Shared by both analyzers so the buckets match.
export const FIRM_HQ_GEO_GUIDE =
  `hq_geo is the firm's HEADQUARTERS (its main studio), not the project's location and not a satellite office: ` +
  `"nyc" (New York metro) | "south_florida" (Miami, Fort Lauderdale, Palm Beach) | "california" | "seattle" | ` +
  `"chicago" | "dc" (Washington DC, Baltimore, Rockville) | "europe" | "middle_east" | "other" (anywhere else, ` +
  `including the rest of the US) | "unknown" (you do not know — never guess a focus city).`

// ── Project region → firm-pool geo bucket ───────────────────────────────────
// Maps the analyzer's project `region` (+ country / city) onto the firm-pool
// `geo` vocabulary. This is the PROJECT's geo: it orders the firm join (same-geo
// firms first) and must never gate it. Derived in code, not the prompt.

const MIDDLE_EAST_COUNTRIES = [
  'united arab emirates', 'uae', 'saudi arabia', 'saudi', 'qatar', 'kuwait',
  'bahrain', 'oman', 'israel', 'jordan', 'lebanon', 'egypt', 'turkey', 'türkiye',
]

export function regionToGeo(
  region: string | null | undefined,
  country?: string | null,
  city?: string | null,
): Geo {
  const c = (country ?? '').trim().toLowerCase()
  if (c && MIDDLE_EAST_COUNTRIES.some((m) => c.includes(m))) return 'middle_east'

  switch ((region ?? '').trim()) {
    case 'New York':    return 'nyc'
    case 'Miami':       return 'south_florida'
    case 'California':  return 'california'
    case 'Seattle':     return 'seattle'
    case 'Middle East': return 'middle_east'
    case 'France':
    case 'Europe':      return 'europe'
  }

  if (isUSProject(region, country)) {
    const ci = (city ?? '').trim().toLowerCase()
    if (/^chicago\b/.test(ci)) return 'chicago'
    if (/^(washington|baltimore|rockville)\b/.test(ci)) return 'dc'
  }
  return 'other'
}
