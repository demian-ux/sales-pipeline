import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import {
  updateOpportunity,
  deleteOpportunity,
  getOpportunities,
  getLeadById,
  updateLead,
  saveInteraction,
} from '@/lib/sheets'
import type { Lead, Opportunity } from '@/lib/types'

const ALLOWED_FIELDS: (keyof Opportunity)[] = ['status', 'urgency', 'confidence', 'recommended_action', 'lead_id']

// When an opportunity is marked Contacted, write through to the lead so the
// Today queue and campaign-due signals reflect reality: log an Outbound
// interaction, set last_touch_date, bump New Lead → Contacted.
async function writeThroughContacted(oppId: string): Promise<void> {
  try {
    const opps = await getOpportunities()
    const opp = opps.find((o) => o.opportunity_id === oppId)
    if (!opp?.lead_id) return
    const lead = await getLeadById(opp.lead_id)
    if (!lead) return

    const nowIso = new Date().toISOString()
    await saveInteraction({
      interaction_id: `int_${randomUUID()}`,
      lead_id: lead.lead_id,
      company_id: lead.company_id,
      channel: 'Other',
      direction: 'Outbound',
      subject: `Marked contacted — ${opp.opportunity_type || 'opportunity'}`,
      body_summary: opp.summary ? String(opp.summary).slice(0, 200) : undefined,
      sent_at: nowIso,
      created_at: nowIso,
    })

    const updates: Partial<Lead> = { last_touch_date: nowIso.slice(0, 10) }
    if (lead.pipeline_stage === 'New Lead') updates.pipeline_stage = 'Contacted'
    await updateLead(lead.lead_id, updates)
  } catch (err) {
    // Non-fatal: the opportunity status change itself already succeeded.
    console.error('opportunities write-through failed:', err)
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const updates: Partial<Opportunity> = {}
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(updates as any)[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await updateOpportunity(id, updates)

    if (updates.status === 'Contacted') {
      await writeThroughContacted(id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/opportunities/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const deleted = await deleteOpportunity(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/opportunities/[id] error:', err)
    return NextResponse.json({ error: 'Failed to delete opportunity' }, { status: 500 })
  }
}
