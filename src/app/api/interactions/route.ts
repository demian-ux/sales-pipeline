import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getInteractions, saveInteraction } from '@/lib/sheets'
import type { Interaction } from '@/lib/types'

const CreateInteractionBody = z.object({
  lead_id: z.string().min(1, 'lead_id is required'),
  company_id: z.string().min(1, 'company_id is required'),
  channel: z.enum(['Email', 'LinkedIn', 'Phone', 'Meeting', 'Other']),
  direction: z.enum(['Inbound', 'Outbound']).optional(),
  subject: z.string().optional(),
  body_summary: z.string().optional(),
  gmail_thread_id: z.string().optional(),
  gmail_message_id: z.string().optional(),
  linkedin_manual_status: z.string().optional(),
  sent_at: z.string().optional(),
})

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }

    const parsed = CreateInteractionBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data

    const interaction: Interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: body.lead_id,
      company_id: body.company_id,
      channel: body.channel,
      direction: body.direction ?? 'Outbound',
      subject: body.subject,
      body_summary: body.body_summary,
      gmail_thread_id: body.gmail_thread_id,
      gmail_message_id: body.gmail_message_id,
      linkedin_manual_status: body.linkedin_manual_status,
      sent_at: body.sent_at ?? new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    await saveInteraction(interaction)
    return NextResponse.json({ interaction })
  } catch (err) {
    console.error('POST /api/interactions error:', err)
    return NextResponse.json({ error: 'Failed to save interaction' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('lead_id')

    const interactions = await getInteractions()
    const filtered = leadId ? interactions.filter((i) => i.lead_id === leadId) : interactions

    return NextResponse.json({ interactions: filtered })
  } catch (err) {
    console.error('GET /api/interactions error:', err)
    return NextResponse.json({ error: 'Failed to fetch interactions' }, { status: 500 })
  }
}
