import { NextResponse } from 'next/server'
import {
  PIPELINE_STAGES,
  LEAD_STATUSES,
  TEMPERATURES,
  LINKEDIN_CONNECTION_STATUSES,
  LINKEDIN_DM_STATUSES,
  LINKEDIN_WARMTHS,
  INTERACTION_CHANNELS,
  INTERACTION_DIRECTIONS,
  INTERACTION_TYPE_TO_CHANNEL,
  DRAFT_CHANNELS,
  DRAFT_STATUSES,
  WORK_STATUSES,
  DISCOVERY_BOARD_STATUSES,
  WORK_CATEGORIES,
  GEOS,
  BRIEFS_STATUSES,
  POOL_STATUSES,
  REPLY_STATUSES,
} from '@/lib/vocab'

// GET /api/meta — field vocabularies so API clients don't guess valid values.
export async function GET() {
  return NextResponse.json({
    pipeline_stage: PIPELINE_STAGES,
    lead_status: LEAD_STATUSES,
    relationship_temperature: TEMPERATURES,
    linkedin_connection_status: LINKEDIN_CONNECTION_STATUSES,
    linkedin_dm_status: LINKEDIN_DM_STATUSES,
    linkedin_warmth: LINKEDIN_WARMTHS,
    interaction_channel: INTERACTION_CHANNELS,
    interaction_direction: INTERACTION_DIRECTIONS,
    interaction_type_aliases: INTERACTION_TYPE_TO_CHANNEL,
    draft_channel: DRAFT_CHANNELS,
    draft_status: DRAFT_STATUSES,
    discovery_work_status: WORK_STATUSES,
    discovery_status: DISCOVERY_BOARD_STATUSES,
    // Discovery kinds + the accepted query aliases (2026-07-10). The pre-award
    // upstream lane is STORED as 'opportunity_signal'; the API also accepts
    // 'upstream_signal' as an alias on ?discovery_kind= (GET) and ?mode= (ingest).
    discovery_kind: ['project_launch', 'opportunity_signal'],
    discovery_kind_aliases: { upstream_signal: 'opportunity_signal' },
    // Upstream-signal vocabularies (2026-07-10). work_category + geo are the
    // firm-pool join keys the weekly value-lane run matches on.
    upstream_work_category: WORK_CATEGORIES,
    upstream_geo: GEOS,
    upstream_briefs_status: BRIEFS_STATUSES,
    // Firm-pool + value-outreach vocabularies (2026-07-10). firm categories
    // reuse upstream_work_category so the value-outreach match is exact.
    firm_pool_status: POOL_STATUSES,
    value_touch_reply_status: REPLY_STATUSES,
  })
}
