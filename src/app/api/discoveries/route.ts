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
  const sortBy     = sp.get('sort_by') === 'date' ? 'date' : 'score'
  const limit      = Math.min(parseInt(sp.get('limit') ?? '50', 10), 100)
  const offset     = parseInt(sp.get('offset') ?? '0', 10)

  let query = getSupabaseAdmin()
    .from('discoveries')
    .select(LIST_COLUMNS, { count: 'estimated' })

  if (sortBy === 'date') {
    query = query
      .order('date_published', { ascending: false, nullsFirst: false })
      .order('discovery_score', { ascending: false, nullsFirst: false })
  } else {
    query = query
      .order('discovery_score', { ascending: false, nullsFirst: false })
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
  if (search)        query = query.or(`title.ilike.%${search}%,brief_summary.ilike.%${search}%`)

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[discoveries] error:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ discoveries: data, total: count, offset, limit })
}
