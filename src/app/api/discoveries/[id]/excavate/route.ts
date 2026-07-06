// POST /api/discoveries/[id]/excavate — on-demand principal excavation
// (2026-07-06, Workstream B). Resolves the signal's developer/designer-of-record
// and writes verified_principal + excavation_status. If the resolved principal
// is already a CRM Company, cross-refs it so the row drops into the
// existing-account view (work_status = already_engaged) instead of being
// re-verified next time.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { excavateDiscoveryPrincipal } from '@/lib/discoveries/excavate'
import { matchEntitiesToCompanies } from '@/lib/discoveries/roster-match'
import { getCompanies } from '@/lib/sheets'
import type { Company } from '@/lib/types'

export const maxDuration = 60

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: d, error } = await supabase
    .from('discoveries')
    .select('id, title, project_name, city, country, brief_summary, developer, architect, main_actors, source_url, suggested_target_firms')
    .eq('id', id)
    .single()

  if (error || !d) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  let outcome
  try {
    outcome = await excavateDiscoveryPrincipal(d)
  } catch (err) {
    console.error('[excavate] error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Excavation failed' }, { status: 500 })
  }

  const update: Record<string, unknown> = {
    excavation_status: outcome.excavation_status,
    verified_principal: outcome.verified_principal,
  }

  // A resolved principal that's already a CRM Company is a GOOD outcome — it
  // becomes a zero-effort existing-account touch, not a re-verified cold lead.
  // Cross-ref best-effort; a roster read failure must not fail the excavation.
  if (outcome.verified_principal) {
    try {
      const companies = await getCompanies()
      const roster = companies.map((c: Company) => ({ company_id: c.company_id, company_name: c.company_name }))
      const engaged = matchEntitiesToCompanies([outcome.verified_principal.firm], roster)
      if (engaged) {
        update.already_engaged = true
        update.engaged_company_id = engaged.company_id
        update.engaged_company_name = engaged.company_name
        update.work_status = 'already_engaged'
        update.worked_at = new Date().toISOString()
      }
    } catch (err) {
      console.warn('[excavate] roster cross-ref skipped:', err instanceof Error ? err.message : err)
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('discoveries')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 })
  }

  return Response.json({
    discovery: updated,
    excavation_status: outcome.excavation_status,
    verified_principal: outcome.verified_principal,
    reasoning: outcome.reasoning,
  })
}
