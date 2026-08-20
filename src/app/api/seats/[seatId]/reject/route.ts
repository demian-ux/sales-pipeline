// POST /api/seats/{seatId}/reject — Gate 1 reject, with a reason. The seat
// flips to seat_failed:rejected and the firm is not re-sourced (the worker
// skips firms with an existing seat row).

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const Body = z.object({ reason: z.string().min(1, 'reason is required') })

export async function POST(request: NextRequest, { params }: { params: Promise<{ seatId: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { seatId } = await params
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('firm_seats')
    .update({
      seat_status: 'seat_failed',
      fail_reason: `rejected:${parsed.data.reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('seat_id', seatId)
    .eq('seat_status', 'seat_pending')
    .select()
    .single()
  if (error || !data) return Response.json({ error: 'Seat not found or not pending' }, { status: 404 })
  return Response.json({ seat: data })
}
