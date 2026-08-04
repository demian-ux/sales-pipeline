// GET /api/discoveries — list with filters (ported from Terminal's
// /api/opportunities). Returns the Discovery rows the feed page renders.
// POST /api/discoveries — manual creation (2026-07-28). Out-of-feed signals
// (agent research runs, manual sweeps, the migrated bench ledger) enter the
// same machinery as ingested rows: work_status/re_arm_at and the board's
// auto-re-arm apply to them identically.

import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { normalizeDiscoveryKind } from '@/lib/discoveries/kind'
import { DISCOVERY_BOARD_STATUSES, WORK_STATUSES, GEOS, WORK_CATEGORIES } from '@/lib/vocab'
import { makeProjectKey } from '@/lib/discoveries/project-key'
import { CONSUMING_STATUSES, type WorkStatus } from '@/lib/types'

// Every query param this route understands. An unknown param is a 400, not a
// silent no-op: `?kind=upstream_signal` used to be ignored, so a run that asked
// for signals got launches back and never knew (2026-07-14).
const KNOWN_PARAMS = new Set([
  'region', 'country', 'city', 'sector', 'opportunity_type', 'client_type',
  'score_min', 'source', 'date_from', 'date_to', 'status', 'search',
  'discovery_kind', 'kind', 'sort_by', 'tenure', 'sector_fit', 'fit_tier',
  'signal_type', 'geo', 'work_category', 'briefs_status', 'future_work_test',
  'engagement', 'work_status', 'show_worked', 'hide_disqualified',
  'limit', 'offset',
])

// UI filter values (snake_case) → stored region values (display strings from
// the analysis prompt). Previously this worked only because ILIKE treats `_`
// as a single-char wildcard ("new_york" happened to match "New York").
const REGION_VALUES: Record<string, string> = {
  new_york: 'New York',
  miami:    'Miami',
  france:   'France',
  europe:   'Europe',
  other:    'Other',
}

