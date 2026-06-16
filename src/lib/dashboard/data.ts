// Dashboard data helpers — read from Supabase for the cards that depend on
// it (discoveries, candidates, snoozed signals, staged drafts). Silent
// fallbacks to empty arrays when Supabase isn't configured, so the dashboard
// always renders.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { Discovery, FirmCandidateRow, SnoozedSignal } from '@/lib/types'

export interface DashboardSupabaseData {
  strongDiscoveries: Discovery[]
  highCandidates: FirmCandidateRow[]
  snoozedSignals: SnoozedSignal[]
  // lead_ids that have at least one generated draft (email or LinkedIn) —
  // drives the Send queue card's "staged" state.
  draftLeadIds: string[]
  // lead_id → newest markable email draft id in lead_drafts (status
  // draft|approved). Lets the Send queue offer a one-click "Mark sent" via the
  // unified hook. Note: this is the lifecycle `lead_drafts` table, distinct
  // from the legacy `email_drafts` copy that feeds `draftLeadIds`.
  emailDraftIdByLead: Record<string, string>
}

export async function loadDashboardSupabaseData(): Promise<DashboardSupabaseData> {
  if (!isSupabaseAdminConfigured()) {
    return { strongDiscoveries: [], highCandidates: [], snoozedSignals: [], draftLeadIds: [], emailDraftIdByLead: {} }
  }

  const supabase = getSupabaseAdmin()

  const [discoveriesRes, candidatesRes, snoozedRes, emailDraftsRes, linkedinDraftsRes, leadEmailDraftsRes] = await Promise.all([
    supabase
      .from('discoveries')
      .select('*')
      .eq('signal_tier', 'strong_opportunity')
      .eq('status', 'active')
      .is('promoted_to_opportunity_id', null)
      .order('discovery_score', { ascending: false, nullsFirst: false })
      .limit(6),
    supabase
      .from('firm_candidates')
      .select('*')
      .eq('status', 'new')
      .gte('score', 70)
      .order('score', { ascending: false, nullsFirst: false })
      .limit(6),
    supabase
      .from('app_secrets')
      .select('value')
      .eq('key', 'snoozed_signals')
      .maybeSingle(),
    supabase.from('email_drafts').select('lead_id'),
    supabase.from('linkedin_drafts').select('lead_id'),
    supabase
      .from('lead_drafts')
      .select('id, lead_id, created_at')
      .eq('channel', 'email')
      .in('status', ['draft', 'approved'])
      .order('created_at', { ascending: false }),
  ])

  if (discoveriesRes.error) console.warn('[dashboard/data] discoveries:', discoveriesRes.error.message)
  if (candidatesRes.error)  console.warn('[dashboard/data] candidates:',  candidatesRes.error.message)
  if (snoozedRes.error)     console.warn('[dashboard/data] snoozed:',     snoozedRes.error.message)

  const rawSnoozed = (snoozedRes.data?.value as { signals?: SnoozedSignal[] } | null)?.signals ?? []
  const now = Date.now()
  const activeSnoozed = rawSnoozed.filter((s) => new Date(s.snoozed_until).getTime() > now)

  const draftLeadIds = [
    ...(((emailDraftsRes.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)),
    ...(((linkedinDraftsRes.data ?? []) as { lead_id: string }[]).map((r) => r.lead_id)),
  ]

  // Newest markable email draft per lead (rows arrive newest-first, so the
  // first id seen per lead wins).
  const emailDraftIdByLead: Record<string, string> = {}
  for (const row of (leadEmailDraftsRes.data ?? []) as { id: string; lead_id: string }[]) {
    if (!emailDraftIdByLead[row.lead_id]) emailDraftIdByLead[row.lead_id] = row.id
  }

  return {
    strongDiscoveries: (discoveriesRes.data as Discovery[] | null) ?? [],
    highCandidates:    (candidatesRes.data as FirmCandidateRow[] | null) ?? [],
    snoozedSignals:    activeSnoozed,
    draftLeadIds:      [...new Set(draftLeadIds)],
    emailDraftIdByLead,
  }
}
