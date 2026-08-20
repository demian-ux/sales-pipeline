// GET /api/seats — the seats queue + ledger summary.
//   ?status=seat_pending (default) | unworked | seat_approved | lead_created |
//   seat_failed | all
// Each row joins the firm and its prior value touches so the review view can
// show "historia de la firm" without another round-trip.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { creditsSpentThisWeek, weeklyBudget } from '@/lib/seats/ledger'

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const status = request.nextUrl.searchParams.get('status') ?? 'seat_pending'
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('firm_seats')
    .select('*, firm_pool(name, domain, geo, categories, icp_notes, linked_company_id)')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (status !== 'all') query = query.eq('seat_status', status)

  const { data: seats, error } = await query
  if (error) {
    if (error.code === '42P01') {
      return Response.json(
        { error: 'firm_seats table missing — apply supabase/migrations/2026-08-20_seats.sql', code: '42P01' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Prior value touches per firm (history for the review card).
  const firmIds = (seats ?? []).map((s) => s.firm_id)
  const touchesByFirm: Record<string, unknown[]> = {}
  if (firmIds.length > 0) {
    const { data: touches } = await supabase
      .from('value_touches')
      .select('firm_id, signal_ref, sent_at, reply_status')
      .in('firm_id', firmIds)
    for (const t of touches ?? []) {
      ;(touchesByFirm[t.firm_id] ??= []).push(t)
    }
  }

  const spent = await creditsSpentThisWeek().catch(() => null)
  return Response.json({
    seats: (seats ?? []).map((s) => ({ ...s, touches: touchesByFirm[s.firm_id] ?? [] })),
    budget: { weekly: weeklyBudget(), spent_this_week: spent },
  })
}
