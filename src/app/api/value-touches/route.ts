// POST /api/value-touches — record a value touch (drafted, not yet sent).
//
// Rule 1 (same-signal dedup): the unique(firm_id, signal_ref) index rejects a
// second touch for the same firm+signal → 409.
// Rule 2 (spacing): if the firm's last SENT touch is < 21d ago, return a
// spacing_warning — but do NOT block (the handoff says warn, not reject).
// sent_at is never set here; it's confirmed via PATCH with a gmail_thread_id.

import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const SPACING_DAYS = 21

const Body = z.object({
  firm_id:    z.string().min(1, 'firm_id is required'),
  signal_ref: z.string().min(1, 'signal_ref is required'),
  contact_id: z.string().optional(),
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'batch_date must be YYYY-MM-DD').optional(),
  notes:      z.string().optional(),
})

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const b = parsed.data
  const supabase = getSupabaseAdmin()

  const { data: firm } = await supabase.from('firm_pool').select('firm_id, name').eq('firm_id', b.firm_id).maybeSingle()
  if (!firm) return Response.json({ error: 'Firm not found' }, { status: 404 })

  // Spacing: last SENT touch for this firm.
  let spacing_warning: string | null = null
  const { data: lastSent } = await supabase
    .from('value_touches')
    .select('sent_at')
    .eq('firm_id', b.firm_id)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastSent?.sent_at) {
    const days = Math.floor((Date.now() - Date.parse(lastSent.sent_at)) / 86_400_000)
    if (days < SPACING_DAYS) {
      spacing_warning = `${firm.name} was last value-touched ${days}d ago (< ${SPACING_DAYS}d spacing).`
    }
  }

  const { data, error } = await supabase
    .from('value_touches')
    .insert({
      firm_id: b.firm_id,
      signal_ref: b.signal_ref,
      contact_id: b.contact_id ?? null,
      batch_date: b.batch_date ?? null,
      notes: b.notes ?? null,
      reply_status: 'none',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json(
        { error: `${firm.name} was already value-touched for signal "${b.signal_ref}"`, code: 'duplicate_signal' },
        { status: 409 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ touch: data, spacing_warning }, { status: 201 })
}
