import { NextResponse } from 'next/server'
import { getInteractions, saveInteraction } from '@/lib/sheets'
import type { Interaction } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const interaction: Interaction = {
      interaction_id: `int_${Date.now()}`,
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
