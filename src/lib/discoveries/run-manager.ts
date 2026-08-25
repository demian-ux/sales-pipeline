// Shared run-starting machinery for the ingestion endpoints (2026-08-25).
// Extracted from /api/discoveries/ingest so the API-first trigger routes
// (POST /api/research/run, POST /api/opportunities/run) start runs through
// exactly the same path as the UI button and the cron.

import { after } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { runIngestion, createIngestProgress } from '@/lib/discoveries/processor'
import { runStructuredIngestion, isStructuredSource } from '@/lib/discoveries/ny-native'
import type { DiscoveryKind } from '@/lib/types'

export interface SourceRow { name: string; url: string; source_type?: string | null }

// A run that has shown no sign of life for this long is considered dead
// (the serverless function was killed). Its candidates keep status='new'
// and are reclaimed by the next run.
const STALE_RUN_MINUTES = 15

export async function cleanupStaleRuns(): Promise<void> {
  const supabase = getSupabaseAdmin()
  const cutoff = new Date(Date.now() - STALE_RUN_MINUTES * 60_000).toISOString()
  const { data } = await supabase
    .from('ingestion_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      current_step: 'Marked stale — function was killed before finishing; unprocessed articles will be reclaimed',
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id')
  if (data && data.length > 0) {
    console.warn(`[ingest] Cleaned up ${data.length} stale run(s) stuck at 'running'`)
  }
}

// Structured (Socrata/API) sources are dispatched to the NY-native runner;
// everything else goes through the RSS pipeline. Structured runs first (fast,
// deterministic), then runIngestion — which also finalizes the shared run
// record — processes the RSS sources with the same progress object.
export async function runModeIngestion(
  sources: SourceRow[],
  runId: string,
  deadlineMs: number,
  mode: DiscoveryKind,
): Promise<void> {
  const structured = sources.filter(isStructuredSource)
  const rss = sources.filter((s) => !isStructuredSource(s))
  const progress = createIngestProgress()
  if (structured.length > 0) {
    await runStructuredIngestion(structured, progress, deadlineMs)
  }
  await runIngestion(rss, runId, progress, deadlineMs, mode)
}

// Active sources for a mode, ordered by sort_order. Tolerates a pre-migration
// schema (no discovery_kind column, code 42703): launch falls back to all active
// sources (legacy behaviour); opportunity_signal returns none until migrated.
export async function loadActiveSources(mode: DiscoveryKind): Promise<{ sources: SourceRow[] } | { error: string }> {
  const supabase = getSupabaseAdmin()

  const ordered = await supabase
    .from('sources')
    .select('name, url, source_type')
    .eq('active', true)
    .eq('discovery_kind', mode)
    .order('sort_order', { ascending: true })

  if (!ordered.error) return { sources: ordered.data ?? [] }

  if (ordered.error.code === '42703') {
    if (mode === 'opportunity_signal') return { sources: [] }
    const legacy = await supabase
      .from('sources')
      .select('name, url, source_type')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (!legacy.error) return { sources: legacy.data ?? [] }
    const noOrder = await supabase.from('sources').select('name, url, source_type').eq('active', true)
    return noOrder.error ? { error: noOrder.error.message } : { sources: noOrder.data ?? [] }
  }

  // Some other error (e.g. sort_order quirk) — retry without ordering.
  const noOrder = await supabase
    .from('sources')
    .select('name, url, source_type')
    .eq('active', true)
    .eq('discovery_kind', mode)
  return noOrder.error ? { error: noOrder.error.message } : { sources: noOrder.data ?? [] }
}

export async function markRunFailed(runId: string, currentStep: string): Promise<void> {
  await getSupabaseAdmin()
    .from('ingestion_runs')
    .update({
      status: 'failed',
      finished_at: new Date().toISOString(),
      current_step: currentStep,
      progress_percent: 100,
    })
    .eq('id', runId)
}

// Single-mode manual run: pre-create the run record so the caller can poll it
// immediately, then do the heavy work in `after()`. `maxDurationSeconds` is the
// calling route's exported maxDuration — the deadline stops 30s inside it.
// Idempotent under concurrency: a live run yields 409 with its run_id instead
// of a second parallel run.
export async function startBackgroundRun(mode: DiscoveryKind, maxDurationSeconds: number): Promise<Response> {
  const supabase = getSupabaseAdmin()

  await cleanupStaleRuns()

  // Refuse to start a second concurrent run — the previous one is still live.
  const { data: liveRuns } = await supabase
    .from('ingestion_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
  if (liveRuns && liveRuns.length > 0) {
    return Response.json(
      { error: 'A research run is already in progress', run_id: liveRuns[0].id, job_id: liveRuns[0].id, already_running: true },
      { status: 409 },
    )
  }

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ status: 'running', current_step: `Queued (${mode})`, progress_percent: 0 })
    .select('id')
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Failed to create run record' }, { status: 500 })
  }

  const loaded = await loadActiveSources(mode)
  if ('error' in loaded) {
    await markRunFailed(run.id, `Sources query failed: ${loaded.error}`)
    return Response.json({ error: `Sources query failed: ${loaded.error}` }, { status: 500 })
  }
  if (loaded.sources.length === 0) {
    const msg = mode === 'opportunity_signal'
      ? 'No active opportunity-signal sources configured'
      : 'No active sources configured'
    await markRunFailed(run.id, msg)
    return Response.json({ error: msg }, { status: 400 })
  }

  // Stop cleanly 30s inside the wall; deferred candidates carry to the next run.
  const deadlineMs = Date.now() + (maxDurationSeconds - 30) * 1000
  after(async () => {
    try {
      await runModeIngestion(loaded.sources, run.id, deadlineMs, mode)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ingest] background run crashed:', message)
      await markRunFailed(run.id, `Background run crashed: ${message}`)
    }
  })

  return Response.json(
    { run_id: run.id, job_id: run.id, status: 'running', mode, sources_count: loaded.sources.length },
    { status: 202 },
  )
}
