import { NextResponse } from 'next/server'
import { getOpportunities, getLeads, getCompanies, createOpportunity } from '@/lib/sheets'
import type { Opportunity } from '@/lib/types'

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
      lead: leadMap.get(opp.lead_id),
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
    const body = await req.json()
    const { lead_id, company_id, summary, why_now, recommended_action, opportunity_type } = body

    if (!lead_id || !company_id || !summary || !why_now || !recommended_action || !opportunity_type) {
      return NextResponse.json(
        { error: 'lead_id, company_id, summary, why_now, recommended_action, and opportunity_type are required' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const opp: Opportunity = {
      opportunity_id: `opp_${Date.now()}`,
      lead_id,
      company_id,
      campaign_id: body.campaign_id || undefined,
      opportunity_type,
      source: body.source || undefined,
      summary,
      why_now,
      recommended_action,
      urgency: body.urgency || 'Medium',
      confidence: Number(body.confidence) || 50,
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
