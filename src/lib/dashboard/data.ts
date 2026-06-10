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
}

export async function loadDashboardSupabaseData(): Promise<DashboardSupabaseData> {
  if (!isSupabaseAdminConfigured()) {
    return { strongDiscoveries: [], highCandidates: [], snoozedSignals: [], draftLeadIds: [] }
  }

  const supabase = getSupabaseAdmin()

  const [discoveriesRes, candidatesRes, snoozedRes, emailDraftsRes, linkedinDraftsRes] = await Promise.all([
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

  return {
    strongDiscoveries: (discoveriesRes.data as Discovery[] | null) ?? [],
    highCandidates:    (candidatesRes.data as FirmCandidateRow[] | null) ?? [],
    snoozedSignals:    activeSnoozed,
    draftLeadIds:      [...new Set(draftLeadIds)],
  }
}
