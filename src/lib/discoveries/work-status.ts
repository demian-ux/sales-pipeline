// Discovery work-status transitions (2026-07-06). Keeps the "a run acted on
// this row" signal current so the next run judges only what's new. See the
// WorkStatus type and GET /api/discoveries (default board hides worked rows).

import { getSupabaseAdmin } from '@/lib/supabase'

// Mark a discovery `drafted` when outreach copy is generated for it — but only
// if it's still `unworked`, so a hand-set held / rejected / already_engaged
// state is never downgraded. Best-effort: a failure here must never fail the
// draft generation, so errors are swallowed with a warning.
export async function markDiscoveryDrafted(discoveryId: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('discoveries')
      .update({ work_status: 'drafted', worked_at: new Date().toISOString() })
      .eq('id', discoveryId)
      .eq('work_status', 'unworked')
    // 42703 = column not yet added (migration not applied). Don't warn loudly —
    // it's expected until 2026-07-06_cold_supply_fixes.sql runs.
    if (error && error.code !== '42703') {
      console.warn('[work-status] markDiscoveryDrafted warning:', error.message)
    }
  } catch (err) {
    console.warn('[work-status] markDiscoveryDrafted failed:', err instanceof Error ? err.message : err)
  }
}
