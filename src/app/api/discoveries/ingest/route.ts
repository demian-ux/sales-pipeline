// Discoveries ingestion endpoint.
//
// POST: kicks off a single-mode run in the background via `after()` and returns
//   `202 { run_id }` immediately. `?mode=opportunity_signal` runs the Opportunity
//   Signals pipeline; default (`project_launch`) runs the original direct-ICP
//   pipeline. The UI polls `/api/discoveries/ingest/[runId]` for progress.
//
// GET: returns recent runs (auth required), OR — when called with the
//   `x-vercel-cron: 1` header — kicks off a background run of BOTH modes
//   sequentially (one run record each), so the daily cron covers launches and
//   opportunity signals in one pass.
//
// Three+1 auth paths (see `lib/auth.ts: isIngestAuthorized`):
//   - Vercel cron header
//   - `Authorization: Bearer ${INGEST_SECRET}`
//   - Valid `oaki_session` cookie
//   - Open access when basic auth is not configured (local dev)

import { type NextRequest, after } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { runIngestion } from '@/lib/discoveries/processor'
import { isIngestAuthorized } from '@/lib/auth'
import { normalizeIngestMode } from '@/lib/discoveries/kind'
import type { DiscoveryKind } from '@/lib/types'

export const maxDuration = 300

// The modes the daily cron runs, in order.
const CRON_MODES: DiscoveryKind[] = ['project_launch', 'opportunity_signal']

// Accepts 'upstream_signal' as an alias for 'opportunity_signal'; anything else
// (or absent) falls back to 'project_launch'.
function parseMode(value: string | null): DiscoveryKind {
  return normalizeIngestMode(value)
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return startBackgroundRun(parseMode(request.nextUrl.searchParams.get('mode')))
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Authorize FIRST — the cron header alone is client-spoofable. Vercel cron
  // requests authenticate via `Authorization: Bearer ${CRON_SECRET}` (sent
  // automatically when the env var is set); see lib/auth.ts.
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (request.headers.get('x-vercel-cron') === '1') return startCronRun()

  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ runs: data })
}

// A run that has shown no sign of life for this long is considered dead
// (the serverless function was killed). Its candidates keep status='new'
// and are reclaimed by the next run.
const STALE_RUN_MINUTES = 15

async function cleanupStaleRuns(): Promise<void> {
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

interface SourceRow { name: string; url: string }

// Active sources for a mode, ordered by sort_order. Tolerates a pre-migration
// schema (no discovery_kind column, code 42703): launch falls back to all active
// sources (legacy behaviour); opportunity_signal returns none until migrated.
async function loadActiveSources(mode: DiscoveryKind): Promise<{ sources: SourceRow[] } | { error: string }> {
  const supabase = getSupabaseAdmin()

  const ordered = await supabase
    .from('sources')
    .select('name, url')
    .eq('active', true)
    .eq('discovery_kind', mode)
    .order('sort_order', { ascending: true })

  if (!ordered.error) return { sources: ordered.data ?? [] }

  if (ordered.error.code === '42703') {
    if (mode === 'opportunity_signal') return { sources: [] }
    const legacy = await supabase
      .from('sources')
      .select('name, url')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (!legacy.error) return { sources: legacy.data ?? [] }
    const noOrder = await supabase.from('sources').select('name, url').eq('active', true)
    return noOrder.error ? { error: noOrder.error.message } : { sources: noOrder.data ?? [] }
  }

  // Some other error (e.g. sort_order quirk) — retry without ordering.
  const noOrder = await supabase
    .from('sources')
    .select('name, url')
    .eq('active', true)
    .eq('discovery_kind', mode)
  return noOrder.error ? { error: noOrder.error.message } : { sources: noOrder.data ?? [] }
}

// Single-mode manual run: pre-create the run record so the UI can poll it
// immediately, then do the heavy work in `after()`.
async function startBackgroundRun(mode: DiscoveryKind): Promise<Response> {
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
      { error: 'A research run is already in progress', run_id: liveRuns[0].id },
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
  const deadlineMs = Date.now() + (maxDuration - 30) * 1000
  after(async () => {
    try {
      await runIngestion(loaded.sources, run.id, undefined, deadlineMs, mode)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ingest] background run crashed:', message)
      await markRunFailed(run.id, `Background run crashed: ${message}`)
    }
  })

  return Response.json(
    { run_id: run.id, status: 'running', mode, sources_count: loaded.sources.length },
    { status: 202 },
  )
}

// Cron run: process every mode sequentially, each with its own run record, all
// sharing one wall-clock deadline. If the first mode consumes the budget, the
// remaining modes are skipped this cycle and picked up next cron.
async function startCronRun(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  await cleanupStaleRuns()

  const { data: liveRuns } = await supabase
    .from('ingestion_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
  if (liveRuns && liveRuns.length > 0) {
    return Response.json(
      { skipped: true, reason: 'A research run is already in progress', run_id: liveRuns[0].id },
      { status: 200 },
    )
  }

  // Pre-create a run row synchronously so a 'running' row exists the instant we
  // return — this closes the check-then-insert window between the guard above
  // and the first insert (matching the manual POST path). The first mode that
  // actually has sources reuses this row; later modes create their own.
  const { data: firstRun, error: firstRunError } = await supabase
    .from('ingestion_runs')
    .insert({ status: 'running', current_step: 'Queued (cron)', progress_percent: 0 })
    .select('id')
    .single()
  if (firstRunError || !firstRun) {
    return Response.json({ error: 'Failed to create run record' }, { status: 500 })
  }

  const deadlineMs = Date.now() + (maxDuration - 30) * 1000

  after(async () => {
    let pendingRunId: string | null = firstRun.id
    for (const mode of CRON_MODES) {
      if (Date.now() > deadlineMs) {
        console.warn(`[ingest] Cron deadline reached before ${mode}; skipping it this cycle`)
        break
      }
      try {
        const loaded = await loadActiveSources(mode)
        if ('error' in loaded) {
          console.error(`[ingest] Cron ${mode} sources query failed: ${loaded.error}`)
          continue
        }
        if (loaded.sources.length === 0) {
          console.log(`[ingest] Cron ${mode}: no active sources, skipping`)
          continue
        }
        // Reuse the pre-created row for the first mode that runs; create a fresh
        // run record for subsequent modes.
        let runId: string
        if (pendingRunId) {
          runId = pendingRunId
          pendingRunId = null
        } else {
          const { data: run, error: runError } = await supabase
            .from('ingestion_runs')
            .insert({ status: 'running', current_step: `Queued (${mode})`, progress_percent: 0 })
            .select('id')
            .single()
          if (runError || !run) {
            console.error(`[ingest] Cron ${mode}: failed to create run record`)
            continue
          }
          runId = run.id
        }
        try {
          await runIngestion(loaded.sources, runId, undefined, deadlineMs, mode)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[ingest] Cron ${mode} run crashed:`, message)
          await markRunFailed(runId, `Background run crashed: ${message}`)
        }
      } catch (err) {
        console.error(`[ingest] Cron ${mode} unexpected error:`, err instanceof Error ? err.message : err)
      }
    }
    // The pre-created row was never consumed (no mode had sources, or the
    // deadline had already passed) — finalize it so it doesn't strand at 'running'.
    if (pendingRunId) {
      await markRunFailed(pendingRunId, 'No active sources for any mode this cycle')
    }
  })

  return Response.json({ status: 'running', modes: CRON_MODES }, { status: 202 })
}

async function markRunFailed(runId: string, currentStep: string): Promise<void> {
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
