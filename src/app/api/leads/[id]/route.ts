import { NextResponse } from 'next/server'
import { z } from 'zod'
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
      getOpportunitiesForLead(id, lead.company_id),
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

const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Replied', 'Discovery', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Nurture', 'Dormant'] as const
const LEAD_STATUSES = ['Active', 'Inactive', 'Archived'] as const

const score = z.coerce.number().min(1, 'Scores must be between 1 and 10').max(10, 'Scores must be between 1 and 10').optional()

// Whitelisted editable fields — extra keys in the body are silently dropped.
const PatchBody = z.object({
  pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
  relationship_temperature: z.string().optional(),
  lead_status: z.enum(LEAD_STATUSES).optional(),
  campaign_id: z.string().optional(),
  next_action: z.string().optional(),
  next_followup_date: z.string().optional(),
  known_pain_points: z.string().optional(),
  notes: z.string().optional(),
  linkedin_url: z.string().optional(),
  linkedin_connection_status: z.string().optional(),
  linkedin_dm_status: z.string().optional(),
  linkedin_warmth: z.string().optional(),
  last_linkedin_touch_date: z.string().optional(),
  linkedin_notes: z.string().optional(),
  business_fit_score: score,
  taste_score: score,
  relationship_score: score,
  opportunity_score: score,
  priority_score: score,
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const parsed = PatchBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, val]) => val !== undefined)
    ) as Partial<Lead>

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const ok = await updateLead(id, updates)
    if (!ok) {
      return NextResponse.json({ error: 'Lead not found in sheet' }, { status: 404 })
    }
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
