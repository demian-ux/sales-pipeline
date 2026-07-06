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
import { cleanName, PIPELINE_STAGES, LEAD_STATUSES } from '@/lib/vocab'

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

const score = z.coerce.number().min(1, 'Scores must be between 1 and 10').max(10, 'Scores must be between 1 and 10').optional()

// Whitelisted editable fields. `.strict()` makes unknown keys a 400 with the
// rejected field names — silently dropping them misled API clients into
// thinking the write succeeded.
const PatchBody = z.object({
  pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
  relationship_temperature: z.string().optional(),
  lead_status: z.enum(LEAD_STATUSES).optional(),
  campaign_id: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  title: z.string().optional(),
  company_name: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  owner: z.string().optional(),
  preferred_communication_style: z.string().optional(),
  last_touch_date: z.string().optional(),
  last_meaningful_touch: z.string().optional(),
  next_action: z.string().optional(),
  next_followup_date: z.string().optional(),
  known_pain_points: z.string().optional(),
  notes: z.string().optional(),
  held_reason: z.string().optional(),
  held_until: z.string().optional(),
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
}).strict()

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
      const unknownKeys = parsed.error.issues
        .filter((i) => i.code === 'unrecognized_keys')
        .flatMap((i) => (i as { keys?: string[] }).keys ?? [])
      if (unknownKeys.length > 0) {
        return NextResponse.json(
          { error: `Unknown fields: ${unknownKeys.join(', ')}`, rejected_fields: unknownKeys },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }

    // Moving a lead to Held requires a reason — either supplied now or already
    // on the lead. Enforced with an honest 400 so a held-without-reason write
    // can't slip through as a silent success.
    if (parsed.data.pipeline_stage === 'Held') {
      const reason = parsed.data.held_reason?.trim() || lead.held_reason?.trim()
      if (!reason) {
        return NextResponse.json(
          { error: 'held_reason is required when moving a lead to the Held stage' },
          { status: 400 },
        )
      }
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, val]) => val !== undefined)
    ) as Partial<Lead>

    // Names arrive from imports/agents with double spaces — normalize on write.
    for (const key of ['first_name', 'last_name', 'full_name', 'company_name'] as const) {
      if (typeof updates[key] === 'string') updates[key] = cleanName(updates[key])
    }
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      if (updates.full_name === undefined) {
        updates.full_name = cleanName(`${updates.first_name ?? lead.first_name} ${updates.last_name ?? lead.last_name}`)
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const { ok, unwritten } = await updateLead(id, updates)
    if (!ok) {
      return NextResponse.json({ error: 'Lead not found in sheet' }, { status: 404 })
    }
    const updated = await getLeadById(id)
    // Never a silent drop: if a requested field's column is missing from the
    // Leads tab (e.g. held_reason/held_until before the sheet is synced), the
    // write for that field did NOT land — say so explicitly.
    if (unwritten.length > 0) {
      return NextResponse.json({
        lead: updated,
        warnings: [
          `These fields were not saved because the Leads sheet has no matching column: ${unwritten.join(', ')}. Add them to the header row (see /settings/sheets), then retry.`,
        ],
        unwritten_fields: unwritten,
      })
    }
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
