// Opportunity score — the ranking axis for Opportunity Signals (discovery_kind
// 'opportunity_signal'). A DIFFERENT question than the launch discovery_score:
// not "how big/real is this deal" but "how strong is the design-work demand this
// upstream event creates, and can oaki get in early with the firm that wins it".
//
// Deliberately NOT dollar-weighted (spec §Scoring): a $5B airport program matters
// for the design demand it creates, not its headline capex. The analyzer extracts
// the raw signals (does it create demand, how big is the DESIGN scope, is the
// design phase still ahead, are reachable targets named); this module assigns the
// points and applies the hard disqualifiers — same pure/deterministic contract as
// computeIcpFit, so a prompt edit can't silently move the ranking.

import { isInTargetGeo } from './target-geo'
import { getSegmentConfig } from './opportunity-segments'
import type { OpportunitySegment, FitTier, BriefsStatus } from '@/lib/types'

// Does the event guarantee design work, and how large is the resulting scope?
export type DesignDemand = 'high' | 'medium' | 'low'
// Size of the resulting DESIGN scope (not the project capex).
export type DesignScope = 'large' | 'mid' | 'small' | 'unknown'
// Is the design phase still ahead (oaki can get in early with the firm), or
// already awarded / underway?
export type OpportunityTiming = 'design_ahead' | 'in_progress' | 'awarded' | 'unknown'
// Do reachable target firms exist? named (the analyzer named one) | findable
// (a clear segment to search) | segment_only (segment known, firms TBD).
export type TargetReachability = 'named' | 'findable' | 'segment_only'

export interface OpportunityScoreInput {
  segment: OpportunitySegment
  creates_design_demand: DesignDemand
  design_scope: DesignScope
  timing: OpportunityTiming
  targets: TargetReachability
  region: string | null | undefined
  // Upstream-signal gates (2026-07-10). The lane only fires on PRE-AWARD future
  // work, so an awarded brief or a failed future-work test is a hard reject —
  // enforced here (deterministic), never left to the prompt.
  briefs_status: BriefsStatus
  future_work_test: boolean
}

export interface OpportunityScoreResult {
  opportunity_score: number
  fit_tier: FitTier
  fit_reason: string
}

// Weights sum to 100. Demand + segment fit + imagery dominate; timing, targets,
// and geography fine-tune. No dollar term by design.
const DEMAND_POINTS: Record<DesignDemand, number> = { high: 25, medium: 15, low: 0 }
const SCOPE_POINTS: Record<DesignScope, number> = { large: 15, mid: 9, small: 3, unknown: 6 }
const SEGMENT_FIT_POINTS = { high: 20, medium: 10, low: 0 } as const
const IMAGERY_POINTS = 15
const TIMING_POINTS: Record<OpportunityTiming, number> = { design_ahead: 10, in_progress: 5, awarded: 0, unknown: 5 }
const TARGET_POINTS: Record<TargetReachability, number> = { named: 10, findable: 6, segment_only: 2 }
const GEO_POINTS = 5

const DISQUALIFIED_CAP = 25
const PRIME_THRESHOLD = 70
const WORKABLE_THRESHOLD = 45

