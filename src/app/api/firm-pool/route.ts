// GET  /api/firm-pool — list the pool (filters: category, geo, pool_status,
//                        untouched_since=YYYY-MM-DD → firms with no touch sent on
//                        or after that date).
// POST /api/firm-pool — add a firm. Exclusion sync runs at insert (rule 3): a
//                        name matching an engaged/warm CRM account is stored
//                        pool_status='excluded' regardless of the requested one.
//
// The pool is small (dozens–low hundreds), so untouched_since is computed in
// code from value_touches rather than a SQL join.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { WORK_CATEGORIES, GEOS, POOL_STATUSES } from '@/lib/vocab'
import { computeExclusion } from '@/lib/firm-pool/exclusion'

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const sp = request.nextUrl.searchParams
  const category       = sp.get('category')        ?? ''
  const geo            = sp.get('geo')             ?? ''
  const poolStatus     = sp.get('pool_status')     ?? ''
  const untouchedSince = sp.get('untouched_since') ?? ''
  const limit          = Math.min(parseInt(sp.get('limit') ?? '200', 10), 500)

  const supabase = getSupabaseAdmin()
  let query = supabase.from('firm_pool').select('*').order('name', { ascending: true }).limit(limit)
  if (category)   query = query.contains('categories', [category])
  if (geo)        query = query.eq('geo', geo)
  if (poolStatus) query = query.eq('pool_status', poolStatus)

  const { data, error } = await query
  if (error) {
    if (error.code === '42P01') {
      return Response.json(
        { error: 'firm_pool table missing — apply supabase/migrations/2026-07-10_firm_pool.sql', code: '42P01' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  let firms = data ?? []
  if (untouchedSince) {
    // Exclude firms touched (sent) on/after the cutoff; keep never-touched ones.
    const { data: touched } = await supabase
      .from('value_touches')
      .select('firm_id')
      .gte('sent_at', untouchedSince)
    const touchedIds = new Set((touched ?? []).map((t) => t.firm_id))
    firms = firms.filter((f) => !touchedIds.has(f.firm_id))
  }

  return Response.json({ firms, total: firms.length })
}

const CreateBody = z.object({
  name:              z.string().min(1, 'name is required'),
  categories:        z.array(z.enum(WORK_CATEGORIES)).default([]),
  geo:               z.enum(GEOS).optional(),
  domain:            z.string().optional(),
  website:           z.string().optional(),
  apollo_org_id:     z.string().optional(),
  icp_notes:         z.string().optional(),
  pool_status:       z.enum(POOL_STATUSES).optional(),
  linked_company_id: z.string().optional(),
  signal_ref:        z.string().optional(),
})

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const b = parsed.data

  // Exclusion sync (rule 3): an engaged/warm CRM match forces 'excluded' — a
  // caller can't opt a live account into cold outreach. Otherwise honor the
  // requested status (default 'active') and still record any linked company.
  const verdict = await computeExclusion(b.name)
  const pool_status = verdict.excluded ? 'excluded' : (b.pool_status ?? 'active')
  const exclusion_reason = verdict.excluded ? verdict.reason ?? 'engaged CRM account' : null
  const linked_company_id = b.linked_company_id ?? verdict.linked_company_id ?? null

  const { data, error } = await getSupabaseAdmin()
    .from('firm_pool')
    .insert({
      name: b.name,
      categories: b.categories,
      geo: b.geo ?? null,
      domain: b.domain ?? null,
      website: b.website ?? null,
      apollo_org_id: b.apollo_org_id ?? null,
      icp_notes: b.icp_notes ?? null,
      pool_status,
      exclusion_reason,
      linked_company_id,
      signal_ref: b.signal_ref ?? null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: `Firm "${b.name}" is already in the pool`, code: 'duplicate' }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ firm: data, excluded: verdict.excluded }, { status: 201 })
}