// The list view renders ~10 fields — exclude the heavy text columns
// (raw_content ~5KB + deep_analysis ~4KB per row) from the payload.
const LIST_COLUMNS =
  'id, created_at, title, date_published, source, source_url, source_type, ' +
  'region, city, country, sector, project_type, opportunity_type, target_client_types, ' +
  'investment_size, timeline, main_actors, developer, architect, government_body, ' +
  'brief_summary, why_it_matters, suggested_action, tags, ' +
  'signal_tier, discovery_score, urgency_score, confidence_score, ' +
  'signal_type, project_name, project_key, already_engaged, engaged_company_name, ' +
  'tenure, has_for_sale_residential, project_stage, sector_fit, ' +
  'viz_buyer_role, viz_buyer_entity, incumbent_viz, est_scale_vs_floor, ' +
  'icp_fit_score, fit_tier, fit_reason, partner_radar, combined_score, ' +
  'discovery_kind, source_org, signal_event, beneficiary_segment, outreach_angle, ' +
  'opportunity_score, suggested_target_firms, ' +
  'program_scope, briefs_status, work_categories, geo, future_work_test, future_work_reason, ' +
  'buyer_committed, programmatic_scope, ' +
  'verified_principal, excavation_status, deployment_horizon, intent_evidence, entitlement_evidence, ' +
  'work_status, work_reason, worked_at, reviewed_at, re_arm_at, ' +
  'status, promoted_to_opportunity_id'

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const sp = request.nextUrl.searchParams

  const unknown = [...sp.keys()].filter((k) => !KNOWN_PARAMS.has(k))
  if (unknown.length) {
    return Response.json(
      { error: `Unknown query param(s): ${unknown.join(', ')}. An ignored filter reads like a working one — rejecting instead.` },
      { status: 400 },
    )
  }
  const region     = sp.get('region')           ?? ''
  const country    = sp.get('country')          ?? ''
  const city       = sp.get('city')             ?? ''
  const sector     = sp.get('sector')           ?? ''
  const oppType    = sp.get('opportunity_type') ?? ''
  const clientType = sp.get('client_type')      ?? ''
  const scoreMin   = parseInt(sp.get('score_min') ?? '0', 10)
  const source     = sp.get('source')           ?? ''
  const dateFrom   = sp.get('date_from')        ?? ''
  const dateTo     = sp.get('date_to')          ?? ''
  // 'all' means "every board bucket" — it used to fall through as an invalid
  // enum value and silently return []. Anything else must be a real bucket.
  const status     = sp.get('status')           ?? 'active'
  if (status !== 'all' && !DISCOVERY_BOARD_STATUSES.includes(status as never)) {
    return Response.json(
      { error: `Invalid status: ${status} — expected ${DISCOVERY_BOARD_STATUSES.join(' | ')} | all` },
      { status: 400 },
    )
  }
  const search     = sp.get('search')           ?? ''
  // Which discovery mode's board to show. Defaults to the original launch
  // pipeline so the existing board (and legacy rows, which default to
  // 'project_launch') is unchanged; the board toggle sends the other value.
  // Accepts 'upstream_signal' as an alias for the stored 'opportunity_signal'
  // (the value-lane consumer uses that name); '' means all kinds. `kind` is
  // accepted as a spelling of `discovery_kind` — it used to be ignored, which
  // handed launches to a caller that asked for signals.
  // A comma-separated list is accepted (e.g. 'offering_plan,permit_filing' —
  // the board's NY-filings view); each token is normalized and validated.
  const VALID_KINDS = ['project_launch', 'opportunity_signal', 'offering_plan', 'permit_filing']
  const rawKind = sp.get('discovery_kind') ?? sp.get('kind')
  const discoveryKinds = rawKind?.includes(',')
    ? rawKind.split(',').map((k) => normalizeDiscoveryKind(k.trim()))
    : [normalizeDiscoveryKind(rawKind)]
  for (const k of discoveryKinds) {
    if (k && !VALID_KINDS.includes(k)) {
      return Response.json(
        { error: `Invalid discovery_kind: ${rawKind} — expected project_launch | opportunity_signal | upstream_signal | offering_plan | permit_filing (comma-separated ok)` },
        { status: 400 },
      )
    }
  }
  const discoveryKind = discoveryKinds.filter(Boolean)
  // Sort: 'combined' (blended fit×deal, default) | 'score' (raw discovery_score)
  // | 'date' | 're_arm' (soonest re-arm first, undated holds last — bench view).
  const sortParam  = sp.get('sort_by')
  const sortBy     = sortParam === 'date' ? 'date' : sortParam === 'score' ? 'score' : sortParam === 're_arm' ? 're_arm' : 'combined'
  const tenure     = sp.get('tenure')            ?? ''
  const sectorFit  = sp.get('sector_fit')        ?? ''
  const fitTier    = sp.get('fit_tier')          ?? ''
  const signalType = sp.get('signal_type')       ?? ''
  // Upstream-signal filters (2026-07-10). geo + work_category are the firm-pool
  // join keys; future_work_test isolates the pre-award keepers; briefs_status
  // buckets by award state. Used by the weekly value-lane run.
  const geo          = sp.get('geo')             ?? ''
  const workCategory = sp.get('work_category')   ?? ''
  const briefsStatus = sp.get('briefs_status')   ?? ''
  const futureWork   = sp.get('future_work_test') ?? ''   // 'true' | 'false' | ''
  // 'engaged' = only worked firms | 'new' = only firms not yet in the CRM | '' = all
  const engagement = sp.get('engagement')        ?? ''
  // Work-tracking filter (2026-07-06). Default board hides worked material
  // (held/rejected/already_engaged) so runs judge only what's new. Pass an
  // explicit work_status to isolate one bucket (e.g. 'already_engaged' for the
  // existing-account view), or show_worked=true to reveal everything.
  const workStatus = sp.get('work_status')       ?? ''
  if (workStatus && workStatus !== 'all' && !WORK_STATUSES.includes(workStatus as never)) {
    return Response.json(
      { error: `Invalid work_status: ${workStatus} — expected ${WORK_STATUSES.join(' | ')} | all` },
      { status: 400 },
    )
  }
  const showWorked = sp.get('show_worked') === 'true'
  // Hide disqualified is ON unless explicitly disabled, but never overrides an
  // explicit fit_tier filter (so you can still inspect disqualified rows).
  const hideDisq   = sp.get('hide_disqualified') !== 'false'
  const limit      = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100)
  const offset     = parseInt(sp.get('offset') ?? '0', 10)

  // Exact count, not estimated: `total` is how a paging consumer knows whether
  // it has seen everything, so an estimate is worse than useless there.
  let query = getSupabaseAdmin()
    .from('discoveries')
    .select(LIST_COLUMNS, { count: 'exact' })

  if (sortBy === 're_arm') {
    // Ascending with nulls LAST: overdue re-arms first, undated holds at the end.
    query = query
      .order('re_arm_at', { ascending: true, nullsFirst: false })
      .order('combined_score', { ascending: false, nullsFirst: false })
  } else if (sortBy === 'date') {
    query = query
      .order('date_published', { ascending: false, nullsFirst: false })
      .order('combined_score', { ascending: false, nullsFirst: false })
  } else if (sortBy === 'score') {
    query = query
      .order('discovery_score', { ascending: false, nullsFirst: false })
      .order('date_published', { ascending: false, nullsFirst: false })
  } else {
    query = query
      .order('combined_score', { ascending: false, nullsFirst: false })
      .order('date_published', { ascending: false, nullsFirst: false })
  }

  if (discoveryKind.length === 1) query = query.eq('discovery_kind', discoveryKind[0])
  else if (discoveryKind.length > 1) query = query.in('discovery_kind', discoveryKind)
  if (status !== 'all') query = query.eq('status', status)
  if (region)        query = query.ilike('region', REGION_VALUES[region] ?? region)
  if (country)       query = query.ilike('country', `%${country}%`)
  if (city)          query = query.ilike('city', `%${city}%`)
  if (sector)        query = query.eq('sector', sector)
  if (source)        query = query.ilike('source', `%${source}%`)
  if (scoreMin > 0)  query = query.gte('discovery_score', scoreMin)
  if (dateFrom)      query = query.gte('date_published', dateFrom)
  if (dateTo)        query = query.lte('date_published', dateTo + 'T23:59:59')
  if (oppType)       query = query.contains('opportunity_type', [oppType])
  if (clientType)    query = query.contains('target_client_types', [clientType])
  if (tenure)        query = query.eq('tenure', tenure)
  if (sectorFit)     query = query.eq('sector_fit', sectorFit)
  if (fitTier)       query = query.eq('fit_tier', fitTier)
  if (signalType)    query = query.eq('signal_type', signalType)
  if (geo)           query = query.eq('geo', geo)
  if (briefsStatus)  query = query.eq('briefs_status', briefsStatus)
  if (workCategory)  query = query.contains('work_categories', [workCategory])
  if (futureWork === 'true')  query = query.eq('future_work_test', true)
  if (futureWork === 'false') query = query.eq('future_work_test', false)
  if (engagement === 'engaged') query = query.eq('already_engaged', true)
  if (engagement === 'new')     query = query.eq('already_engaged', false)
  // Work-status: an explicit value isolates that bucket; otherwise hide worked
  // material unless show_worked / engagement=engaged asked to reveal it.
  // `benched` (reviewed and kept) is NOT hidden — runs still consider bench
  // items; it's `unworked` that now means never-reviewed. A held row whose
  // re_arm_at has arrived comes back to the board on its own (2026-07-14).
  if (workStatus && workStatus !== 'all') {
    query = query.eq('work_status', workStatus)
  } else if (!showWorked && workStatus !== 'all' && engagement !== 'engaged') {
    const today = new Date().toISOString().slice(0, 10)
    query = query.or(
      'work_status.is.null,' +
      'work_status.not.in.(held,rejected,already_engaged),' +
      `and(work_status.eq.held,re_arm_at.lte.${today})`,
    )
  }
  // Drop disqualified rows but KEEP legacy null-tier rows (going-forward only).
  if (hideDisq && !fitTier) query = query.or('fit_tier.is.null,fit_tier.neq.disqualified')
  if (search)        query = query.or(`title.ilike.%${search}%,brief_summary.ilike.%${search}%`)

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[discoveries] error:', error.message)
    // 42703 = undefined column. A migration hasn't been applied yet — the
    // LIST_COLUMNS / filters reference columns that don't exist (Opportunity
    // Signals 2026-06-25, or the cold-supply fixes 2026-07-06: work_status,
    // verified_principal, …). Surface an actionable message, not a generic 500.
    if (error.code === '42703') {
      return Response.json(
        { error: 'Database is missing columns from a pending migration — apply the latest file in supabase/migrations/ (2026-07-14_review_state.sql, 2026-07-06_cold_supply_fixes.sql), or re-run supabase/schema.sql.', code: '42703' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ discoveries: data, total: count, offset, limit })
}

