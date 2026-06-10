import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeads, getCompanies, getOpportunities, getAIInsights, getInteractions, createLead } from '@/lib/sheets'
import type {
  Lead,
  LeadWithCompany,
  PipelineStage,
  LeadStatus,
  RelationshipTemperature,
  LinkedInConnectionStatus,
  LinkedInDMStatus,
  LinkedInWarmth,
} from '@/lib/types'

const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Replied', 'Discovery', 'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Nurture', 'Dormant'] as const satisfies readonly PipelineStage[]
const LEAD_STATUSES = ['Active', 'Inactive', 'Archived'] as const satisfies readonly LeadStatus[]
const TEMPERATURES = ['Hot', 'Warm', 'Cool', 'Cold'] as const satisfies readonly RelationshipTemperature[]
const LINKEDIN_CONNECTION_STATUSES = ['Not Connected', 'Connection Ready', 'Connection Sent', 'Connected', 'Unknown'] as const satisfies readonly LinkedInConnectionStatus[]
const LINKEDIN_DM_STATUSES = ['Not Started', 'DM Ready', 'DM Sent', 'Replied', 'Not Interested', 'Unknown'] as const satisfies readonly LinkedInDMStatus[]
const LINKEDIN_WARMTHS = ['Passive', 'Aware', 'Connected', 'Warm', 'Engaged', 'Active'] as const satisfies readonly LinkedInWarmth[]

const score = z.coerce.number().min(1, 'Scores must be between 1 and 10').max(10, 'Scores must be between 1 and 10').optional()

const CreateLeadBody = z
  .object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    full_name: z.string().optional(),
    company_name: z.string().min(1, 'company_name is required'),
    company_id: z.string().optional(),
    campaign_id: z.string().optional(),
    email: z.string().email('Invalid email').or(z.literal('')).optional(),
    linkedin_url: z.string().optional(),
    linkedin_connection_status: z.enum(LINKEDIN_CONNECTION_STATUSES).optional(),
    linkedin_dm_status: z.enum(LINKEDIN_DM_STATUSES).optional(),
    linkedin_warmth: z.enum(LINKEDIN_WARMTHS).optional(),
    last_linkedin_touch_date: z.string().optional(),
    linkedin_notes: z.string().optional(),
    title: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    source: z.string().optional(),
    pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
    lead_status: z.enum(LEAD_STATUSES).optional(),
    business_fit_score: score,
    taste_score: score,
    relationship_score: score,
    opportunity_score: score,
    priority_score: score,
    relationship_temperature: z.enum(TEMPERATURES).optional(),
    next_action: z.string().optional(),
    next_followup_date: z.string().optional(),
    known_pain_points: z.string().optional(),
    preferred_communication_style: z.string().optional(),
    owner: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (b) => !!b.full_name?.trim() || (!!b.first_name?.trim() && !!b.last_name?.trim()),
    { message: 'full_name (or first_name + last_name) is required' },
  )

export async function GET() {
  try {
    const [leads, companies, opportunities, insights, interactions] = await Promise.all([
      getLeads(),
      getCompanies(),
      getOpportunities(),
      getAIInsights(),
      getInteractions(),
    ])

    const companyMap = new Map(companies.map((c) => [c.company_id, c]))
    const oppMap = new Map<string, typeof opportunities[0]>()
    opportunities.forEach((o) => {
      // Skip Company-level opps when building a lead-keyed map; they show
      // on every Lead at the same Company via the broadened filter in
      // getOpportunitiesForLead, not via this enrichment path.
      if (!o.lead_id) return
      const existing = oppMap.get(o.lead_id)
      if (!existing || new Date(o.created_at) > new Date(existing.created_at)) {
        oppMap.set(o.lead_id, o)
      }
    })
    const insightMap = new Map<string, typeof insights[0]>()
    insights.forEach((i) => {
      const existing = insightMap.get(i.lead_id)
      if (!existing || new Date(i.created_at) > new Date(existing.created_at)) {
        insightMap.set(i.lead_id, i)
      }
    })

    const enriched: LeadWithCompany[] = leads.map((lead) => ({
      ...lead,
      company: companyMap.get(lead.company_id),
      latest_opportunity: oppMap.get(lead.lead_id),
      latest_insight: insightMap.get(lead.lead_id),
      recent_interactions: interactions
        .filter((i) => i.lead_id === lead.lead_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    }))

    return NextResponse.json({ leads: enriched })
  } catch (err) {
    console.error('GET /api/leads error:', err)
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }

    const parsed = CreateLeadBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data
    const { first_name, last_name, company_name } = body

    const now = new Date().toISOString()
    const lead_id = `lead_${randomUUID()}`
    const company_id = body.company_id || `comp_${randomUUID()}`

    const lead: Lead = {
      lead_id,
      company_id,
      campaign_id: body.campaign_id || undefined,
      first_name: first_name ?? '',
      last_name: last_name ?? '',
      full_name: body.full_name?.trim() || `${first_name} ${last_name}`,
      email: body.email || undefined,
      linkedin_url: body.linkedin_url || undefined,
      linkedin_connection_status: body.linkedin_connection_status || (body.linkedin_url ? 'Not Connected' : undefined),
      linkedin_dm_status: body.linkedin_dm_status || (body.linkedin_url ? 'Not Started' : undefined),
      linkedin_warmth: body.linkedin_warmth || (body.linkedin_url ? 'Passive' : undefined),
      last_linkedin_touch_date: body.last_linkedin_touch_date || undefined,
      linkedin_notes: body.linkedin_notes || undefined,
      title: body.title || undefined,
      company_name,
      website: body.website || undefined,
      location: body.location || undefined,
      source: body.source || undefined,
      pipeline_stage: body.pipeline_stage || 'New Lead',
      lead_status: body.lead_status || 'Active',
      business_fit_score: body.business_fit_score ? Number(body.business_fit_score) : undefined,
      taste_score: body.taste_score ? Number(body.taste_score) : undefined,
      relationship_score: body.relationship_score ? Number(body.relationship_score) : undefined,
      opportunity_score: body.opportunity_score ? Number(body.opportunity_score) : undefined,
      priority_score: body.priority_score ? Number(body.priority_score) : undefined,
      relationship_temperature: body.relationship_temperature || undefined,
      next_action: body.next_action || undefined,
      next_followup_date: body.next_followup_date || undefined,
      known_pain_points: body.known_pain_points || undefined,
      preferred_communication_style: body.preferred_communication_style || undefined,
      owner: body.owner || undefined,
      notes: body.notes || undefined,
      created_at: now,
      updated_at: now,
    }

    await createLead(lead)
    return NextResponse.json({ lead }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads error:', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
