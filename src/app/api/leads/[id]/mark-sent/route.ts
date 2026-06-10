import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  getLeadById,
  updateLead,
  saveInteraction,
  getCampaigns,
} from '@/lib/sheets'
import { saveWorkflowAction, newWorkflowActionId } from '@/lib/workflow/store'
import { nextFollowupDate } from '@/lib/cadence'
import type { Interaction, InteractionChannel, Lead } from '@/lib/types'

const CHANNELS: Record<string, { interaction: InteractionChannel; label: string }> = {
  email: { interaction: 'Email', label: 'Email' },
  linkedin: { interaction: 'LinkedIn', label: 'LinkedIn DM' },
  letter: { interaction: 'Other', label: 'Physical letter' },
}

// POST /api/leads/[id]/mark-sent
// Body: { channel: 'email' | 'linkedin' | 'letter', subject?, body_summary? }
//
// One-click write-through for an outbound send:
//   1. logs an Outbound Interaction (durable history)
//   2. sets last_touch_date; bumps pipeline_stage New Lead → Contacted
//   3. proposes next_followup_date from the lead's campaign cadence
//      (only when no future follow-up is already scheduled)
//   4. records a workflow action (drives sent-state in the UI)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const kind = String(body.channel ?? '')
    const channel = CHANNELS[kind]
    if (!channel) {
      return NextResponse.json(
        { error: "channel must be 'email', 'linkedin', or 'letter'" },
        { status: 400 },
      )
    }

    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const now = new Date()
    const nowIso = now.toISOString()
    const today = nowIso.slice(0, 10)

    const interaction: Interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: id,
      company_id: lead.company_id,
      channel: channel.interaction,
      direction: 'Outbound',
      subject: body.subject ? String(body.subject).slice(0, 200) : `${channel.label} sent`,
      body_summary: body.body_summary ? String(body.body_summary).slice(0, 300) : undefined,
      sent_at: nowIso,
      created_at: nowIso,
    }
    await saveInteraction(interaction)

    const updates: Partial<Lead> = { last_touch_date: today }
    if (lead.pipeline_stage === 'New Lead') updates.pipeline_stage = 'Contacted'

    const existing = lead.next_followup_date ? new Date(lead.next_followup_date) : null
    const hasFutureFollowup = !!existing && !isNaN(existing.getTime()) && existing > now
    if (!hasFutureFollowup) {
      const campaigns = await getCampaigns()
      const campaign = lead.campaign_id
        ? campaigns.find((c) => c.campaign_id === lead.campaign_id)
        : undefined
      updates.next_followup_date = nextFollowupDate(campaign?.cadence, now)
      if (!lead.next_action) {
        updates.next_action = `Follow up — ${channel.label.toLowerCase()} sent ${today}, no reply yet`
      }
    }
    await updateLead(id, updates)

    await saveWorkflowAction({
      action_id: newWorkflowActionId(),
      type: 'draft_sent',
      lead_id: id,
      channel: kind === 'letter' ? undefined : (kind as 'email' | 'linkedin'),
      note: kind === 'letter' ? 'letter' : undefined,
      recorded_at: nowIso,
    })

    return NextResponse.json({
      ok: true,
      interaction_id: interaction.interaction_id,
      lead_updates: updates,
    })
  } catch (err) {
    console.error('POST /api/leads/[id]/mark-sent error:', err)
    return NextResponse.json({ error: 'Failed to mark sent' }, { status: 500 })
  }
}
