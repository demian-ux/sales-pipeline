// ICP-fit scoring — the SECOND axis on a Discovery, additive to discovery_score.
//
// discovery_score (lib/discoveries/scoring.ts) measures how big/real a deal is.
// This measures whether it's a deal oaki can sell into: editorial visualization
// for projects sold from imagery before they exist (for-sale condos, branded
// residences, hospitality). The two are blended into the DB-generated
// `combined_score` column for the default feed sort.
//
// Pure + deterministic, exactly like computeDiscoveryScore: the analyzer
// extracts the raw signals (tenure, stage, incumbent vendor, …), this assigns
// the points and applies the hard caps. Keeping the rubric in code — not the
// prompt — means a prompt edit can't silently move the ranking, and the same
// inputs always produce the same tier.

import { isInTargetGeo } from './target-geo'
import { isDropSignalType } from './signal-type'
import type {
  Tenure,
  ProjectStage,
  SectorFit,
  VizBuyerRole,
  EstScaleVsFloor,
  FitTier,
  SignalType,
  DiscoverySector,
} from '@/lib/types'

// sector_fit is DERIVED from the sector the analyzer already picks (spec §2's
// "map from sector"), not asked for separately — deterministic, can't drift
// from the sector label. High = oaki's core viz markets (for-sale-led
// residential, hospitality, airport lounges, cultural/civic); low = airport
// infrastructure, office, transport, etc. that don't commission pre-sale viz.
export function sectorFitFromSector(sector: DiscoverySector | string): SectorFit {
  switch (sector) {
    case 'luxury_residential':
    case 'hospitality':
    case 'aviation_hospitality':   // airport lounges / premium-terminal interiors
    case 'cultural':               // museums, civic / cultural landmarks (esp. Europe)
      return 'high'
    case 'mixed_use':
      return 'medium'
    default:
      return 'low'
  }
}

export interface IcpFitInput {
  // The event behind the article. A DROP type (transaction, financing,
  // completion, policy, …) hard-disqualifies regardless of the other signals —
  // there is no future imagery window to sell. null/other = no constraint.
  signal_type?: SignalType | null
  tenure: Tenure
  has_for_sale_residential: boolean
  project_stage: ProjectStage
  sector_fit: SectorFit
  viz_buyer_role: VizBuyerRole
  est_scale_vs_floor: EstScaleVsFloor
  // Free-text vendor name (e.g. "Gladstone Immersive") or null when no
  // render/image credit was found. Presence relabels the lane to `complement`
  // (a complement play, not greenfield) without lowering the numeric score.
  incumbent_viz: string | null
  // The discovery's stored region label ("New York" | "Miami" | …), used only
  // for the geography sub-score via the single source of truth in target-geo.
  region: string | null | undefined
}

export interface IcpFitResult {
  icp_fit_score: number
  fit_tier: FitTier
  fit_reason: string
  partner_radar: boolean
}

// Weights sum to 100 (spec §3.2). The `unknown` buckets for tenure/scale aren't
// in the spec table — defaulted low-but-nonzero so a silent source isn't
// credited as for-sale but isn't killed outright either (spec §3.4.1).
const TENURE_POINTS: Record<Tenure, number> = {
  for_sale: 30,
  mixed: 15,
  unknown: 8,
  rental: 5,
  owner_occupied: 0,
}

const SECTOR_POINTS: Record<SectorFit, number> = {
  high: 20,
  medium: 10,
  low: 0,
}

const STAGE_POINTS: Record<ProjectStage, number> = {
  sales_launch: 20,
  design_in_hand: 16,
  under_construction: 14,
  entitled_no_design: 8,
  pre_entitlement: 4,
  built_stabilized: 2,
  financing_only: 0,
}

const BUYER_POINTS: Record<VizBuyerRole, number> = {
  developer_marketing: 15,
  developer_principal: 15,
  architect: 10,
  broker: 5,
  none_identified: 0,
}

const SCALE_POINTS: Record<EstScaleVsFloor, number> = {
  above: 10,
  near: 6,
  unknown: 4,
  below: 0,
}

const GEO_POINTS = 5
const DISQUALIFIED_CAP = 25
const PRIME_THRESHOLD = 70
const WORKABLE_THRESHOLD = 45

