import { NextResponse } from 'next/server'
import {
  getLeadById,
  getCompanyById,
  getResearchForLead,
  getInteractionsForLead,
  getCampaigns,
  getMeetingPrep,
  saveMeetingPrep,
} from '@/lib/sheets'
import { prepareMeetingPrep } from '@/lib/claude'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('lead_id')
    if (!leadId) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    const cached = getMeetingPrep(leadId)
    return NextResponse.json({ prep: cached })
  } catch (err) {
    console.error('GET /api/meeting-prep error:', err)
    return NextResponse.json({ error: 'Failed to fetch prep' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { lead_id } = await req.json()
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
    }

    const lead = await getLeadById(lead_id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const [company, research, interactions, campaigns] = await Promise.all([
      getCompanyById(lead.company_id),
      getResearchForLead(lead_id),
      getInteractionsForLead(lead_id),
      getCampaigns(),
    ])

    const campaign = lead.campaign_id ? campaigns.find((c) => c.campaign_id === lead.campaign_id) ?? null : null

    const prep = await prepareMeetingPrep(lead, company, research, interactions, campaign)
    saveMeetingPrep(lead_id, prep)

    return NextResponse.json({ prep })
  } catch (err) {
    console.error('POST /api/meeting-prep error:', err)
    return NextResponse.json({ error: 'Meeting prep failed' }, { status: 500 })
  }
}
