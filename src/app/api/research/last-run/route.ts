// GET /api/research/last-run — the report of the most recent research activity
// as JSON (2026-08-25): the "did it run Monday morning, and did any feeds die"
// check without opening the UI.
//
//   {
//     last_run:        the most recent finished run (any mode),
//     last_by_mode:    latest finished run per discovery mode,
//     sources_health:  every source whose health <> 'ok' (needs the 2026-08-25
//                      source_health migration; [] with a note until applied),
//     sources_summary: { active, ok, unhealthy } — so an empty sources_health
//                      reads as "all N feeds ok", not "health isn't recorded",
//   }
// Each run report: mode, status, started/finished, duration_seconds, counters,
// failed_sources (the red-banner list), errors.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { cleanupStaleRuns } from '@/lib/discoveries/run-manager'

interface RunRow {
  id: string
  status: string
  discovery_kind: string | null
  started_at: string | null
  finished_at: string | null
  current_step: string | null
  articles_found: number | null
  articles_analyzed: number | null
  articles_new: number | null
  failed_sources: string[] | null
  errors: string[] | null
}

function report(run: RunRow) {
  const duration = run.started_at && run.finished_at
    ? Math.round((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null
  return {
    run_id: run.id,
    mode: run.discovery_kind ?? 'unknown',
    status: run.status,
    started_at: run.started_at,
    finished_at: run.finished_at,
    duration_seconds: duration,
    current_step: run.current_step,
    articles_found: run.articles_found ?? 0,
    candidates_analyzed: run.articles_analyzed ?? 0,
    new_saved: run.articles_new ?? 0,
    failed_sources: run.failed_sources ?? [],
    errors: run.errors ?? [],
  }
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const supabase = getSupabaseAdmin()
  await cleanupStaleRuns()

  const { data: runs, error } = await supabase
    .from('ingestion_runs')
    .select('id, status, discovery_kind, started_at, finished_at, current_step, articles_found, articles_analyzed, articles_new, failed_sources, errors')
    .neq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(30)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!runs || runs.length === 0) {
    return Response.json({ last_run: null, last_by_mode: {}, sources_health: [] })
  }

  const lastByMode: Record<string, ReturnType<typeof report>> = {}
  for (const run of runs as RunRow[]) {
    const mode = run.discovery_kind ?? 'unknown'
    if (!lastByMode[mode]) lastByMode[mode] = report(run)
  }

  // Sources whose health is degraded/dead. Tolerate the pre-migration schema.
  let sourcesHealth: unknown[] = []
  let sourcesSummary: { active: number; ok: number; unhealthy: number } | undefined
  let healthNote: string | undefined
  const { data: activeSources, error: healthErr } = await supabase
    .from('sources')
    .select('id, name, url, discovery_kind, active, health, consecutive_failures, last_success_at, last_failure_at, last_error')
    .eq('active', true)
  if (healthErr) {
    healthNote = healthErr.code === '42703'
      ? 'Source health columns missing — apply supabase/migrations/2026-08-25_source_health.sql'
      : healthErr.message
  } else {
    const all = activeSources ?? []
    sourcesHealth = all.filter((s) => s.health !== 'ok')
    sourcesSummary = { active: all.length, ok: all.length - sourcesHealth.length, unhealthy: sourcesHealth.length }
  }

  return Response.json({
    last_run: report(runs[0] as RunRow),
    last_by_mode: lastByMode,
    sources_health: sourcesHealth,
    ...(sourcesSummary ? { sources_summary: sourcesSummary } : {}),
    ...(healthNote ? { sources_health_note: healthNote } : {}),
  })
}