export function computeOpportunityScore(input: OpportunityScoreInput): OpportunityScoreResult {
  const { segment, creates_design_demand, design_scope, timing, targets, region, briefs_status, future_work_test } = input
  const cfg = getSegmentConfig(segment)

  const rawScore =
    (DEMAND_POINTS[creates_design_demand] ?? 0) +
    (SCOPE_POINTS[design_scope] ?? SCOPE_POINTS.unknown) +
    SEGMENT_FIT_POINTS[cfg.segmentFit] +
    (cfg.imageryHeavy ? IMAGERY_POINTS : 0) +
    (TIMING_POINTS[timing] ?? TIMING_POINTS.unknown) +
    (TARGET_POINTS[targets] ?? TARGET_POINTS.segment_only) +
    (isInTargetGeo(region) ? GEO_POINTS : 0)

  // Hard disqualifiers — first hit caps at 25 and forces fit_tier=disqualified.
  // Order = priority for the why-not line. The pre-award gates come first: the
  // lane exists to reach firms BEFORE a brief is won, so a failed future-work
  // test or an awarded brief is an automatic reject regardless of segment fit.
  const firstDisqualifier = [
    { hit: future_work_test === false, reason: 'Fails the future-work test — no committed buyer, or briefs already awarded' },
    { hit: briefs_status === 'awarded', reason: 'Briefs already awarded — too late to reach the firm early' },
    { hit: creates_design_demand === 'low', reason: 'No real design-work demand created' },
    { hit: timing === 'awarded', reason: 'Design already awarded — too late to get in early' },
    { hit: cfg.segmentFit === 'low' && !cfg.imageryHeavy, reason: 'Low-fit, non-imagery segment' },
  ].find((d) => d.hit)

  let score = clamp(rawScore)
  let fit_tier: FitTier
  let fit_reason: string

  if (firstDisqualifier) {
    score = Math.min(score, DISQUALIFIED_CAP)
    fit_tier = 'disqualified'
    fit_reason = firstDisqualifier.reason
  } else if (score < DISQUALIFIED_CAP) {
    fit_tier = 'disqualified'
    fit_reason = lowScoreReason(input)
  } else if (score >= PRIME_THRESHOLD) {
    fit_tier = 'prime'
    fit_reason = strengthReason(input, cfg.label)
  } else if (score >= WORKABLE_THRESHOLD) {
    fit_tier = 'workable'
    fit_reason = strengthReason(input, cfg.label)
  } else {
    fit_tier = 'weak'
    fit_reason = strengthReason(input, cfg.label)
  }

  return { opportunity_score: score, fit_tier, fit_reason }
}

// Map a (possibly geo-capped) score back to a fit tier, mirroring the band
// thresholds above. Used by the processor to re-derive fit_tier after it applies
// the out-of-geo cap, so the badge tier can never contradict the stored score.
// Only the non-disqualified bands — a hard disqualifier is preserved by the
// caller (the cap must never upgrade a disqualified row).
export function fitTierFromScore(score: number): FitTier {
  if (score >= PRIME_THRESHOLD) return 'prime'
  if (score >= WORKABLE_THRESHOLD) return 'workable'
  if (score >= DISQUALIFIED_CAP) return 'weak'
  return 'disqualified'
}

// briefs_status is the analyzer's canonical award-state field (2026-07-10); the
// score's timing term is derived from it so the prompt emits one field, not two
// coupled ones. unawarded → the design phase is still ahead (the sweet spot).
export function briefsStatusToTiming(briefs: BriefsStatus): OpportunityTiming {
  switch (briefs) {
    case 'unawarded':         return 'design_ahead'
    case 'partially_awarded': return 'in_progress'
    case 'awarded':           return 'awarded'
    default:                  return 'unknown'
  }
}

function strengthReason(input: OpportunityScoreInput, segmentLabel: string): string {
  const bits: string[] = [segmentLabel]
  if (input.creates_design_demand === 'high') bits.push('clear design demand')
  if (input.timing === 'design_ahead') bits.push('design phase still ahead')
  if (input.targets === 'named') bits.push('named target firms')
  else if (input.targets === 'segment_only') bits.push('firms TBD')
  return bits.join('; ')
}

function lowScoreReason(input: OpportunityScoreInput): string {
  const bits: string[] = []
  if (input.creates_design_demand === 'medium') bits.push('soft design demand')
  if (input.design_scope === 'small') bits.push('small design scope')
  if (input.targets === 'segment_only') bits.push('no firms identified yet')
  if (!isInTargetGeo(input.region)) bits.push('out of target geography')
  return bits.length ? `Weak signal — ${bits.join(', ')}` : 'Weak opportunity signal'
}

function clamp(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)))
}
