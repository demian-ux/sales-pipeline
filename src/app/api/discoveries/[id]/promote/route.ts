// Promote a Discovery → Opportunity by attaching a Lead.
// Creates a row in the Sheets `Opportunities` tab with provenance fields
// (`discovered_from_id`, `discovered_from_url`) pointing back to the Discovery,
// and updates the Discovery's `promoted_to_opportunity_id` for the reverse link.

import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeadById, createOpportunity } from '@/lib/sheets'
import type { Opportunity, UrgencyLevel } from '@/lib/types'

function urgencyFromScore(score: number | null | undefined): UrgencyLevel {
  if ((score ?? 0) >= 70) return 'High'
  if ((score ?? 0) >= 40) return 'Medium'
  return 'Low'
}

function pickOpportunityType(types: string[] | null | undefined): string {
  if (!types || types.length === 0) return 'Discovery signal'
  // First type, prettified
  const first = types[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const leadId: string | undefined = body.lead_id
  // Who is actually buying/building/commissioning — verified against a source
  // before attaching, so a discovery doesn't get pinned to the wrong firm.
  const verifiedEntity: string | undefined = body.verified_entity?.trim() || undefined
  const verifiedSourceUrl: string | undefined = body.verified_source_url?.trim() || undefined
  const force: boolean = body.force === true

  if (!leadId) {
    return Response.json({ error: 'lead_id required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // 1. Load Discovery
  const { data: discovery, error: dErr } = await supabase
    .from('discoveries')
    .select('*')
    .eq('id', id)
    .single()

  if (dErr || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  // Idempotency: a Discovery promotes at most once. Without this check, a
  // failed reverse-link on a previous attempt allowed duplicate Sheets rows.
  if (discovery.promoted_to_opportunity_id) {
    return Response.json({
      already_promoted: true,
      opportunity_id: discovery.promoted_to_opportunity_id,
    })
  }

  // 2. Load Lead (from Sheets)
  const lead = await getLeadById(leadId)
  if (!lead) {
    return Response.json({ error: 'Lead not found' }, { status: 404 })
  }

  // 2b. Verification guard: if a verified entity is supplied and clearly
  // doesn't match the lead's company, refuse unless forced — this is exactly
  // the wrong-attachment failure mode (e.g. a Fort Partners lead attached to
  // an Oak Row Equities deal).
  if (verifiedEntity && !force) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    const entity = norm(verifiedEntity)
    const company = norm(lead.company_name ?? '')
    const related = company && (entity.includes(company) || company.includes(entity))
    if (!related) {
      return Response.json({
        error: `verified_entity "${verifiedEntity}" does not match the lead's company "${lead.company_name}". Check GET /api/discoveries/${id}/matches for better-placed contacts, or pass force: true to attach anyway.`,
        verified_entity: verifiedEntity,
        lead_company: lead.company_name,
      }, { status: 409 })
    }
  }

  // 3. Build the Opportunity row
  const nowIso = new Date().toISOString()
  const opportunityId = `opp_${randomUUID()}`
  const opportunity: Opportunity = {
    opportunity_id: opportunityId,
    company_id: lead.company_id,
    lead_id: leadId,
    campaign_id: lead.campaign_id,
    opportunity_type: pickOpportunityType(discovery.opportunity_type),
    source: discovery.source,
    summary: discovery.brief_summary ?? discovery.title,
    why_now: [
      discovery.why_it_matters ?? '',
      verifiedEntity ? `Entity of record: ${verifiedEntity}${verifiedSourceUrl ? ` (${verifiedSourceUrl})` : ''}` : '',
    ].filter(Boolean).join(' — '),
    recommended_action: discovery.suggested_action ?? '',
    urgency: urgencyFromScore(discovery.urgency_score),
    confidence: Number(discovery.confidence_score ?? 0),
    discovered_from_id: discovery.id,
    discovered_from_url: discovery.source_url,
    status: 'Open',
    created_at: nowIso,
    updated_at: nowIso,
  }

  // 4. Write to Sheets
  await createOpportunity(opportunity)

  // 5. Reverse-link on the Discovery. If this fails the Sheets row exists but
  // the Discovery stays promotable — retry once, then surface loudly so the
  // duplicate-promotion window is visible instead of silent.
  const { error: linkErr } = await supabase
    .from('discoveries')
    .update({ promoted_to_opportunity_id: opportunityId, status: 'saved' })
    .eq('id', id)
  if (linkErr) {
    const { error: retryErr } = await supabase
      .from('discoveries')
      .update({ promoted_to_opportunity_id: opportunityId, status: 'saved' })
      .eq('id', id)
    if (retryErr) {
      console.error('[promote] reverse-link failed twice:', retryErr.message)
      return Response.json({
        opportunity,
        warning: 'Opportunity created, but the Discovery could not be marked as promoted — do not promote it again.',
      })
    }
  }

  return Response.json({
    opportunity,
    ...(verifiedEntity ? {} : {
      verification_hint: 'No verified_entity supplied. Identify the entity of record (who is actually buying/building/commissioning) with a source URL before relying on this attachment — see GET /api/discoveries/{id}/matches.',
    }),
  })
}
