// GET /api/discoveries/supply-health — supply-health instrumentation
// (2026-07-06, Workstream D). Trailing 14-day per-run net-new + drafts-staged
// series, plus current unworked prime/workable inventory (the real cold-lane
// "inventory"). This is the kill-switch metric: if inventory stays near zero
// after the cold-supply fixes ship, the answer is fewer cold runs, not more
// sources.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const WINDOW_DAYS = 14

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const activeUnworked = () =>
    supabase
      .from('discoveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('work_status', 'unworked')

  const [runsRes, primeRes, workableRes] = await Promise.all([
    supabase
      .from('ingestion_runs')
      .select('id, started_at, finished_at, discovery_kind, articles_analyzed, articles_new, drafts_staged, status')
      .gte('started_at', since)
      .order('started_at', { ascending: true }),
    activeUnworked().eq('fit_tier', 'prime'),
    activeUnworked().eq('fit_tier', 'workable'),
  ])

  // Any of these columns missing (42703) means the 2026-07-06 migration hasn't
  // been applied yet — surface an actionable 503 rather than a generic 500.
  const migrationError = [runsRes.error, primeRes.error, workableRes.error].find(
    (e) => e?.code === '42703',
  )
  if (migrationError) {
    return Response.json(
      {
        error:
          'Database is missing supply-health columns — apply supabase/migrations/2026-07-06_cold_supply_fixes.sql (or re-run supabase/schema.sql).',
        code: '42703',
      },
      { status: 503 },
    )
  }
  if (runsRes.error) {
    return Response.json({ error: runsRes.error.message }, { status: 500 })
  }

  const runs = (runsRes.data ?? []).map((r) => ({
    id: r.id,
    started_at: r.started_at,
    finished_at: r.finished_at,
    discovery_kind: r.discovery_kind ?? null,
    articles_analyzed: r.articles_analyzed ?? 0,
    net_new: r.articles_new ?? 0,
    drafts_staged: r.drafts_staged ?? 0,
    status: r.status,
  }))

  const prime = primeRes.count ?? 0
  const workable = workableRes.count ?? 0

  const doneRuns = runs.filter((r) => r.status === 'done')
  const totalNetNew = doneRuns.reduce((s, r) => s + r.net_new, 0)
  const totalDrafts = doneRuns.reduce((s, r) => s + r.drafts_staged, 0)

  return Response.json({
    window_days: WINDOW_DAYS,
    since,
    runs,
    inventory: {
      prime,
      workable,
      workable_plus: prime + workable,
    },
    totals: {
      runs: doneRuns.length,
      net_new: totalNetNew,
      drafts_staged: totalDrafts,
      // Draft-conversion rate over the window — the cold lane's real yield.
      draft_rate: totalNetNew > 0 ? Math.round((totalDrafts / totalNetNew) * 100) / 100 : 0,
    },
  })
}
