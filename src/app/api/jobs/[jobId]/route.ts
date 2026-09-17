// GET /api/jobs/[jobId] — poll a research run started via POST /api/research/run
// or /api/opportunities/run (2026-08-25). Wraps the ingestion_runs row in a
// job-shaped response:
//   { job_id, status: queued|running|done|failed, progress_pct, phase,
//     candidates_analyzed, new_saved, mode, failed_sources, ... }
// The raw run counters ride along under `run` for consumers that want them.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { cleanupStaleRuns } from '@/lib/discoveries/run-manager'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { jobId } = await params
  await cleanupStaleRuns()
  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !data) {
    return Response.json({ error: `No job ${jobId}` }, { status: 404 })
  }

  // 'queued' = the row exists but the background work hasn't stamped progress yet.
  const status =
    data.status === 'running' && (data.progress_percent ?? 0) === 0 ? 'queued'
    : data.status === 'running' ? 'running'
    : data.status === 'done' ? 'done'
    : 'failed'

  return Response.json({
    job_id: data.id,
    status,
    progress_pct: data.progress_percent ?? 0,
    phase: data.current_step ?? null,
    mode: data.discovery_kind ?? null,
    candidates_analyzed: data.articles_analyzed ?? 0,
    new_saved: data.articles_new ?? 0,
    failed_sources: data.failed_sources ?? [],
    started_at: data.started_at,
    finished_at: data.finished_at,
    run: data,
  })
}
