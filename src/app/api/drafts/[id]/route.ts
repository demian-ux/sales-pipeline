import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeadById, saveInteraction, updateLead } from '@/lib/sheets'
import type { Interaction, Lead } from '@/lib/types'
import { DRAFT_STATUSES, INTERACTION_TYPE_TO_CHANNEL } from '@/lib/vocab'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  const { data, error } = await getSupabaseAdmin().from('lead_drafts').select('*').eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  return NextResponse.json({ draft: data })
}

const PatchBody = z.object({
  status: z.enum(DRAFT_STATUSES).optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
}).strict()

// PATCH /api/drafts/[id] — edit or transition a draft. Marking it `sent`
// auto-logs an Interaction and bumps the lead's last_touch_date.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  try {
    const { id } = await params
    const supabase = getSupabaseAdmin()
    const { data: draft, error: fetchErr } = await supabase.from('lead_drafts').select('*').eq('id', id).single()
    if (fetchErr || !draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = PatchBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    ) as { status?: string; subject?: string; body?: string }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const becomingSent = updates.status === 'sent' && draft.status !== 'sent'

    const { data: updated, error: updErr } = await supabase
      .from('lead_drafts')
      .update({ ...updates, updated_at: nowIso, ...(becomingSent ? { sent_at: nowIso } : {}) })
      .eq('id', id)
      .select()
      .single()
    if (updErr) throw new Error(updErr.message)

    let interaction: Interaction | null = null
    if (becomingSent) {
      const lead = await getLeadById(draft.lead_id)
      if (lead) {
        interaction = {
          interaction_id: `int_${randomUUID()}`,
          lead_id: draft.lead_id,
          company_id: lead.company_id,
          channel: INTERACTION_TYPE_TO_CHANNEL[draft.channel] ?? 'Other',
          direction: 'Outbound',
          subject: draft.subject ?? `${draft.channel} draft sent`,
          body_summary: (updates.body ?? draft.body).slice(0, 300),
          sent_at: nowIso,
          created_at: nowIso,
        }
        await saveInteraction(interaction)
        const leadUpdates: Partial<Lead> = { last_touch_date: nowIso, updated_at: nowIso }
        await updateLead(draft.lead_id, leadUpdates)
      }
    }

    return NextResponse.json({ draft: updated, interaction })
  } catch (err) {
    console.error('PATCH /api/drafts/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update draft' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  const { error } = await getSupabaseAdmin().from('lead_drafts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
