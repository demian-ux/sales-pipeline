import { NextResponse } from 'next/server'
import {
  getLeadById,
  getCompanyById,
  getOpportunitiesForLead,
  getInteractionsForLead,
  getInsightsForLead,
  getResearchForLead,
  updateLead,
  deleteLead,
} from '@/lib/sheets'
import type { Lead } from '@/lib/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const [company, opportunities, interactions, insights, research] = await Promise.all([
      getCompanyById(lead.company_id),
      getOpportunitiesForLead(id),
      getInteractionsForLead(id),
      getInsightsForLead(id),
      getResearchForLead(id),
    ])

    return NextResponse.json({ lead, company, opportunities, interactions, insights, research })
  } catch (err) {
    console.error('GET /api/leads/[id] error:', err)
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 })
  }
}

const EDITABLE_FIELDS: (keyof Lead)[] = [
  'pipeline_stage',
  'relationship_temperature',
  'lead_status',
  'campaign_id',
  'next_action',
  'next_followup_date',
  'known_pain_points',
  'notes',
  'linkedin_url',
  'linkedin_connection_status',
  'linkedin_dm_status',
  'linkedin_warmth',
  'last_linkedin_touch_date',
  'linkedin_notes',
  'business_fit_score',
  'taste_score',
  'relationship_score',
  'opportunity_score',
  'priority_score',
]

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const body = await req.json()

    // Only allow whitelisted fields
    const updates: Partial<Lead> = {}
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(updates as any)[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await updateLead(id, updates)
    const updated = await getLeadById(id)
    return NextResponse.json({ lead: updated })
  } catch (err) {
    console.error('PATCH /api/leads/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ok = await deleteLead(id)
    if (!ok) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('DELETE /api/leads/[id] error:', err)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }
}
