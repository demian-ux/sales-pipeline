import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeadById, getInteractionsForLead, saveInteraction, updateLead } from '@/lib/sheets'
import type { Interaction, Lead } from '@/lib/types'
import { INTERACTION_CHANNELS, INTERACTION_DIRECTIONS, INTERACTION_TYPE_TO_CHANNEL } from '@/lib/vocab'

// GET /api/leads/[id]/interactions — interaction history for one lead.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const interactions = await getInteractionsForLead(id)
    interactions.sort((a, b) => new Date(b.sent_at ?? b.created_at).getTime() - new Date(a.sent_at ?? a.created_at).getTime())
    return NextResponse.json({ interactions })
  } catch (err) {
    console.error('GET /api/leads/[id]/interactions error:', err)
    return NextResponse.json({ error: 'Failed to fetch interactions' }, { status: 500 })
  }
}

const PostBody = z.object({
  // Accept either the canonical Sheets channel or the agent-friendly type alias.
  channel: z.enum(INTERACTION_CHANNELS).optional(),
  type: z.enum(['call', 'email', 'linkedin_dm', 'meeting', 'letter']).optional(),
  direction: z.enum(INTERACTION_DIRECTIONS).optional(),
  date: z.string().optional(),
  sent_at: z.string().optional(),
  subject: z.string().optional(),
  summary: z.string().optional(),
  body_summary: z.string().optional(),
  link: z.string().optional(),
  meaningful: z.boolean().optional(),
}).refine((b) => b.channel || b.type, { message: 'channel or type is required' })

// POST /api/leads/[id]/interactions — log an event. Side effect: bumps the
// lead's last_touch_date (and last_meaningful_touch when meaningful: true).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = PostBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data

    const sentAt = body.sent_at ?? body.date ?? new Date().toISOString()
    const summary = body.body_summary ?? body.summary
    const interaction: Interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: id,
      company_id: lead.company_id,
      channel: body.channel ?? INTERACTION_TYPE_TO_CHANNEL[body.type!],
      direction: body.direction ?? 'Outbound',
      subject: body.subject,
      body_summary: body.link ? `${summary ?? ''}${summary ? ' ' : ''}(${body.link})` : summary,
      sent_at: sentAt,
      created_at: new Date().toISOString(),
    }
    await saveInteraction(interaction)

    // Keep relationship state in sync with reality: only move dates forward.
    const leadUpdates: Partial<Lead> = { updated_at: new Date().toISOString() }
    const newer = (current?: string) => !current || new Date(sentAt) >= new Date(current)
    if (newer(lead.last_touch_date)) leadUpdates.last_touch_date = sentAt
    if (body.meaningful && newer(lead.last_meaningful_touch)) leadUpdates.last_meaningful_touch = sentAt
    await updateLead(id, leadUpdates)

    return NextResponse.json({ interaction, lead_updates: leadUpdates }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads/[id]/interactions error:', err)
    return NextResponse.json({ error: 'Failed to log interaction' }, { status: 500 })
  }
}
