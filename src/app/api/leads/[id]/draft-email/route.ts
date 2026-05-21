// POST /api/leads/[id]/draft-email
// Runs the generate-email prompt for a Lead and upserts the result to the
// Supabase email_drafts table (one row per lead, latest wins).
//
// The route does NOT require a prior AIInsight — the prompt falls back to
// raw context when none exists. When an insight is present, it is passed
// in as additional context to steer the email.

import { NextResponse } from 'next/server'
import {
  getLeadById,
  getCompanyById,
  getResearchForLead,
  getInteractionsForLead,
  getOpportunitiesForLead,
  getInsightsForLead,
  getCampaigns,
} from '@/lib/sheets'
import { generateEmailDraft } from '@/lib/claude'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: leadId } = await params
  if (!leadId) {
    return NextResponse.json({ error: 'lead_id required' }, { status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const lead = await getLeadById(leadId)
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  const [company, findings, interactions, opportunities, insights, campaigns] = await Promise.all([
    getCompanyById(lead.company_id),
    getResearchForLead(leadId),
    getInteractionsForLead(leadId),
    getOpportunitiesForLead(leadId, lead.company_id),
    getInsightsForLead(leadId),
    getCampaigns(),
  ])

  const latestInsight = [...insights].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] ?? null
  const campaign = lead.campaign_id ? campaigns.find((c) => c.campaign_id === lead.campaign_id) ?? null : null

  let draft: { email: string }
  try {
    draft = await generateEmailDraft(lead, company, findings, interactions, opportunities, latestInsight, campaign)
  } catch (err) {
    console.error('generateEmailDraft error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Email generation failed' },
      { status: 500 },
    )
  }

  const nowIso = new Date().toISOString()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('email_drafts')
    .upsert(
      {
        lead_id: leadId,
        company_id: lead.company_id,
        content: draft.email,
        updated_at: nowIso,
      },
      { onConflict: 'lead_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[draft-email] upsert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ draft: data })
}
