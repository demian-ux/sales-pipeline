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
  })
}
