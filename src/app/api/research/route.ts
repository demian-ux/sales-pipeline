import { NextResponse } from 'next/server'
import { getResearchFindings, saveResearchFinding } from '@/lib/sheets'
import type { ResearchFinding } from '@/lib/types'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const leadId = searchParams.get('lead_id')
    const companyId = searchParams.get('company_id')

    const findings = await getResearchFindings()
    const filtered = findings.filter((f) => {
      if (leadId) return f.lead_id === leadId
      if (companyId) return f.company_id === companyId
      return true
    })

    return NextResponse.json({ findings: filtered })
  } catch (err) {
    console.error('GET /api/research error:', err)
    return NextResponse.json({ error: 'Failed to fetch research' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.company_id || !body.research_summary) {
      return NextResponse.json(
        { error: 'company_id and research_summary are required' },
        { status: 400 }
      )
    }

    const finding: ResearchFinding = {
      finding_id: `rf_${Date.now()}`,
      company_id: body.company_id,
      lead_id: body.lead_id,
      source_type: body.source_type ?? 'Manual',
      source_url: body.source_url,
      research_summary: body.research_summary,
      design_observations: body.design_observations,
      market_positioning: body.market_positioning,
      visual_identity_notes: body.visual_identity_notes,
      signals_detected: body.signals_detected,
      created_at: new Date().toISOString(),
    }

    await saveResearchFinding(finding)
    return NextResponse.json({ finding })
  } catch (err) {
    console.error('POST /api/research error:', err)
    return NextResponse.json({ error: 'Failed to save research' }, { status: 500 })
  }
}
