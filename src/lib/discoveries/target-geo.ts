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
