import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import {
  getLeads,
  getCompanies,
  createLead,
  createCompany,
  getOpportunities,
  updateOpportunity,
} from '@/lib/sheets'
import type { ApolloImportRow, ApolloImportResult, Lead, Company, Opportunity } from '@/lib/types'

import { cleanName, PIPELINE_STAGES, TEMPERATURES } from '@/lib/vocab'
import type { PipelineStage, RelationshipTemperature } from '@/lib/types'

function normalize(s?: string): string {
  return (s ?? '').toLowerCase().trim()
}

// Reject rows that are clearly CSV-parse garbage (a multiline field split one
// contact into several rows): empty names, or names containing URLs/newlines.
function validateRowShape(row: ApolloImportRow): string | null {
  const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim()
  if (!name) return 'Name is empty'
  if (/https?:\/\/|www\./i.test(name)) return 'Name contains a URL — likely a split multiline field'
  if (/[\r\n]/.test(name)) return 'Name contains a newline'
  if (!row.company_name?.trim()) return 'Company name is empty'
  if (/[\r\n]/.test(row.company_name)) return 'Company name contains a newline'
  return null
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
const MAX_IMPORT_ROWS = 2000

const ImportBody = z.object({
  rows: z
    .array(z.record(z.string(), z.string().optional()))
    .min(1, 'No rows provided')
    .max(MAX_IMPORT_ROWS, `Too many rows — max ${MAX_IMPORT_ROWS} per import`),
  campaign_id: z.string().optional(),
  dry_run: z.boolean().optional(),
  field_map: z.record(z.string(), z.string()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }

    const parsed = ImportBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }

    const rows = parsed.data.rows as unknown as ApolloImportRow[]
    const campaignId: string | undefined = parsed.data.campaign_id
    const dryRun: boolean = parsed.data.dry_run ?? false

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

    for (const raw of rows) {
      const row: ApolloImportRow = {
        ...raw,
        first_name: cleanName(raw.first_name),
        last_name: cleanName(raw.last_name),
        company_name: cleanName(raw.company_name),
      }
      const rejectReason = validateRowShape(row)
      if (rejectReason) {
        results.push({ ...row, action: 'rejected', reject_reason: rejectReason })
        continue
      }
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
      if (row.action === 'rejected') {
        summary.errors.push(`Rejected row: ${row.reject_reason}`)
        continue
      }
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
          companyId = `co_${randomUUID()}`
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
        const leadId = `lead_${randomUUID()}`
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
          source: row.source?.trim() || 'Apollo CSV',
          pipeline_stage: (PIPELINE_STAGES as readonly string[]).includes(row.pipeline_stage ?? '')
            ? (row.pipeline_stage as PipelineStage)
            : 'New Lead',
          relationship_temperature: (TEMPERATURES as readonly string[]).includes(row.relationship_temperature ?? '')
            ? (row.relationship_temperature as RelationshipTemperature)
            : undefined,
          last_touch_date: row.last_touch_date?.trim() || undefined,
          notes: row.notes?.trim() || undefined,
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
            const attached = await updateOpportunity(unclaimed[0].opportunity_id, {
              lead_id: leadId,
              updated_at: now,
            })
            if (!attached) {
              summary.errors.push(`Auto-attach opportunity for ${row.first_name} ${row.last_name}: opportunity ${unclaimed[0].opportunity_id} not found in sheet`)
            } else {
              claimedOppIds.add(unclaimed[0].opportunity_id)
              autoAttached.push({ lead_id: leadId, opportunity_id: unclaimed[0].opportunity_id })
            }
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
