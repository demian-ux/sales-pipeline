import { NextResponse } from 'next/server'
import { extractResearchSignals } from '@/lib/claude'
import { getCompanyById, getLeadById, getResearchForLead } from '@/lib/sheets'
import type { ResearchFinding } from '@/lib/types'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { raw_text, lead_id, company_name, lead_name } = body

    if (!raw_text?.trim()) {
      return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
    }

    let lead = null
    let company = null
    let existingFindings: ResearchFinding[] = []

    if (lead_id) {
      lead = await getLeadById(lead_id)
      if (lead) {
        company = await getCompanyById(lead.company_id)
        existingFindings = await getResearchForLead(lead_id)
      }
    } else if (company_name || lead_name) {
      lead = {
        full_name: lead_name ?? '',
        company_name: company_name ?? '',
        title: '',
        pipeline_stage: 'New Lead',
      } as Parameters<typeof extractResearchSignals>[1]
    }

    const extraction = await extractResearchSignals(raw_text, lead, company, existingFindings)
    return NextResponse.json({ extraction })
  } catch (err) {
    console.error('POST /api/ai/extract-research-signals error:', err)
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 })
  }
}
