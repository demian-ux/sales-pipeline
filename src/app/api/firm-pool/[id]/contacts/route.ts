// POST /api/firm-pool/{id}/contacts — add a contact to a pool firm. One primary
// contact per firm is enough for now; emails are typically Apollo-derived in an
// interactive session and posted here.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const EMAIL_STATUSES = ['verified', 'guessed', 'bounced', 'unknown'] as const

// `.strict()`: an unknown key is a 400. This schema previously accepted (and
// silently discarded) lead_id / enriched_at / source while answering 201 — the
// caller had no way to know the link it thought it stored was never stored.
const CreateBody = z
  .object({
    name:         z.string().optional(),
    title:        z.string().optional(),
    email:        z.string().optional(),
    email_status: z.enum(EMAIL_STATUSES).optional(),
    linkedin_url: z.string().optional(),
    is_primary:   z.boolean().optional(),
    // Provenance (2026-07-14). enriched_at is the Apollo-credit receipt: a
    // non-null value means this head is already paid for, don't buy it twice.
    lead_id:      z.string().optional(),
    enriched_at:  z.string().optional(),
    source:       z.string().optional(),
  })
  .strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : ''
    return Response.json({ error: `${issue?.message ?? 'Invalid body'}${where}` }, { status: 400 })
  }
  const b = parsed.data

  const supabase = getSupabaseAdmin()

  // The firm must exist (FK would reject anyway, but a clear 404 is friendlier).
  const { data: firm } = await supabase.from('firm_pool').select('firm_id').eq('firm_id', id).maybeSingle()
  if (!firm) return Response.json({ error: 'Firm not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('firm_pool_contacts')
    .insert({
      firm_id: id,
      name: b.name ?? null,
      title: b.title ?? null,
      email: b.email ?? null,
      email_status: b.email_status ?? null,
      linkedin_url: b.linkedin_url ?? null,
      seat_checked_at: b.email_status === 'verified' ? new Date().toISOString() : null,
      is_primary: b.is_primary ?? true,
      lead_id: b.lead_id ?? null,
      enriched_at: b.enriched_at ?? null,
      source: b.source ?? null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contact: data }, { status: 201 })
}
