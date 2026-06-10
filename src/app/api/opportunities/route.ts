import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getOpportunities, getLeads, getCompanies, createOpportunity } from '@/lib/sheets'
import type { Opportunity } from '@/lib/types'

const CreateOpportunityBody = z
  .object({
    lead_id: z.string().optional(),
    company_id: z.string().optional(),
    campaign_id: z.string().optional(),
    opportunity_type: z.string().min(1, 'opportunity_type is required'),
    source: z.string().optional(),
    summary: z.string().min(1, 'summary is required'),
    why_now: z.string().min(1, 'why_now is required'),
    recommended_action: z.string().min(1, 'recommended_action is required'),
    urgency: z.enum(['High', 'Medium', 'Low']).optional(),
    confidence: z.coerce.number().min(0, 'confidence must be between 0 and 100').max(100, 'confidence must be between 0 and 100').optional(),
  })
  .refine((b) => !!b.lead_id || !!b.company_id, {
    message: 'At least one of lead_id or company_id is required',
  })

export async function GET() {
  try {
    const [opportunities, leads, companies] = await Promise.all([
      getOpportunities(),
      getLeads(),
      getCompanies(),
    ])

    const leadMap = new Map(leads.map((l) => [l.lead_id, l]))
    const companyMap = new Map(companies.map((c) => [c.company_id, c]))

    const enriched = opportunities.map((opp) => ({
      ...opp,
      lead: opp.lead_id ? leadMap.get(opp.lead_id) : undefined,
      company: companyMap.get(opp.company_id),
    }))

    return NextResponse.json({ opportunities: enriched })
  } catch (err) {
    console.error('GET /api/opportunities error:', err)
    return NextResponse.json({ error: 'Failed to fetch opportunities' }, { status: 500 })
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

    const parsed = CreateOpportunityBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data
    const { lead_id, company_id, summary, why_now, recommended_action, opportunity_type } = body

    const now = new Date().toISOString()
    const opp: Opportunity = {
      opportunity_id: `opp_${randomUUID()}`,
      lead_id,
      company_id: company_id ?? '',
      campaign_id: body.campaign_id || undefined,
      opportunity_type,
      source: body.source || undefined,
      summary,
      why_now,
      recommended_action,
      urgency: body.urgency || 'Medium',
      confidence: body.confidence ?? 50,
      status: 'Open',
      created_at: now,
      updated_at: now,
    }

    await createOpportunity(opp)
    return NextResponse.json({ opportunity: opp }, { status: 201 })
  } catch (err) {
    console.error('POST /api/opportunities error:', err)
    return NextResponse.json({ error: 'Failed to create opportunity' }, { status: 500 })
  }
}
