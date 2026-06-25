// Opportunity Signals — segment taxonomy. The first-build lanes (aviation,
// hospitality, cultural, competitions, experiential, branded residences) plus
// an `other` fallback. One config per lane carries everything the deterministic
// scorer and the on-demand firm-search need:
//   • segmentFit     — how well the resulting design work fits oaki's core viz
//                      markets (feeds the opportunity score).
//   • imageryHeavy   — does winning/selling the work run on visuals (films,
//                      renders)? Airport lounges, hotels, cultural, experiential
//                      = yes; pure infrastructure = no (feeds the score).
//   • targetFirmQuery — the kind of firm to hunt for this segment, used to build
//                      the Tavily firm-search queries (lib/prospecting/tavily.ts).
//   • sector         — the DiscoverySector chip the board card renders.
//
// Kept in code, not the prompt, so the rubric can't drift: the analyzer picks a
// segment enum, this module decides the fit/imagery/sector it implies.

import type { OpportunitySegment, SectorFit, DiscoverySector } from '@/lib/types'

export interface OpportunitySegmentConfig {
  key: OpportunitySegment
  label: string
  segmentFit: SectorFit
  imageryHeavy: boolean
  targetFirmQuery: string
  sector: DiscoverySector
}

const CONFIGS: Record<OpportunitySegment, OpportunitySegmentConfig> = {
  aviation: {
    key: 'aviation',
    label: 'Aviation interiors',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'aviation interior design and experiential design firms',
    sector: 'aviation_hospitality',
  },
  hospitality: {
    key: 'hospitality',
    label: 'Hospitality',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'hospitality architecture and interior design firms',
    sector: 'hospitality',
  },
  cultural: {
    key: 'cultural',
    label: 'Cultural / institutional',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'cultural and institutional architecture firms (museums, civic)',
    sector: 'cultural',
  },
  competitions: {
    key: 'competitions',
    label: 'Competitions / RFPs',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'architecture firms that enter design competitions and masterplan RFPs',
    sector: 'other',
  },
  experiential: {
    key: 'experiential',
    label: 'Experiential / themed',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'experiential, themed-entertainment and flagship retail design firms',
    sector: 'retail',
  },
  branded_residences: {
    key: 'branded_residences',
    label: 'Branded residences',
    segmentFit: 'high',
    imageryHeavy: true,
    targetFirmQuery: 'luxury residential and hospitality architecture firms (branded residences)',
    sector: 'luxury_residential',
  },
  other: {
    key: 'other',
    label: 'Other',
    segmentFit: 'medium',
    imageryHeavy: false,
    targetFirmQuery: 'architecture and interior design firms',
    sector: 'other',
  },
}

// The lanes in the first build, in board-presentation order (excludes `other`,
// which is the analyzer's fallback only).
export const OPPORTUNITY_SEGMENTS: readonly OpportunitySegment[] = [
  'aviation',
  'hospitality',
  'cultural',
  'competitions',
  'experiential',
  'branded_residences',
]

export function getSegmentConfig(segment: OpportunitySegment | string | null | undefined): OpportunitySegmentConfig {
  if (segment && segment in CONFIGS) return CONFIGS[segment as OpportunitySegment]
  return CONFIGS.other
}

export function segmentToSector(segment: OpportunitySegment | string | null | undefined): DiscoverySector {
  return getSegmentConfig(segment).sector
}

export const OPPORTUNITY_SEGMENT_LABELS: Record<OpportunitySegment, string> = {
  aviation:           CONFIGS.aviation.label,
  hospitality:        CONFIGS.hospitality.label,
  cultural:           CONFIGS.cultural.label,
  competitions:       CONFIGS.competitions.label,
  experiential:       CONFIGS.experiential.label,
  branded_residences: CONFIGS.branded_residences.label,
  other:              CONFIGS.other.label,
}
