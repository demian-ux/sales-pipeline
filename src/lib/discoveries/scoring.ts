import type { DiscoveryScoreBreakdown, DiscoverySignalTier } from '@/lib/types'

// Weights must sum to 1.0.
// region_strategic was raised 0.10 → 0.20 (June 2026): at 10%, an
// out-of-target location cost at most ~5 points, so Brisbane/Chicago articles
// tiered as strong opportunities. The hard guarantee is the geo cap in
// processor.ts; this weight makes the ranking inside each tier geo-aware too.
// investment_size cut 0.15 → 0.05 (June 2026): raw deal size was the dollar
// bias that let a $520M land trade outrank a genuine launch. The event-type
// gate now removes transactions outright; this de-emphasises pure magnitude so
// clarity + strategic geography drive the ranking. (clarity +0.05, region +0.05)
const WEIGHTS = {
  opportunity_clarity: 0.35,
  investment_size:     0.05,
  timing:              0.15,
  actors:              0.10,
  sector_growth:       0.10,
  region_strategic:    0.25,
} as const

// Sub-score shape used by the Claude analyzer — un-prefixed (matches the JSON
// schema returned by the prompt). The DB columns use a `score_` prefix.
export interface ScoreBreakdownRaw {
  opportunity_clarity: number
  investment_size: number
  timing: number
  actors: number
  sector_growth: number
  region_strategic: number
}

export function computeDiscoveryScore(scores: ScoreBreakdownRaw): number {
  const raw =
    scores.opportunity_clarity * WEIGHTS.opportunity_clarity +
    scores.investment_size     * WEIGHTS.investment_size     +
    scores.timing              * WEIGHTS.timing              +
    scores.actors              * WEIGHTS.actors              +
    scores.sector_growth       * WEIGHTS.sector_growth       +
    scores.region_strategic    * WEIGHTS.region_strategic

  return Math.round(Math.min(100, Math.max(0, raw)))
}

export function scoreToTier(score: number | null): DiscoverySignalTier {
  if ((score ?? 0) >= 70) return 'strong_opportunity'
  if ((score ?? 0) >= 40) return 'watchlist'
  return 'archive'
}

export function tierLabel(tier: DiscoverySignalTier): string {
  switch (tier) {
    case 'strong_opportunity': return 'Strong Opportunity'
    case 'watchlist':          return 'Watchlist'
    case 'archive':            return 'Archive'
  }
}

// DB rows store sub-scores with the `score_` prefix. This helper rebuilds the
// raw shape from a row object (typed loosely because Supabase returns `any`).
export function rowToBreakdown(row: Partial<DiscoveryScoreBreakdown>): ScoreBreakdownRaw {
  return {
    opportunity_clarity: row.score_opportunity_clarity ?? 0,
    investment_size:     row.score_investment_size     ?? 0,
    timing:              row.score_timing              ?? 0,
    actors:              row.score_actors              ?? 0,
    sector_growth:       row.score_sector_growth       ?? 0,
    region_strategic:    row.score_region_strategic    ?? 0,
  }
}
