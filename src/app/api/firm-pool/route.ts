// GET  /api/firm-pool — list the pool (filters: category, geo, pool_status,
//                        fit_level, verification_status, crm_relationship,
//                        hq_city, untouched_since=YYYY-MM-DD → firms with no
//                        touch sent on or after that date). Each row carries
//                        its research details (hq_city, fit_level, work_types…).
// POST /api/firm-pool — add a firm. Exclusion sync runs at insert (rule 3): a
//                        name matching an engaged/warm CRM account is stored
//                        pool_status='excluded' regardless of the requested one.
//
// The pool holds every researched firm (~2,700 rows, most of them excluded as
// not fitting), so always filter: pool_status, fit_level and geo narrow it to
// the few hundred that matter. untouched_since is computed in code from
// value_touches rather than a SQL join, after the DB page.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { WORK_CATEGORIES, GEOS, POOL_STATUSES, FIT_LEVELS, VERIFICATION_STATUSES, CRM_RELATIONSHIPS } from '@/lib/vocab'
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
  const signalRef      = sp.get('signal_ref')      ?? ''
  const fitLevel       = sp.get('fit_level')       ?? ''
  const verification   = sp.get('verification_status') ?? ''
  const relationship   = sp.get('crm_relationship') ?? ''
  const hqCity         = sp.get('hq_city')         ?? ''
  const limit          = Math.min(parseInt(sp.get('limit') ?? '200', 10), 500)
  const offset         = Math.max(0, parseInt(sp.get('offset') ?? '0', 10))

  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('firm_pool')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)
  if (category)   query = query.contains('categories', [category])
  if (geo)        query = query.eq('geo', geo)
  if (poolStatus) query = query.eq('pool_status', poolStatus)
  if (signalRef)  query = query.eq('signal_ref', signalRef)
  // fit_level accepts a comma list: ?fit_level=A,B
  if (fitLevel)     query = query.in('fit_level', fitLevel.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))
  if (verification) query = query.eq('verification_status', verification)
  if (relationship) query = query.eq('crm_relationship', relationship)
  if (hqCity)       query = query.ilike('hq_city', `%${hqCity}%`)

  const { data, error, count } = await query
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
    // Note this filters AFTER the DB page, so `total` reflects the pre-filter
    // count — the pool is small enough that callers pass a large limit here.
    const { data: touched } = await supabase
      .from('value_touches')
      .select('firm_id')
      .gte('sent_at', untouchedSince)
    const touchedIds = new Set((touched ?? []).map((t) => t.firm_id))
    firms = firms.filter((f) => !touchedIds.has(f.firm_id))
  }

  return Response.json({ firms, total: count ?? firms.length, offset, limit })
}

// Research details — optional on create and patch. See FirmPool in lib/types.
const RESEARCH_FIELDS = {
  hq_city:             z.string().nullable().optional(),
  hq_state:            z.string().nullable().optional(),
  hq_evidence:         z.string().nullable().optional(),
  other_offices:       z.string().nullable().optional(),
  fit_level:           z.enum(FIT_LEVELS).nullable().optional(),
  fit_reason:          z.string().nullable().optional(),
  work_types:          z.string().nullable().optional(),
  recent_project:      z.string().nullable().optional(),
  works_outside_city:  z.string().nullable().optional(),
  visualization:       z.string().nullable().optional(),
  size_note:           z.string().nullable().optional(),
  employees:           z.number().int().nullable().optional(),
  verification_status: z.enum(VERIFICATION_STATUSES).nullable().optional(),
  verified_at:         z.string().nullable().optional(),
  source_url:          z.string().nullable().optional(),
  research_source:     z.string().nullable().optional(),
  crm_relationship:    z.enum(CRM_RELATIONSHIPS).nullable().optional(),
  crm_leads:           z.number().int().nullable().optional(),
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
  ...RESEARCH_FIELDS,
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
  // Only the research fields the caller actually sent.
  const research = Object.fromEntries(
    Object.keys(RESEARCH_FIELDS).filter((k) => (b as Record<string, unknown>)[k] !== undefined).map((k) => [k, (b as Record<string, unknown>)[k]]),
  )

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
      ...research,
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
