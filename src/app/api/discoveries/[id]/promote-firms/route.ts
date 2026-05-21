// POST /api/discoveries/[id]/promote-firms
// Body: { firms: FirmCandidate[] }
//
// For each firm in the body:
//   1. Find-or-create a Sheets Company (case-insensitive name match)
//   2. Create a Sheets Opportunity attached to that Company (lead_id empty)
//      with discovered_from_id + discovered_from_url for provenance
//
// After all firms processed, updates the Discovery's promoted_to_opportunity_id
// to the first created opportunity (for the "Already promoted" badge) and
// flips its status to 'saved'. The full mapping lives in
// opportunities.discovered_from_id, not in this single-pointer field.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { findOrCreateCompanyByName, createOpportunity } from '@/lib/sheets'
import type { Opportunity, UrgencyLevel } from '@/lib/types'

function urgencyFromScore(score: number | null | undefined): UrgencyLevel {
  if ((score ?? 0) >= 70) return 'High'
  if ((score ?? 0) >= 40) return 'Medium'
  return 'Low'
}

function pickOpportunityType(types: string[] | null | undefined): string {
  if (!types || types.length === 0) return 'Discovery signal'
  const first = types[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

const FirmSchema = z.object({
  candidate_id: z.string(),
  name: z.string().min(1),
  country: z.string().min(1),
  project_type: z.string().min(1),
  reference_project: z.string().min(1),
  website: z.string().nullable(),
  score: z.number().int().min(0).max(100),
  source_article_url: z.string(),
  discovered_at: z.string(),
})

const BodySchema = z.object({
  firms: z.array(FirmSchema).min(1, 'At least one firm is required'),
})

export interface PromoteFirmResult {
  firm_name: string
  company_id: string
  company_was_new: boolean
  opportunity_id: string
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: discovery, error } = await supabase
    .from('discoveries')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  const results: PromoteFirmResult[] = []
  const errors: string[] = []
  const nowIso = new Date().toISOString()

  for (const firm of parsed.data.firms) {
    try {
      // Find or create Company
      const { company, wasNew } = await findOrCreateCompanyByName(firm.name, {
        website: firm.website ?? undefined,
        location: firm.country,
        project_type: firm.project_type,
        known_projects: firm.reference_project,
        ideal_client_fit: firm.score >= 65,
        notes: [
          `Surfaced via Prospecting (${nowIso.slice(0, 10)}). Prospect score: ${firm.score}/100.`,
          `From Discovery: ${discovery.title}`,
          `Article: ${discovery.source_url}`,
        ].join('\n'),
      })

      // Create the Opportunity (Company-level — no lead_id)
      const opportunityId = `opp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
      const opportunity: Opportunity = {
        opportunity_id: opportunityId,
        company_id: company.company_id,
        // lead_id intentionally omitted — Company-level until Apollo brings
        // contacts or the user manually attaches one
        opportunity_type: pickOpportunityType(discovery.opportunity_type),
        source: discovery.source ?? 'Discovery',
        summary: discovery.brief_summary ?? discovery.title ?? '',
        why_now: discovery.why_it_matters ?? '',
        recommended_action: discovery.suggested_action ?? '',
        urgency: urgencyFromScore(discovery.urgency_score),
        confidence: Number(discovery.confidence_score ?? 0),
        discovered_from_id: discovery.id,
        discovered_from_url: discovery.source_url,
        status: 'Open',
        created_at: nowIso,
        updated_at: nowIso,
      }
      await createOpportunity(opportunity)

      results.push({
        firm_name: firm.name,
        company_id: company.company_id,
        company_was_new: wasNew,
        opportunity_id: opportunityId,
      })
    } catch (err) {
      errors.push(`${firm.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Mark the Discovery as promoted (point at the first created opp; full
  // mapping is via opportunities.discovered_from_id).
  if (results.length > 0) {
    await supabase
      .from('discoveries')
      .update({
        promoted_to_opportunity_id: results[0].opportunity_id,
        status: 'saved',
      })
      .eq('id', id)
  }

  return Response.json({
    promoted: results.length,
    new_companies: results.filter((r) => r.company_was_new).length,
    reused_companies: results.filter((r) => !r.company_was_new).length,
    results,
    errors,
  }, { status: results.length > 0 ? 200 : 500 })
}
