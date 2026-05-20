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

  if (request.headers.get('x-vercel-cron') === '1') return startBackgroundRun()

  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ runs: data })
}

async function startBackgroundRun(): Promise<Response> {
  const supabase = getSupabaseAdmin()

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
  // function keeps executing until `maxDuration` is reached or it returns.
  after(async () => {
    try {
      await runIngestion(sources, run.id)
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
