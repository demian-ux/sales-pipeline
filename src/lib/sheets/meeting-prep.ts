import type { MeetingPrepOutput } from '../types'
import { sessionCache } from './cache'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

// Meeting preps persist to Supabase (meeting_preps table) so they survive
// restarts/redeploys. Falls back to in-memory sessionCache when Supabase
// isn't configured, or until the migration creating the table has run.

export async function saveMeetingPrep(leadId: string, prep: MeetingPrepOutput): Promise<void> {
  if (isSupabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from('meeting_preps')
      .upsert(
        { lead_id: leadId, prep, updated_at: new Date().toISOString() },
        { onConflict: 'lead_id' },
      )
    if (!error) return
    console.error('saveMeetingPrep: Supabase write failed, using session memory:', error.message)
  }
  sessionCache.meetingPreps[leadId] = prep
}

export async function getMeetingPrep(leadId: string): Promise<MeetingPrepOutput | null> {
  if (isSupabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('meeting_preps')
      .select('prep')
      .eq('lead_id', leadId)
      .maybeSingle()
    if (!error && data?.prep) return data.prep as MeetingPrepOutput
    if (error) {
      console.error('getMeetingPrep: Supabase read failed, using session memory:', error.message)
    }
  }
  return sessionCache.meetingPreps[leadId] ?? null
}