// ---------------------------------------------------------------------------
// POST — manual discovery creation. Mirrors the PATCH clock semantics in
// [id]/route.ts: reviewed_at stamps now (a manual entry has, by definition,
// been looked at), worked_at only when the work_status is consuming.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const CreateDiscoveryBody = z
  .object({
    title: z.string({ required_error: 'title is required' }).min(1, 'title is required'),
    // Where this came from — e.g. "Manual bench 2026-07-28" or "Agent research".
    source: z.string({ required_error: 'source is required' }).min(1, 'source is required'),
    // The why-benched line. Mirrors the lead held_reason philosophy: no silent parks.
    work_reason: z.string({ required_error: 'work_reason is required' }).min(1, 'work_reason is required'),
    url: z.string().url('url must be a valid URL').optional(),
    // `category` lands in `sector` — the launch-lane classification column.
    category: z.string().optional(),
    geo: z.enum(GEOS, { errorMap: () => ({ message: `geo must be one of: ${GEOS.join(' | ')}` }) }).optional(),
    icp_fit_score: z.number().min(0, 'icp_fit_score must be 0–100').max(100, 'icp_fit_score must be 0–100').optional(),
    re_arm_at: z.string().regex(ISO_DATE, 're_arm_at must be YYYY-MM-DD').optional(),
    // NY-native manual lanes (2026-08-04). The AG offering-plan database has no
    // API, so accepted plans enter here with discovery_kind='offering_plan':
    // address+sponsor become the dedup identity, work_categories the value-lane
    // join key (offering plans match new_dev_marketing + development).
    discovery_kind: z.enum(['project_launch', 'opportunity_signal', 'upstream_signal', 'offering_plan', 'permit_filing']).optional(),
    address: z.string().optional(),
    sponsor: z.string().optional(),
    work_categories: z.array(z.enum(WORK_CATEGORIES)).optional(),
    work_status: z.enum(WORK_STATUSES, { errorMap: () => ({ message: `work_status must be one of: ${WORK_STATUSES.join(' | ')}` }) }).default('held'),
    status: z.enum(DISCOVERY_BOARD_STATUSES, { errorMap: () => ({ message: `status must be one of: ${DISCOVERY_BOARD_STATUSES.join(' | ')}` }) }).default('active'),
  })
  .strict()

