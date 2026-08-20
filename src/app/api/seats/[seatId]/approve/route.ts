// POST /api/seats/{seatId}/approve — Gate 1 approve: creates the lead in
// Sheets (source 'seats-worker', stage 'New Lead') and marks the seat
// lead_created. Uses the same duplicate guard as POST /api/leads: an existing
// lead with this email or name+company is a 409, never a second row.

import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeads, createLead, findOrCreateCompanyByName } from '@/lib/sheets'
import { cleanName } from '@/lib/vocab'
import type { Lead } from '@/lib/types'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ seatId: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { seatId } = await params
  const supabase = getSupabaseAdmin()

  const { data: seat, error } = await supabase
    .from('firm_seats')
    .select('*, firm_pool(firm_id, name, domain, website, geo, linked_company_id)')
    .eq('seat_id', seatId)
    .single()
  if (error || !seat) return Response.json({ error: 'Seat not found' }, { status: 404 })
  if (seat.seat_status !== 'seat_pending') {
    return Response.json({ error: `Seat is ${seat.seat_status}, expected seat_pending` }, { status: 409 })
  }
  if (!seat.email || !['verified', 'waterfall_verified'].includes(seat.email_status)) {
    return Response.json({ error: 'Seat has no verified email — cannot create a lead' }, { status: 409 })
  }

  const firm = seat.firm_pool as unknown as { firm_id: string; name: string; website: string | null; domain: string | null; geo: string | null }
  const full_name = cleanName(seat.candidate_name ?? '')
  const company_name = cleanName(firm.name)
  if (!full_name) return Response.json({ error: 'Seat has no candidate name' }, { status: 409 })

  // Duplicate guard (same rules as POST /api/leads).
  const existing = await getLeads()
  const emailNorm = seat.email.toLowerCase().trim()
  const dup = existing.find((l) =>
    (l.email ?? '').toLowerCase().trim() === emailNorm ||
    (cleanName(l.full_name).toLowerCase() === full_name.toLowerCase() &&
      cleanName(l.company_name).toLowerCase() === company_name.toLowerCase()),
  )
  if (dup) {
    return Response.json(
      { error: `Duplicate of existing lead ${dup.lead_id} (${dup.full_name} at ${dup.company_name})`, duplicate_of: dup.lead_id },
      { status: 409 },
    )
  }

  const { company } = await findOrCreateCompanyByName(company_name, {
    website: firm.website ?? (firm.domain ? `https://${firm.domain}` : undefined) ?? undefined,
  })

  const now = new Date().toISOString()
  const nameParts = full_name.split(/\s+/)
  const lead: Lead = {
    lead_id: `lead_${randomUUID()}`,
    company_id: company.company_id,
    first_name: nameParts[0] ?? '',
    last_name: nameParts.slice(1).join(' '),
    full_name,
    email: seat.email,
    linkedin_url: seat.linkedin_url ?? undefined,
    title: seat.title ?? undefined,
    company_name,
    website: firm.website ?? undefined,
    source: 'seats-worker',
    pipeline_stage: 'New Lead',
    lead_status: 'Active',
    created_at: now,
    updated_at: now,
  }
  await createLead(lead)

  const { error: upErr } = await supabase
    .from('firm_seats')
    .update({ seat_status: 'lead_created', lead_id: lead.lead_id, updated_at: now })
    .eq('seat_id', seatId)
  if (upErr) {
    // Lead exists in Sheets but the seat didn't flip — surface loudly rather
    // than silently double-creating on retry.
    return Response.json(
      { error: `Lead ${lead.lead_id} created but seat update failed: ${upErr.message}`, lead },
      { status: 500 },
    )
  }
  return Response.json({ lead, seat_status: 'lead_created' }, { status: 201 })
}
