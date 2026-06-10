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

  return Response.json({ opportunity })
}
