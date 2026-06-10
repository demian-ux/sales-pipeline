// Discoveries ingestion endpoint.
//
// POST: kicks off a run in the background via `after()` and returns
//   `202 { run_id }` immediately. The UI polls `/api/discoveries/ingest/[runId]`
//   for progress. Synchronous waits would routinely blow past Vercel's 300s
//   function timeout on a busy run.
//
// GET: returns recent runs (auth required), OR — when called with the
//   `x-vercel-cron: 1` header — also kicks off a background run.
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

export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return startBackgroundRun()
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

  if (request.headers.get('x-vercel-cron') === '1') return startBackgroundRun()

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

async function startBackgroundRun(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  await cleanupStaleRuns()

  // Refuse to start a second concurrent run — the previous one is still
  // live (started within the staleness window and not finished).
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

  // Create the run record up-front so the UI can immediately poll for it.
  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ status: 'running', current_step: 'Queued', progress_percent: 0 })
    .select('id')
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Failed to create run record' }, { status: 500 })
  }

  // Load the active sources synchronously so we can fail-fast with a clear
  // error before kicking off the background work.
  const ordered = await supabase
    .from('sources')
    .select('name, url')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const queryResult = ordered.error
    ? await supabase.from('sources').select('name, url').eq('active', true)
    : ordered

  if (queryResult.error) {
    await markRunFailed(run.id, `Sources query failed: ${queryResult.error.message}`)
    return Response.json({ error: `Sources query failed: ${queryResult.error.message}` }, { status: 500 })
  }

  const sources = queryResult.data ?? []
  if (sources.length === 0) {
    await markRunFailed(run.id, 'No active sources configured')
    return Response.json({ error: 'No active sources configured' }, { status: 400 })
  }

  // Schedule the heavy work to run after the response has been sent. The
  // function keeps executing until `maxDuration` is reached or it returns —
  // so give the pipeline a deadline 30s inside the wall: it stops cleanly,
  // finalizes the run record, and defers leftovers to the next run.
  const deadlineMs = Date.now() + (maxDuration - 30) * 1000
  after(async () => {
    try {
      await runIngestion(sources, run.id, undefined, deadlineMs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[ingest] background run crashed:', message)
      await markRunFailed(run.id, `Background run crashed: ${message}`)
    }
  })

  return Response.json(
    {
      run_id: run.id,
      status: 'running',
      sources_count: sources.length,
    },
    { status: 202 },
  )
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
