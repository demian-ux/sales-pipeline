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
  // Sort: 'combined' (blended fit×deal, default) | 'score' (raw discovery_score) | 'date'.
  const sortParam  = sp.get('sort_by')
  const sortBy     = sortParam === 'date' ? 'date' : sortParam === 'score' ? 'score' : 'combined'
  const tenure     = sp.get('tenure')            ?? ''
  const sectorFit  = sp.get('sector_fit')        ?? ''
  const fitTier    = sp.get('fit_tier')          ?? ''
  const signalType = sp.get('signal_type')       ?? ''
  // 'engaged' = only worked firms | 'new' = only firms not yet in the CRM | '' = all
  const engagement = sp.get('engagement')        ?? ''
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
  // Drop disqualified rows but KEEP legacy null-tier rows (going-forward only).
  if (hideDisq && !fitTier) query = query.or('fit_tier.is.null,fit_tier.neq.disqualified')
  if (search)        query = query.or(`title.ilike.%${search}%,brief_summary.ilike.%${search}%`)

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[discoveries] error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ discoveries: data, total: count, offset, limit })
}
