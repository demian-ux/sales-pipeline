// GET /api/value-outreach?signal_ref=<discovery id> — the value-outreach view.
//
// Given an upstream signal, returns its matched pool subset: firms whose
// categories overlap the signal's work_categories, in ANY focus firm geo, minus
// excluded/converted firms, minus same-signal duplicates, minus spacing
// violations (touched < 21d ago). Per the handoff addendum, VERIFIED pool firms
// (active/parked) come back as `ready`; unverified `candidate` firms are listed
// separately so the run sees "N ready + M hints to verify", never a mixed list.
//
// Geography (2026-11-26): firms are targeted by where THEY are, not where the
// project is. The signal's own geo no longer filters the pool — it only orders
// the result (same-geo firms first, then the geos of the firms the article
// names, then the remaining focus geos). See lib/firm-pool/match.ts.
//
// signal_ref must be a discovery id (the view needs its work_categories).
// ?category= overrides the signal's categories; ?geo= is a manual FILTER that
// narrows the result to one geo.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { FirmPool, WorkCategory, Geo, NamedFirm } from '@/lib/types'
import { joinGeos, geoPriority, matchPoolFirms } from '@/lib/firm-pool/match'

const SPACING_DAYS = 21

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const sp = request.nextUrl.searchParams
  const signalRef = sp.get('signal_ref') ?? ''
  if (!signalRef) {
    return Response.json({ error: 'signal_ref is required (a discovery id)' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()

  // Resolve the signal's match key (work_categories) and its ordering inputs
  // (project geo + named-firm geos), with query overrides. select('*') so a
  // database without the named_firms column (migration pending) still answers.
  const { data: signal } = await supabase
    .from('discoveries')
    .select('*')
    .eq('id', signalRef)
    .maybeSingle()

  const overrideCat = sp.get('category')
  const overrideGeo = sp.get('geo') || null
  const categories = (overrideCat ? [overrideCat] : (signal?.work_categories ?? [])) as WorkCategory[]
  const projectGeo = (signal?.geo ?? null) as Geo | null
  const namedFirmGeos = ((signal?.named_firms ?? []) as NamedFirm[]).map((f) => f.hq_geo)
  const order = { projectGeo, namedFirmGeos }
  const match = {
    categories,
    geo: overrideGeo,                          // manual filter, null when not passed
    project_geo: projectGeo,                   // orders the result, never filters it
    firm_geos: joinGeos(overrideGeo),          // the geos the pool query spans
    geo_priority: geoPriority(order),
  }

  if (!signal && !overrideCat) {
    return Response.json(
      { error: 'Signal not found — pass a discovery id as signal_ref, or ?category=&geo= to match by hand' },
      { status: 404 },
    )
  }
  if (categories.length === 0) {
    return Response.json({
      signal: signal ?? null,
      match,
      ready: [], candidates: [], spacing_skipped: [], already_touched: [],
      note: 'Signal has no work_categories to match on (legacy/unpopulated row).',
    })
  }

  // category overlap across the focus firm geos (or the one override geo),
  // minus excluded/converted. The SQL filter is an optimization; matchPoolFirms
  // is the authoritative rule and applies the geo ordering.
  const { data: matched, error } = await supabase
    .from('firm_pool')
    .select('*')
    .overlaps('categories', categories)
    .not('pool_status', 'in', '("excluded","converted")')
    .in('geo', [...joinGeos(overrideGeo)])
    .order('name', { ascending: true })
  if (error) {
    if (error.code === '42P01') {
      return Response.json(
        { error: 'firm_pool table missing — apply supabase/migrations/2026-07-10_firm_pool.sql', code: '42P01' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  const firms = matchPoolFirms((matched ?? []) as FirmPool[], { categories, overrideGeo, ...order })
  const firmIds = firms.map((f) => f.firm_id)

  // Touch history for the matched firms: same-signal dedup + spacing.
  const touchByFirm = new Map<string, { lastSent: number | null; thisSignal: boolean }>()
  if (firmIds.length > 0) {
    const { data: touches } = await supabase
      .from('value_touches')
      .select('firm_id, signal_ref, sent_at')
      .in('firm_id', firmIds)
    for (const t of touches ?? []) {
      const prev = touchByFirm.get(t.firm_id) ?? { lastSent: null, thisSignal: false }
      const sentMs = t.sent_at ? Date.parse(t.sent_at) : null
      touchByFirm.set(t.firm_id, {
        lastSent: sentMs && (!prev.lastSent || sentMs > prev.lastSent) ? sentMs : prev.lastSent,
        thisSignal: prev.thisSignal || t.signal_ref === signalRef,
      })
    }
  }

  const cutoff = Date.now() - SPACING_DAYS * 86_400_000
  const ready: FirmPool[] = []
  const candidates: FirmPool[] = []
  const spacingSkipped: FirmPool[] = []
  const alreadyTouched: FirmPool[] = []

  for (const f of firms) {
    const t = touchByFirm.get(f.firm_id)
    if (t?.thisSignal) { alreadyTouched.push(f); continue }        // same-signal dedup
    if (t?.lastSent && t.lastSent > cutoff) { spacingSkipped.push(f); continue }  // < 21d spacing
    if (f.pool_status === 'candidate') candidates.push(f)
    else ready.push(f)
  }

  return Response.json({
    signal: signal ? { id: signal.id, title: signal.title, briefs_status: signal.briefs_status, future_work_test: signal.future_work_test } : null,
    match: { ...match, spacing_days: SPACING_DAYS },
    ready,               // verified pool firms, in-state, ready to draft
    candidates,          // unverified hints to verify before batching
    spacing_skipped: spacingSkipped,  // matched but touched < 21d ago
    already_touched: alreadyTouched,  // already touched for THIS signal
    counts: { ready: ready.length, candidates: candidates.length, spacing_skipped: spacingSkipped.length, already_touched: alreadyTouched.length },
  })
}
