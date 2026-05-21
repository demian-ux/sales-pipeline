import { NextResponse } from 'next/server'
import {
  getLeadById,
  getCompanyById,
  getResearchForLead,
  getInteractionsForLead,
  getOpportunitiesForLead,
  getCampaigns,
  saveAIInsight,
} from '@/lib/sheets'
import { analyzeLeadWhyNow } from '@/lib/claude'
import type { AIInsight } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const { lead_id } = await req.json()
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
    }

    const lead = await getLeadById(lead_id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const [company, findings, interactions, opportunities, campaigns] = await Promise.all([
      getCompanyById(lead.company_id),
      getResearchForLead(lead_id),
      getInteractionsForLead(lead_id),
      getOpportunitiesForLead(lead_id, lead.company_id),
      getCampaigns(),
    ])

    const campaign = lead.campaign_id ? campaigns.find((c) => c.campaign_id === lead.campaign_id) ?? null : null

    const analysis = await analyzeLeadWhyNow(lead, company, findings, interactions, opportunities, campaign)

    const insight: AIInsight = {
      insight_id: `ai_${Date.now()}`,
      lead_id,
      company_id: lead.company_id,
      ...analysis,
      created_at: new Date().toISOString(),
    }

    await saveAIInsight(insight)

    return NextResponse.json({ insight })
  } catch (err) {
    console.error('POST /api/analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
