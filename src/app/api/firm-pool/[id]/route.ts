// GET   /api/firm-pool/{id} — one pool firm.
// PATCH /api/firm-pool/{id} — edit a pool firm.
//
// This route did not exist before 2026-07-14. A PATCH to it therefore never
// persisted anything, which is how five Milan/Lisbon hotel specialists went a
// day without the `hospitality_design` category they'd been reviewed into.
//
// `categories` is the join key against a signal's `work_categories` — a firm
// whose categories are wrong is silently invisible to every matching signal, so
// it's validated against the canonical enum rather than accepted as free text.
//
// The body is `.strict()`: an unknown key is a 400, never a 200 that quietly
// drops it. The response echoes the persisted row so a caller can always see
// exactly what landed.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { WORK_CATEGORIES, GEOS, POOL_STATUSES } from '@/lib/vocab'

const PatchBody = z
  .object({
    name:              z.string().min(1).optional(),
    categories:        z.array(z.enum(WORK_CATEGORIES)).optional(),
    geo:               z.enum(GEOS).optional(),
    domain:            z.string().nullable().optional(),
    website:           z.string().nullable().optional(),
    apollo_org_id:     z.string().nullable().optional(),
    icp_notes:         z.string().nullable().optional(),
    pool_status:       z.enum(POOL_STATUSES).optional(),
    exclusion_reason:  z.string().nullable().optional(),
    linked_company_id: z.string().nullable().optional(),
    signal_ref:        z.string().nullable().optional(),
  })
  .strict()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('firm_pool')
    .select('*')
    .eq('firm_id', id)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!data) return Response.json({ error: 'Firm not found' }, { status: 404 })
  return Response.json({ firm: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : ''
    return Response.json({ error: `${issue?.message ?? 'Invalid body'}${where}` }, { status: 400 })
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return Response.json(
      { error: `Nothing to update — provide at least one of: ${Object.keys(PatchBody.shape).join(', ')}` },
      { status: 400 },
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('firm_pool')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('firm_id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return Response.json({ error: 'Firm not found' }, { status: 404 })
    if (error.code === '23505') return Response.json({ error: `A firm named "${updates.name}" is already in the pool`, code: 'duplicate' }, { status: 409 })
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ firm: data })
}