export function computeIcpFit(input: IcpFitInput): IcpFitResult {
  const {
    signal_type,
    tenure,
    has_for_sale_residential,
    project_stage,
    sector_fit,
    viz_buyer_role,
    est_scale_vs_floor,
    incumbent_viz,
    region,
  } = input

  const isOffType = isDropSignalType(signal_type)

  const rawScore =
    (TENURE_POINTS[tenure] ?? TENURE_POINTS.unknown) +
    (SECTOR_POINTS[sector_fit] ?? SECTOR_POINTS.low) +
    (STAGE_POINTS[project_stage] ?? STAGE_POINTS.pre_entitlement) +
    (BUYER_POINTS[viz_buyer_role] ?? BUYER_POINTS.none_identified) +
    (SCALE_POINTS[est_scale_vs_floor] ?? SCALE_POINTS.unknown) +
    (isInTargetGeo(region) ? GEO_POINTS : 0)

  // "No for-sale residential" — neither an explicit for-sale/mixed tenure nor
  // the boolean flag. Used by the sector disqualifier below.
  const noForSale = !has_for_sale_residential && tenure !== 'for_sale' && tenure !== 'mixed'

  // Hard disqualifiers (spec §3.2). The first hit caps the score at 25 and
  // forces fit_tier = disqualified regardless of the weighted sum. Order =
  // priority for the why-not line. The event-type gate is first: a resale /
  // financing / completion / policy / infrastructure story has no future
  // imagery window however good the project looks on the other axes.
  const firstDisqualifier = [
    { hit: isOffType, reason: 'Off-type event — no future imagery window' },
    { hit: tenure === 'owner_occupied', reason: 'Owner-occupied — not a pre-sale viz buyer' },
    { hit: tenure === 'rental' && !has_for_sale_residential, reason: 'Rental, no for-sale component' },
    { hit: sector_fit === 'low' && noForSale, reason: 'Low-fit sector, no for-sale residential' },
    { hit: project_stage === 'financing_only', reason: 'Financing-only — no product to market' },
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
  } else if (incumbent_viz) {
    // Incumbent vendor present: a strong for-sale signal still ranks top (score
    // untouched), but the lane is `complement` so outreach is framed correctly.
    fit_tier = 'complement'
    fit_reason = `${strengthReason(input)} — incumbent: ${incumbent_viz}`
  } else if (score >= PRIME_THRESHOLD) {
    fit_tier = 'prime'
    fit_reason = strengthReason(input)
  } else if (score >= WORKABLE_THRESHOLD) {
    fit_tier = 'workable'
    fit_reason = strengthReason(input)
  } else {
    fit_tier = 'weak'
    fit_reason = strengthReason(input)
  }

  // partner_radar: disqualified, but a megaproject worth knowing rather than
  // pitching (owner-occupied HQ, or a large institutional low-fit play). Lets
  // these be filtered out of the outreach queue without being deleted (§6).
  const partner_radar =
    fit_tier === 'disqualified' &&
    !isOffType &&
    (tenure === 'owner_occupied' || (sector_fit === 'low' && est_scale_vs_floor === 'above'))

  return { icp_fit_score: score, fit_tier, fit_reason, partner_radar }
}

// Badge presentation, co-located with the tiers it describes. Colors reuse the
// design tokens already in use by DiscoveryScoreBadge / the detail page, so the
// fit badge can be a thin custom chip (StatusBadge only carries 4 tones; we
// need 5 distinct fit colors). Rendered by components/discoveries/FitTierBadge.
export const FIT_TIER_META: Record<
  FitTier,
  { label: string; fg: string; bg: string; border: string }
> = {
  prime:        { label: 'Prime fit',    fg: 'var(--green)',      bg: 'var(--green-dim)',  border: 'rgba(76,175,134,0.25)' },
  complement:   { label: 'Complement',   fg: 'var(--accent)',     bg: 'var(--accent-dim)', border: 'rgba(200,169,110,0.3)' },
  workable:     { label: 'Workable',     fg: 'var(--blue)',       bg: 'var(--blue-dim)',   border: 'rgba(92,142,212,0.25)' },
  weak:         { label: 'Weak fit',     fg: 'var(--text-faint)', bg: 'var(--surface-2)',  border: 'var(--border)' },
  disqualified: { label: 'Disqualified', fg: 'var(--red)',        bg: 'transparent',       border: 'var(--border)' },
}

// ─── Reason builders (deterministic — the strength/disqualifier that moved
//     the score most, per spec §3.3) ──────────────────────────────────────

function strengthReason(input: IcpFitInput): string {
  const head = `${capitalize(tenurePhrase(input.tenure))}, ${stagePhrase(input.project_stage)}`
  const buyerStrong = (BUYER_POINTS[input.viz_buyer_role] ?? 0) >= 10
  return buyerStrong ? `${head}; ${buyerPhrase(input.viz_buyer_role)}` : head
}

function lowScoreReason(input: IcpFitInput): string {
  const bits: string[] = []
  if (input.viz_buyer_role === 'none_identified') bits.push('no reachable buyer')
  if (input.sector_fit === 'low') bits.push('low-fit sector')
  if ((STAGE_POINTS[input.project_stage] ?? 0) <= 4) bits.push(stagePhrase(input.project_stage))
  if (input.tenure === 'unknown') bits.push('tenure unclear')
  return bits.length ? `Weak fit — ${bits.join(', ')}` : 'Weak ICP signal'
}

function tenurePhrase(t: Tenure): string {
  switch (t) {
    case 'for_sale':       return 'for-sale'
    case 'mixed':          return 'mixed-use w/ for-sale'
    case 'rental':         return 'rental'
    case 'owner_occupied': return 'owner-occupied'
    case 'unknown':        return 'tenure unclear'
  }
}

function stagePhrase(s: ProjectStage): string {
  switch (s) {
    case 'sales_launch':       return 'sales launch'
    case 'design_in_hand':     return 'design in hand'
    case 'under_construction': return 'under construction'
    case 'entitled_no_design': return 'entitled, no design'
    case 'pre_entitlement':    return 'pre-entitlement'
    case 'built_stabilized':   return 'built / stabilized'
    case 'financing_only':     return 'financing only'
  }
}

function buyerPhrase(r: VizBuyerRole): string {
  switch (r) {
    case 'developer_marketing': return 'developer marketing reachable'
    case 'developer_principal': return 'principal reachable'
    case 'architect':           return 'architect reachable'
    case 'broker':              return 'broker only'
    case 'none_identified':     return 'no buyer identified'
  }
}

function clamp(n: number): number {
  return Math.round(Math.min(100, Math.max(0, n)))
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}