// Escape ilike wildcards so a title containing % or _ dedups literally.
function escapeIlike(s: string): string {
  return s.replace(/([%_\\])/g, '\\$1')
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const json = await request.json().catch(() => null)
  if (!json || typeof json !== 'object') {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = CreateDiscoveryBody.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.join('.') || 'body'
    return Response.json({ error: `${field}: ${issue?.message ?? 'invalid'}` }, { status: 400 })
  }
  const body = parsed.data
  const supabase = getSupabaseAdmin()

  // Soft dedup against ACTIVE rows: identical title (case-insensitive) or
  // identical non-empty url. Archived/saved rows don't block re-entry.
  const [byTitle, byUrl] = await Promise.all([
    supabase
      .from('discoveries')
      .select('id, title')
      .eq('status', 'active')
      .ilike('title', escapeIlike(body.title.trim()))
      .limit(1),
    body.url
      ? supabase.from('discoveries').select('id, title').eq('status', 'active').eq('source_url', body.url).limit(1)
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const res of [byTitle, byUrl]) {
    if (res.error) {
      if (res.error.code === '42703') {
        return Response.json(
          { error: 'Database is missing columns from a pending migration — apply the latest files in supabase/migrations/ or re-run supabase/schema.sql.', code: '42703' },
          { status: 503 },
        )
      }
      return Response.json({ error: res.error.message }, { status: 500 })
    }
    const dup = res.data?.[0]
    if (dup) {
      return Response.json(
        { error: `Duplicate of active discovery ${dup.id} ("${dup.title}")`, duplicate_of: dup.id },
        { status: 409 },
      )
    }
  }

  const now = new Date().toISOString()
  const ws = body.work_status as WorkStatus
  const row: Record<string, unknown> = {
    title: body.title.trim(),
    source: body.source.trim(),
    // source_url is NOT NULL UNIQUE in the schema — synthesize a unique
    // placeholder when the signal has no URL (agent research, verbal leads).
    source_url: body.url ?? `manual://${randomUUID()}`,
    source_type: 'manual',
    status: body.status,
    work_status: ws,
    work_reason: body.work_reason.trim(),
    re_arm_at: body.re_arm_at ?? null,
    // Same two clocks as PATCH /api/discoveries/[id]: a manual entry is by
    // definition reviewed; it is "worked" only if it enters in a consuming state.
    reviewed_at: now,
    worked_at: CONSUMING_STATUSES.includes(ws) ? now : null,
  }
  if (body.category) row.sector = body.category
  if (body.geo) row.geo = body.geo
  if (body.icp_fit_score !== undefined) row.icp_fit_score = body.icp_fit_score
  if (body.discovery_kind) row.discovery_kind = normalizeDiscoveryKind(body.discovery_kind)
  if (body.sponsor) row.developer = body.sponsor.trim()
  if (body.work_categories?.length) row.work_categories = body.work_categories
  if (body.address) {
    // The filing identity: dedup future ingested articles about the same
    // project onto this row (address + city 'New York' for NY filings).
    row.project_name = body.address.trim()
    row.project_key = makeProjectKey(body.address, body.geo === 'nyc' ? 'New York' : null)
  }

  const { data, error } = await supabase.from('discoveries').insert(row).select().single()

  if (error) {
    if (error.code === '42703') {
      return Response.json(
        { error: 'Database is missing columns from a pending migration — apply the latest files in supabase/migrations/ or re-run supabase/schema.sql.', code: '42703' },
        { status: 503 },
      )
    }
    // 23505 = unique violation on source_url — same signal as the soft dedup,
    // just raced or non-active. Report it as a conflict, not a server error.
    if (error.code === '23505') {
      return Response.json({ error: `A discovery with url ${body.url} already exists` }, { status: 409 })
    }
    console.error('[discoveries] insert error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ discovery: data }, { status: 201 })
}
