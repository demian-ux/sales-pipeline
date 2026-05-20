import { NextRequest, NextResponse } from 'next/server'
import { getCompanyById, getLeads } from '@/lib/sheets'
import { prioritizeStakeholders } from '@/lib/claude'
import { sessionCache } from '@/lib/sheets/cache'

// POST /api/ai/prioritize-stakeholders
// Body: { company_id: string }
export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json()
    if (!company_id) {
      return NextResponse.json({ error: 'company_id required' }, { status: 400 })
    }

    const [company, allLeads] = await Promise.all([
      getCompanyById(company_id),
      getLeads(),
    ])

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    const companyLeads = allLeads.filter((l) => l.company_id === company_id && l.lead_status !== 'Archived')

    if (companyLeads.length === 0) {
      return NextResponse.json({ error: 'No active leads at this company' }, { status: 400 })
    }

    const result = await prioritizeStakeholders(company, companyLeads)

    // Cache the result so the company detail page can show it without re-calling Claude
    sessionCache.stakeholderPrioritizations[company_id] = result

    return NextResponse.json({ prioritization: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Prioritization failed' },
      { status: 500 }
    )
  }
}
