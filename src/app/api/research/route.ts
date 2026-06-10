import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getResearchFindings, saveResearchFinding } from '@/lib/sheets'
import type { ResearchFinding } from '@/lib/types'

const CreateResearchBody = z.object({
  company_id: z.string().min(1, 'company_id is required'),
  lead_id: z.string().optional(),
  source_type: z.string().optional(),
  source_url: z.string().optional(),
  research_summary: z.string().min(1, 'research_summary is required'),
  design_observations: z.string().optional(),
  market_positioning: z.string().optional(),
  visual_identity_notes: z.string().optional(),
  signals_detected: z.string().optional(),
})

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
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }

    const parsed = CreateResearchBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data

    const finding: ResearchFinding = {
      finding_id: `rf_${randomUUID()}`,
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
