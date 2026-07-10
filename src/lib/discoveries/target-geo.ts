// Single source of truth for Oaki's target geography. Consumed by the triage
// classifier prompt, the deep-analysis scoring rubric, and the deterministic
// tier cap in the processor — entering a new market is a change here, not
// three prompt edits.

// Must match the `region` enum the analyze prompt returns.
export const TARGET_REGIONS = ['New York', 'Miami', 'France', 'Europe'] as const

// Human-readable description injected into prompts.
export const TARGET_GEO_DESCRIPTION =
  'New York (metro), Miami / South Florida, France (especially Paris), and major European cities (London, Milan, Madrid, Amsterdam, etc.)'

export function isInTargetGeo(region: string | null | undefined): boolean {
  return !!region && (TARGET_REGIONS as readonly string[]).includes(region)
}

// Out-of-target discoveries can never tier above watchlist, and their score is
// capped below the strong_opportunity threshold (70). Enforced in code so
// prompt drift can't reintroduce geography bleed.
export const OUT_OF_GEO_SCORE_CAP = 55

// ── Firm-pool geo bucket (2026-07-10) ───────────────────────────────────────
// Maps the analyzer's coarse `region` (+ country for Middle-East detection)
// onto the value-lane firm-pool's `geo` vocabulary, so a signal joins to the
// firm population by geo. Derived in code, not the prompt, so it can't drift.
// Note the region→geo widening: Miami → South Florida, France → Europe.
import type { Geo } from '@/lib/types'

const MIDDLE_EAST_COUNTRIES = [
  'united arab emirates', 'uae', 'saudi arabia', 'saudi', 'qatar', 'kuwait',
  'bahrain', 'oman', 'israel', 'jordan', 'lebanon', 'egypt', 'turkey', 'türkiye',
]

export function regionToGeo(
  region: string | null | undefined,
  country?: string | null,
): Geo {
  const c = (country ?? '').trim().toLowerCase()
  if (c && MIDDLE_EAST_COUNTRIES.some((m) => c.includes(m))) return 'middle_east'

  switch ((region ?? '').trim()) {
    case 'New York': return 'nyc'
    case 'Miami':    return 'south_florida'
    case 'France':
    case 'Europe':   return 'europe'
    default:         return 'other'
  }
}
