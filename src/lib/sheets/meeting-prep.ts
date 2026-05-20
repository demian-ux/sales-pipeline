import type { MeetingPrepOutput } from '../types'
import { sessionCache } from './cache'

// Meeting preps are always in-memory — not persisted to Sheets.
// (Phase 2 may revisit this if persistence is needed across deploys.)

export function saveMeetingPrep(leadId: string, prep: MeetingPrepOutput): void {
  sessionCache.meetingPreps[leadId] = prep
}

export function getMeetingPrep(leadId: string): MeetingPrepOutput | null {
  return sessionCache.meetingPreps[leadId] ?? null
}
