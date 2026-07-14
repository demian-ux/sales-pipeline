// GET /api/discoveries/supply-health — supply-health instrumentation
// (2026-07-06, Workstream D; rewritten 2026-07-14). Trailing 14-day per-run
// net-new series, plus the board's real standing: what is NEW (never reviewed),
// what is BENCHED (reviewed and kept), and what actually got DRAFTED.
//
// Two things this endpoint used to get wrong, both of which made the machine
// look broken when it wasn't:
//   • "N unworked" counted reviewed-and-kept rows as backlog. `unworked` now
//     strictly means never reviewed, and that is the number worth reporting.
//   • drafts came from `ingestion_runs.drafts_staged`, a column nothing ever
//     increments — drafting happens via POST /api/leads + PATCH work_status,
//     outside any run row. So it always read 0 and the draft rate always read
//     "148 net-new → 0 drafted". Drafts are now counted where they actually
//     land: discoveries whose work_status is 'drafted' inside the window.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const WINDOW_DAYS = 14

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const activeCount = (workStatus: string) =>
    supabase
      .from('discoveries')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('work_status', workStatus)

  // Disqualified rows never reach the board, so they are not inventory and not
  // "new" — counting them is how you get a backlog number nobody can act on.
  const onBoard = (workStatus: string) =>
    activeCount(workStatus).or('fit_tier.is.null,fit_tier.neq.disqualified')

  const [runsRes, newRes, benchedRes, primeRes, workableRes, draftedRes] = await Promise.all([
    supabase
      .from('ingestion_runs')
      .select('id, started_at, finished_at, discovery_kind, articles_analyzed, articles_new, status')
      .gte('started_at', since)
      .order('started_at', { ascending: true }),
    onBoard('unworked'),
    onBoard('benched'),
    activeCount('unworked').eq('fit_tier', 'prime'),
    activeCount('unworked').eq('fit_tier', 'workable'),
    // Drafted inside the window. worked_at is stamped when a run consumes the
    // row, which for a draft is the moment the lead is created.
    supabase
      .from('discoveries')
      .select('id', { count: 'exact', head: true })
      .eq('work_status', 'drafted')
      .gte('worked_at', since),
  ])

  // Any of these columns missing (42703) means a migration hasn't been applied
  // yet — surface an actionable 503 rather than a generic 500.
  const migrationError = [runsRes.error, newRes.error, benchedRes.error, primeRes.error, workableRes.error, draftedRes.error]
    .find((e) => e?.code === '42703')
  if (migrationError) {
    return Response.json(
      {
        error:
          'Database is missing supply-health columns — apply supabase/migrations/2026-07-14_review_state.sql and 2026-07-06_cold_supply_fixes.sql (or re-run supabase/schema.sql).',
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
    status: r.status,
  }))

  const fresh = newRes.count ?? 0
  const benched = benchedRes.count ?? 0
  const prime = primeRes.count ?? 0
  const workable = workableRes.count ?? 0
  const drafted = draftedRes.count ?? 0

  const doneRuns = runs.filter((r) => r.status === 'done')
  const totalNetNew = doneRuns.reduce((s, r) => s + r.net_new, 0)

  return Response.json({
    window_days: WINDOW_DAYS,
    since,
    runs,
    inventory: {
      // The headline: rows nobody has looked at yet. Reads 0 after a full triage
      // pass and stays 0 until the next ingest lands something.
      new: fresh,
      benched,
      // Fit breakdown of the *new* rows only.
      prime,
      workable,
      workable_plus: prime + workable,
    },
    totals: {
      runs: doneRuns.length,
      net_new: totalNetNew,
      drafted,
      draft_rate: totalNetNew > 0 ? Math.round((drafted / totalNetNew) * 100) / 100 : 0,
    },
  })
}
