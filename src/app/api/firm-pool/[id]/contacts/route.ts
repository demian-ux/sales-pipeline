// POST /api/firm-pool/{id}/contacts — add a contact to a pool firm. One primary
// contact per firm is enough for now; emails are typically Apollo-derived in an
// interactive session and posted here.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const EMAIL_STATUSES = ['verified', 'guessed', 'bounced', 'unknown'] as const

const CreateBody = z.object({
  name:         z.string().optional(),
  title:        z.string().optional(),
  email:        z.string().optional(),
  email_status: z.enum(EMAIL_STATUSES).optional(),
  linkedin_url: z.string().optional(),
  is_primary:   z.boolean().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
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
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ contact: data }, { status: 201 })
}
