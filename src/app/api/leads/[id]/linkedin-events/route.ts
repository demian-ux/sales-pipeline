import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeadById, saveInteraction, updateLead } from '@/lib/sheets'
import type { Interaction, Lead } from '@/lib/types'

const EVENTS = [
  'connection_sent',
  'connected',
  'dm_sent',
  'reply_received',
  'profile_viewed',
  'post_engaged',
] as const

type LinkedInEvent = (typeof EVENTS)[number]

// Mirrors the LinkedIn tracker buttons in the UI: each event updates the
// lead's linkedin_* status fields and logs a LinkedIn interaction.
const EVENT_EFFECTS: Record<LinkedInEvent, { updates: Partial<Lead>; direction: 'Inbound' | 'Outbound'; label: string }> = {
  connection_sent: { updates: { linkedin_connection_status: 'Connection Sent' }, direction: 'Outbound', label: 'Connection request sent' },
  connected: { updates: { linkedin_connection_status: 'Connected', linkedin_warmth: 'Connected' }, direction: 'Inbound', label: 'Connection accepted' },
  dm_sent: { updates: { linkedin_dm_status: 'DM Sent' }, direction: 'Outbound', label: 'DM sent' },
  reply_received: { updates: { linkedin_dm_status: 'Replied', linkedin_warmth: 'Engaged' }, direction: 'Inbound', label: 'Reply received' },
  profile_viewed: { updates: {}, direction: 'Outbound', label: 'Profile viewed' },
  post_engaged: { updates: { linkedin_warmth: 'Aware' }, direction: 'Outbound', label: 'Engaged with post' },
}

const PostBody = z.object({
  event: z.enum(EVENTS),
  date: z.string().optional(),
  note: z.string().optional(),
})

// POST /api/leads/[id]/linkedin-events
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
    const { event, date, note } = parsed.data
    const effect = EVENT_EFFECTS[event]
    const when = date ?? new Date().toISOString()

    const interaction: Interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: id,
      company_id: lead.company_id,
      channel: 'LinkedIn',
      direction: effect.direction,
      subject: effect.label,
      body_summary: note,
      linkedin_manual_status: event,
      sent_at: when,
      created_at: new Date().toISOString(),
    }
    await saveInteraction(interaction)

    const leadUpdates: Partial<Lead> = {
      ...effect.updates,
      last_linkedin_touch_date: when,
      updated_at: new Date().toISOString(),
    }
    if (!lead.last_touch_date || new Date(when) >= new Date(lead.last_touch_date)) {
      leadUpdates.last_touch_date = when
    }
    await updateLead(id, leadUpdates)

    const updated = await getLeadById(id)
    return NextResponse.json({ interaction, lead: updated }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads/[id]/linkedin-events error:', err)
    return NextResponse.json({ error: 'Failed to record LinkedIn event' }, { status: 500 })
  }
}
