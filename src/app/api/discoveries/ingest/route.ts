// Discoveries ingestion endpoint.
//   POST → manual trigger, requires `Authorization: Bearer ${INGEST_SECRET}`.
//   GET  → recent runs list, OR (when called with `x-vercel-cron: 1`) a cron-
//          triggered ingestion.
//
// Cron is wired in `vercel.json`. Pro plan unlocks the 300s function timeout
// needed for a real run.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { runIngestion } from '@/lib/discoveries/processor'
import { env } from '@/lib/env'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Bearer auth — required for manual POST triggers.
  const authHeader = request.headers.get('authorization')
  if (!env.INGEST_SECRET) {
    return Response.json({ error: 'INGEST_SECRET not configured' }, { status: 503 })
  }
  if (authHeader !== `Bearer ${env.INGEST_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return runOnce()
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Vercel cron — header is set by Vercel itself on scheduled invocations.
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'
  if (isVercelCron) {
    return runOnce()
  }

  // Otherwise: return recent run history (for the UI to render a status panel).
  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ runs: data })
}

async function runOnce(): Promise<Response> {
  const supabase = getSupabaseAdmin()

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({ status: 'running' })
    .select('id')
    .single()

  if (runError || !run) {
    return Response.json({ error: 'Failed to create run record' }, { status: 500 })
  }

  // Try ordered query first; fall back if `sort_order` column is missing.
  const ordered = await supabase
    .from('sources')
    .select('name, url')
    .eq('active', true)
    .order('sort_order', { ascending: true })

  const queryResult = ordered.error
    ? await supabase.from('sources').select('name, url').eq('active', true)
    : ordered

  if (queryResult.error) {
    return Response.json({ error: `Sources query failed: ${queryResult.error.message}` }, { status: 500 })
  }

  const sources = queryResult.data ?? []
  if (sources.length === 0) {
    return Response.json({ error: 'No active sources configured' }, { status: 400 })
  }

  const result = await runIngestion(sources, run.id)
  return Response.json(result)
}
