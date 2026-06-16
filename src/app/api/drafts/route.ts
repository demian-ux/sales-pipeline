// GET /api/drafts — cross-lead drafts listing (the per-lead version lives at
// /api/leads/[id]/drafts). Drafts live in Supabase; the lead display fields
// live in Google Sheets — so this is a cross-store merge, not a SQL join: we
// page the drafts in Supabase, then attach each lead's display fields from a
// single getLeads() Sheets read (cheaper than N getLeadById scans).
//
// Powers the dashboard "LinkedIn DM queue" card, which calls
//   /api/drafts?channel=linkedin_dm&status=draft,approved

import { NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeads } from '@/lib/sheets'
import { DRAFT_CHANNELS, DRAFT_STATUSES } from '@/lib/vocab'

export async function GET(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const sp = new URL(request.url).searchParams
  const channel = sp.get('channel') ?? ''
  // status accepts a comma list, e.g. status=draft,approved
  const statuses = (sp.get('status') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => (DRAFT_STATUSES as readonly string[]).includes(s))
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10) || 50, 100)
  const offset = parseInt(sp.get('offset') ?? '0', 10) || 0

  try {
    let query = getSupabaseAdmin()
      .from('lead_drafts')
      .select('id, lead_id, channel, subject, body, status, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (channel && (DRAFT_CHANNELS as readonly string[]).includes(channel)) {
      query = query.eq('channel', channel)
    }
    if (statuses.length > 0) {
      query = query.in('status', statuses)
    }
    query = query.range(offset, offset + limit - 1)

    const { data: drafts, error, count } = await query
    if (error) throw new Error(error.message)

    // Merge in lead display fields from Sheets. One read, indexed by lead_id.
    const leads = await getLeads()
    const leadById = new Map(leads.map((l) => [l.lead_id, l]))

    const rows = (drafts ?? []).map((d) => {
      const lead = leadById.get(d.lead_id)
      return {
        ...d,
        lead: lead
          ? {
              full_name: lead.full_name,
              company_name: lead.company_name,
              linkedin_url: lead.linkedin_url,
              linkedin_connection_status: lead.linkedin_connection_status,
              linkedin_dm_status: lead.linkedin_dm_status,
              pipeline_stage: lead.pipeline_stage,
            }
          : null,
      }
    })

    return NextResponse.json({ drafts: rows, total: count ?? rows.length })
  } catch (err) {
    console.error('GET /api/drafts error:', err)
    return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })
  }
}
