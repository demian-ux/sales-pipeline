// Dashboard data helpers — read from Supabase for the cards that depend on
// it (discoveries, candidates, snoozed signals). Silent fallbacks to empty
// arrays when Supabase isn't configured, so the dashboard always renders.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { Discovery, FirmCandidateRow, SnoozedSignal } from '@/lib/types'

export interface DashboardSupabaseData {
  strongDiscoveries: Discovery[]
  highCandidates: FirmCandidateRow[]
  snoozedSignals: SnoozedSignal[]
}

export async function loadDashboardSupabaseData(): Promise<DashboardSupabaseData> {
  if (!isSupabaseAdminConfigured()) {
    return { strongDiscoveries: [], highCandidates: [], snoozedSignals: [] }
  }

  const supabase = getSupabaseAdmin()

  const [discoveriesRes, candidatesRes, snoozedRes] = await Promise.all([
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
  ])

  if (discoveriesRes.error) console.warn('[dashboard/data] discoveries:', discoveriesRes.error.message)
  if (candidatesRes.error)  console.warn('[dashboard/data] candidates:',  candidatesRes.error.message)
  if (snoozedRes.error)     console.warn('[dashboard/data] snoozed:',     snoozedRes.error.message)

  const rawSnoozed = (snoozedRes.data?.value as { signals?: SnoozedSignal[] } | null)?.signals ?? []
  const now = Date.now()
  const activeSnoozed = rawSnoozed.filter((s) => new Date(s.snoozed_until).getTime() > now)

  return {
    strongDiscoveries: (discoveriesRes.data as Discovery[] | null) ?? [],
    highCandidates:    (candidatesRes.data as FirmCandidateRow[] | null) ?? [],
    snoozedSignals:    activeSnoozed,
  }
}
