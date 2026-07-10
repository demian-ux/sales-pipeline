// Canonical field vocabularies shared by API routes and exposed via GET
// /api/meta so API clients don't have to guess valid values.

import type {
  PipelineStage,
  LeadStatus,
  RelationshipTemperature,
  LinkedInConnectionStatus,
  LinkedInDMStatus,
  LinkedInWarmth,
  InteractionChannel,
  InteractionDirection,
  WorkStatus,
  WorkCategory,
  Geo,
  BriefsStatus,
} from './types'

export const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Replied', 'Discovery', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Nurture', 'Dormant', 'Held'] as const satisfies readonly PipelineStage[]
export const LEAD_STATUSES = ['Active', 'Inactive', 'Archived'] as const satisfies readonly LeadStatus[]
export const TEMPERATURES = ['Hot', 'Warm', 'Cool', 'Cold'] as const satisfies readonly RelationshipTemperature[]
export const LINKEDIN_CONNECTION_STATUSES = ['Not Connected', 'Connection Ready', 'Connection Sent', 'Connected', 'Unknown'] as const satisfies readonly LinkedInConnectionStatus[]
export const LINKEDIN_DM_STATUSES = ['Not Started', 'DM Ready', 'DM Sent', 'Replied', 'Not Interested', 'Unknown'] as const satisfies readonly LinkedInDMStatus[]
export const LINKEDIN_WARMTHS = ['Passive', 'Aware', 'Connected', 'Warm', 'Engaged', 'Active'] as const satisfies readonly LinkedInWarmth[]
export const INTERACTION_CHANNELS = ['Email', 'LinkedIn', 'Phone', 'Meeting', 'Other'] as const satisfies readonly InteractionChannel[]
export const INTERACTION_DIRECTIONS = ['Inbound', 'Outbound'] as const satisfies readonly InteractionDirection[]

// External-agent friendly interaction types → canonical Sheets channel.
export const INTERACTION_TYPE_TO_CHANNEL: Record<string, InteractionChannel> = {
  call: 'Phone',
  email: 'Email',
  linkedin_dm: 'LinkedIn',
  meeting: 'Meeting',
  letter: 'Other',
}

export const DRAFT_CHANNELS = ['letter', 'email', 'linkedin_dm'] as const
export const DRAFT_STATUSES = ['draft', 'approved', 'sent'] as const

// Discovery work-tracking (2026-07-06). `work_status` is the "did a run act on
// this row" signal; `discovery_status` is the board bucket. Published via
// /api/meta so runs can validate a value before PATCHing (a silent enum drift
// is the worst failure mode for the write-back automation).
export const WORK_STATUSES = ['unworked', 'drafted', 'held', 'rejected', 'already_engaged'] as const satisfies readonly WorkStatus[]
export const DISCOVERY_BOARD_STATUSES = ['active', 'saved', 'archived'] as const

// Upstream-signal vocabularies (2026-07-10). Published via /api/meta so the
// weekly value-lane run can validate a value before matching/ranking on it.
// WORK_CATEGORIES + GEOS are the firm-pool join keys (category ∩ geo).
export const WORK_CATEGORIES = ['development', 'architecture', 'interior_design', 'hospitality_design', 'landscape', 'experiential'] as const satisfies readonly WorkCategory[]
export const GEOS = ['nyc', 'south_florida', 'europe', 'middle_east', 'other'] as const satisfies readonly Geo[]
export const BRIEFS_STATUSES = ['unawarded', 'partially_awarded', 'awarded'] as const satisfies readonly BriefsStatus[]

// Collapse runs of whitespace and trim — names arrive from CSV exports with
// double spaces ("Andrew  Delgado") and stray newlines.
export function cleanName(s?: string): string {
  return (s ?? '').replace(/\s+/g, ' ').trim()
}
