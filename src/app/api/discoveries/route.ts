// GET /api/discoveries — list with filters (ported from Terminal's
// /api/opportunities). Returns the Discovery rows the feed page renders.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

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
  'verified_principal, excavation_status, deployment_horizon, intent_evidence, entitlement_evidence, ' +
  'work_status, work_reason, worked_at, ' +
  'status, promoted_to_opportunity_id'

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const sp = request.nextUrl.searchParams
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
  const status     = sp.get('status')           ?? 'active'
  const search     = sp.get('search')           ?? ''
  // Which discovery mode's board to show. Defaults to the original launch
  // pipeline so the existing board (and legacy rows, which default to
  // 'project_launch') is unchanged; the board toggle sends the other value.
  const discoveryKind = sp.get('discovery_kind') ?? 'project_launch'
  // Sort: 'combined' (blended fit×deal, default) | 'score' (raw discovery_score) | 'date'.
  const sortParam  = sp.get('sort_by')
  const sortBy     = sortParam === 'date' ? 'date' : sortParam === 'score' ? 'score' : 'combined'
  const tenure     = sp.get('tenure')            ?? ''
  const sectorFit  = sp.get('sector_fit')        ?? ''
  const fitTier    = sp.get('fit_tier')          ?? ''
  const signalType = sp.get('signal_type')       ?? ''
  // 'engaged' = only worked firms | 'new' = only firms not yet in the CRM | '' = all
  const engagement = sp.get('engagement')        ?? ''
  // Work-tracking filter (2026-07-06). Default board hides worked material
  // (held/rejected/already_engaged) so runs judge only what's new. Pass an
  // explicit work_status to isolate one bucket (e.g. 'already_engaged' for the
  // existing-account view), or show_worked=true to reveal everything.
  const workStatus = sp.get('work_status')       ?? ''
  const showWorked = sp.get('show_worked') === 'true'
  // Hide disqualified is ON unless explicitly disabled, but never overrides an
  // explicit fit_tier filter (so you can still inspect disqualified rows).
  const hideDisq   = sp.get('hide_disqualified') !== 'false'
  const limit      = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100)
  const offset     = parseInt(sp.get('offset') ?? '0', 10)

  let query = getSupabaseAdmin()
    .from('discoveries')
    .select(LIST_COLUMNS, { count: 'estimated' })

  if (sortBy === 'date') {
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

  if (discoveryKind) query = query.eq('discovery_kind', discoveryKind)
  if (status)        query = query.eq('status', status)
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
  if (engagement === 'engaged') query = query.eq('already_engaged', true)
  if (engagement === 'new')     query = query.eq('already_engaged', false)
  // Work-status: an explicit value isolates that bucket; otherwise hide worked
  // material unless show_worked / engagement=engaged asked to reveal it.
  if (workStatus && workStatus !== 'all') {
    query = query.eq('work_status', workStatus)
  } else if (!showWorked && workStatus !== 'all' && engagement !== 'engaged') {
    query = query.or('work_status.is.null,work_status.not.in.(held,rejected,already_engaged)')
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
        { error: 'Database is missing columns from a pending migration — apply the latest file in supabase/migrations/ (2026-07-06_cold_supply_fixes.sql, and 2026-06-25_opportunity_signals.sql if not yet run), or re-run supabase/schema.sql.', code: '42703' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ discoveries: data, total: count, offset, limit })
}
