// PATCH /api/value-touches/{id} — confirm a send / log a reply.
//
// Rule 4 (send confirmation): sent_at is only settable together with a real
// gmail_thread_id (same discipline as leads — never assume a draft went out).
// Setting sent_at auto-computes bump_due = sent_at + 7d unless one is provided.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { REPLY_STATUSES } from '@/lib/vocab'
import { rejectUnknownKeys } from '@/lib/api/strict-body'

const WRITABLE = ['reply_status', 'gmail_thread_id', 'notes', 'contact_id', 'sent_at', 'bump_due'] as const

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const unknown = rejectUnknownKeys(body, WRITABLE)
  if (unknown) return unknown

  const supabase = getSupabaseAdmin()
  const { data: existing } = await supabase
    .from('value_touches')
    .select('touch_id, gmail_thread_id, sent_at')
    .eq('touch_id', id)
    .maybeSingle()
  if (!existing) return Response.json({ error: 'Touch not found' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.reply_status !== undefined) {
    if (!REPLY_STATUSES.includes(body.reply_status)) {
      return Response.json({ error: `Invalid reply_status: ${body.reply_status}` }, { status: 400 })
    }
    update.reply_status = body.reply_status
  }
  if (body.gmail_thread_id !== undefined) update.gmail_thread_id = body.gmail_thread_id || null
  if (body.notes !== undefined) update.notes = body.notes === null ? null : String(body.notes)
  if (body.contact_id !== undefined) update.contact_id = body.contact_id || null

  if (body.sent_at !== undefined) {
    if (body.sent_at === null) {
      update.sent_at = null
      update.bump_due = null
    } else {
      // Rule 4: a send is only real with a thread id (from this body or already stored).
      const threadId = (body.gmail_thread_id ?? existing.gmail_thread_id) || null
      if (!threadId) {
        return Response.json(
          { error: 'sent_at requires a gmail_thread_id — never assume a draft went out' },
          { status: 400 },
        )
      }
      const sentMs = Date.parse(body.sent_at)
      if (Number.isNaN(sentMs)) {
        return Response.json({ error: 'sent_at must be an ISO timestamp' }, { status: 400 })
      }
      update.sent_at = new Date(sentMs).toISOString()
      update.bump_due = body.bump_due ?? new Date(sentMs + 7 * 86_400_000).toISOString().slice(0, 10)
    }
  } else if (body.bump_due !== undefined) {
    update.bump_due = body.bump_due || null
  }

  if (Object.keys(update).length === 1) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('value_touches')
    .update(update)
    .eq('touch_id', id)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ touch: data })
}
