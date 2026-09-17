// Discoveries ingestion endpoint.
//
// POST: kicks off a single-mode run in the background via `after()` and returns
//   `202 { run_id }` immediately. `?mode=opportunity_signal` runs the Opportunity
//   Signals pipeline; default (`project_launch`) runs the original direct-ICP
//   pipeline. The UI polls `/api/discoveries/ingest/[runId]` for progress.
//   API-first aliases: POST /api/research/run and POST /api/opportunities/run
//   start the same runs; GET /api/jobs/[jobId] polls them.
//
// GET: returns recent runs (auth required), OR — when called with the
//   Vercel cron markers (`x-vercel-cron-schedule` / `vercel-cron` UA) — kicks off a background run of BOTH modes
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
import {
  startBackgroundRun,
  cleanupStaleRuns,
  loadActiveSources,
  runModeIngestion,
  markRunFailed,
} from '@/lib/discoveries/run-manager'
import { isIngestAuthorized, isVercelCronRequest } from '@/lib/auth'
import { normalizeIngestMode } from '@/lib/discoveries/kind'
import type { DiscoveryKind } from '@/lib/types'

export const maxDuration = 300

// The modes the daily cron runs, in order. 'permit_filing' (the DOB
// new-building lane, 2026-08-04) runs FIRST: it is a ~5s structured fetch,
// while the two news modes together consume the whole wall-clock budget —
// with permit_filing last it was deadline-starved on every cron cycle from
// 2026-08-05 to 2026-08-13 and never ran again after launch day.
// 'offering_plan' is manual-entry only (the AG database has no API), so it is
// not cron-run.
const CRON_MODES: DiscoveryKind[] = ['permit_filing', 'project_launch', 'opportunity_signal']

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
  return startBackgroundRun(parseMode(request.nextUrl.searchParams.get('mode')), maxDuration)
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

  if (isVercelCronRequest(request)) return startCronRun()

  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ runs: data })
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
          await runModeIngestion(loaded.sources, runId, deadlineMs, mode)
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
