import { NextResponse } from 'next/server'
import { getLeads, getCompanies, getOpportunities, getAIInsights, getInteractions } from '@/lib/sheets'
import type { LeadWithCompany } from '@/lib/types'
import { createLeadFromJson } from '@/lib/leads/create'

// GET /api/leads?stage=&temperature=&company=&q=&email=&followup_due=&updated_after=&limit=&offset=
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const stage = searchParams.get('stage')
    const temperature = searchParams.get('temperature')
    const companyFilter = searchParams.get('company')?.toLowerCase().trim()
    const q = searchParams.get('q')?.toLowerCase().trim()
    // Exact-match email lookup (2026-08-27): the send-log flow resolves leads
    // by address 49 times per batch — fuzzy ?q= + client-side filtering was
    // slow and fragile for that.
    const email = searchParams.get('email')?.toLowerCase().trim()
    // followup_due=YYYY-MM-DD (or 'today'): leads whose next_followup_date is
    // on or before that date — the "overdue follow-ups" open of every block.
    const followupDueRaw = searchParams.get('followup_due')?.trim()
    const followupDue = followupDueRaw === 'today'
      ? new Date().toISOString().slice(0, 10)
      : followupDueRaw
    if (followupDue && !/^\d{4}-\d{2}-\d{2}$/.test(followupDue)) {
      return NextResponse.json({ error: 'followup_due: must be YYYY-MM-DD or "today"' }, { status: 400 })
    }
    // updated_after=ISO timestamp (or date): incremental reconciliation cursor.
    const updatedAfter = searchParams.get('updated_after')?.trim()
    if (updatedAfter && Number.isNaN(new Date(updatedAfter).getTime())) {
      return NextResponse.json({ error: 'updated_after: must be an ISO date or timestamp' }, { status: 400 })
    }
    const limit = Math.max(0, Number(searchParams.get('limit')) || 0)
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0)

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

    const filtered = leads.filter((lead) => {
      if (stage && lead.pipeline_stage !== stage) return false
      if (temperature && lead.relationship_temperature !== temperature) return false
      if (companyFilter && !(lead.company_name ?? '').toLowerCase().includes(companyFilter)) return false
      if (email && (lead.email ?? '').toLowerCase().trim() !== email) return false
      if (followupDue && !(lead.next_followup_date && lead.next_followup_date.slice(0, 10) <= followupDue)) return false
      if (updatedAfter && !(lead.updated_at && new Date(lead.updated_at) > new Date(updatedAfter))) return false
      if (q) {
        const haystack = `${lead.full_name} ${lead.first_name} ${lead.last_name} ${lead.email ?? ''} ${lead.company_name ?? ''} ${lead.title ?? ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
    const total = filtered.length
    const page = limit > 0 ? filtered.slice(offset, offset + limit) : filtered.slice(offset)

    const enriched: LeadWithCompany[] = page.map((lead) => ({
      ...lead,
      company: companyMap.get(lead.company_id),
      latest_opportunity: oppMap.get(lead.lead_id),
      latest_insight: insightMap.get(lead.lead_id),
      recent_interactions: interactions
        .filter((i) => i.lead_id === lead.lead_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    }))

    return NextResponse.json({ leads: enriched, total, limit: limit || null, offset })
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

    const result = await createLeadFromJson(json)
    if (!result.ok) {
      return NextResponse.json(
        result.duplicate_of ? { error: result.error, duplicate_of: result.duplicate_of } : { error: result.error },
        { status: result.status },
      )
    }
    return NextResponse.json({ lead: result.lead }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads error:', err)
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 })
  }
}
