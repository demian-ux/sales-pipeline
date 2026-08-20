// Seats worker trigger.
//   GET  — Vercel cron (nightly). Auth via isIngestAuthorized (CRON_SECRET /
//          INGEST_SECRET bearer / session cookie).
//   POST — manual trigger, same auth.
// Runs synchronously (bounded: 10 firms max per pass) and returns the summary.

import { type NextRequest } from 'next/server'
import { isSupabaseAdminConfigured } from '@/lib/supabase'
import { isIngestAuthorized } from '@/lib/auth'
import { runSeatsWorker } from '@/lib/seats/worker'

export const maxDuration = 300

async function handle(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await runSeatsWorker()
    console.log('[seats] run summary:', JSON.stringify(summary))
    return Response.json({ summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[seats] run failed:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }
