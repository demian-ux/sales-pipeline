import { NextRequest, NextResponse } from 'next/server'
import {
  getLeads,
  getCompanies,
  createLead,
  createCompany,
  getOpportunities,
  updateOpportunity,
} from '@/lib/sheets'
import type { ApolloImportRow, ApolloImportResult, Lead, Company, Opportunity } from '@/lib/types'

function normalize(s?: string): string {
  return (s ?? '').toLowerCase().trim()
}

function detectDuplicate(
  row: ApolloImportRow,
  existingLeads: Lead[]
): { duplicate_of: string; reason: string } | null {
  const email = normalize(row.email)
  const linkedin = normalize(row.linkedin_url)
  const fullName = normalize(`${row.first_name} ${row.last_name}`)
  const company = normalize(row.company_name)

  for (const lead of existingLeads) {
    if (email && normalize(lead.email) === email) {
      return { duplicate_of: lead.lead_id, reason: `Email match: ${row.email}` }
    }
    if (linkedin && normalize(lead.linkedin_url) === linkedin) {
      return { duplicate_of: lead.lead_id, reason: `LinkedIn URL match` }
    }
    if (fullName && company && normalize(lead.full_name) === fullName && normalize(lead.company_name) === company) {
      return { duplicate_of: lead.lead_id, reason: `Name + company match: ${row.first_name} ${row.last_name} at ${row.company_name}` }
    }
  }
  return null
}

// POST /api/import/apollo
// Body: { rows: ApolloImportRow[], campaign_id?: string, dry_run?: boolean }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const rows: ApolloImportRow[] = body.rows ?? []
    const campaignId: string | undefined = body.campaign_id
    const dryRun: boolean = body.dry_run ?? false

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    const [existingLeads, existingCompanies, existingOpportunities] = await Promise.all([
      getLeads(),
      getCompanies(),
      getOpportunities(),
    ])

    const companyMap = new Map(existingCompanies.map((c) => [normalize(c.company_name), c]))
    // Track which Company-level Opportunities have been claimed during this
    // import so a single unclaimed opp doesn't get attached to multiple new
    // leads at the same company.
    const claimedOppIds = new Set<string>()
    const autoAttached: { lead_id: string; opportunity_id: string }[] = []
    const results: ApolloImportRow[] = []

    for (const row of rows) {
      const dup = detectDuplicate(row, existingLeads)
      results.push({
        ...row,
        action: dup ? 'duplicate' : 'create',
        duplicate_of: dup?.duplicate_of,
        duplicate_reason: dup?.reason,
      })
    }

    // Dry run: return annotated rows only
    if (dryRun) {
      return NextResponse.json({ rows: results })
    }

    // Actual import
    const summary: ApolloImportResult = {
      created_leads: 0,
      created_companies: 0,
      skipped_duplicates: 0,
      errors: [],
    }

    const now = new Date().toISOString()

    for (const row of results) {
      if (row.action === 'duplicate') {
        summary.skipped_duplicates++
        continue
      }

      try {
        // Find or create company
        let companyId: string
        const existingCompany = companyMap.get(normalize(row.company_name))

        if (existingCompany) {
          companyId = existingCompany.company_id
        } else {
          companyId = `co_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
          const newCompany: Company = {
            company_id: companyId,
            company_name: row.company_name,
            website: row.website,
            linkedin_company_url: row.linkedin_company_url,
            industry: row.industry,
            location: row.location,
            company_size: row.company_size,
            created_at: now,
            updated_at: now,
          }
          await createCompany(newCompany)
          companyMap.set(normalize(row.company_name), newCompany)
          summary.created_companies++
        }

        // Create lead
        const leadId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const newLead: Lead = {
          lead_id: leadId,
          company_id: companyId,
          campaign_id: campaignId,
          first_name: row.first_name,
          last_name: row.last_name,
          full_name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          linkedin_url: row.linkedin_url,
          title: row.title,
          company_name: row.company_name,
          website: row.website,
          location: row.location,
          source: 'Apollo CSV',
          pipeline_stage: 'New Lead',
          lead_status: 'Active',
          created_at: now,
          updated_at: now,
        }
        await createLead(newLead)
        summary.created_leads++

        // Auto-attach: if exactly one open unclaimed Company-Opportunity
        // exists for this Lead's company, hook it up. Skip if 0 or >1 to
        // avoid silently wrong attachments (the user can attach manually
        // from the Lead detail page).
        const unclaimed: Opportunity[] = existingOpportunities.filter(
          (o) =>
            !claimedOppIds.has(o.opportunity_id) &&
            o.company_id === companyId &&
            !o.lead_id &&
            o.status === 'Open',
        )
        if (unclaimed.length === 1) {
          try {
            await updateOpportunity(unclaimed[0].opportunity_id, {
              lead_id: leadId,
              updated_at: now,
            })
            claimedOppIds.add(unclaimed[0].opportunity_id)
            autoAttached.push({ lead_id: leadId, opportunity_id: unclaimed[0].opportunity_id })
          } catch (err) {
            summary.errors.push(`Auto-attach opportunity for ${row.first_name} ${row.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
          }
        }
      } catch (err) {
        summary.errors.push(`${row.first_name} ${row.last_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({ summary, auto_attached: autoAttached })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    )
  }
}
