// Discoveries ingestion endpoint. Three legitimate auth paths:
//
//   1. `x-vercel-cron: 1` header  — Vercel cron (only Vercel's edge can set it)
//   2. `Authorization: Bearer ${INGEST_SECRET}`  — external curl / scripts
//   3. Valid `oaki_session` cookie  — authenticated UI user clicking "Run research"
//
// The route is in the middleware's PUBLIC_PREFIXES list so cron + bearer
// requests bypass the session-cookie redirect, and we re-check auth here
// inside the handler.
//
// Cron is wired in `vercel.json`. Pro plan unlocks the 300s function timeout.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { runIngestion } from '@/lib/discoveries/processor'
import { env } from '@/lib/env'
import {
  isAuthConfigured,
  verifySessionCookieValue,
  SESSION_COOKIE_NAME,
} from '@/lib/auth'

export const maxDuration = 300

async function isAuthorizedRequest(request: NextRequest): Promise<boolean> {
  // 1. Vercel cron — Vercel's edge network sets this header on scheduled
  //    invocations and the outside world cannot spoof it.
  if (request.headers.get('x-vercel-cron') === '1') return true

  // 2. Bearer token — `INGEST_SECRET` from env.
  const authHeader = request.headers.get('authorization')
  if (env.INGEST_SECRET && authHeader === `Bearer ${env.INGEST_SECRET}`) return true

  // 3. Valid session cookie — same HMAC the middleware uses.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookie && (await verifySessionCookieValue(cookie))) return true

  // 4. Open mode — if app auth itself is off (no APP_PASSWORD/SESSION_SECRET),
  //    the whole app is open and this route should be too. Matches the rest of
  //    the app's posture in local dev.
  if (!isAuthConfigured()) return true

  return false
}

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isAuthorizedRequest(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runOnce()
}

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  // Vercel cron — also triggers a run via GET (with the cron header).
  if (request.headers.get('x-vercel-cron') === '1') return runOnce()

  // Otherwise the request is asking for the recent run list — gate it the same
  // way as POST so the list doesn't leak when auth is on.
  if (!(await isAuthorizedRequest(request))) {
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
