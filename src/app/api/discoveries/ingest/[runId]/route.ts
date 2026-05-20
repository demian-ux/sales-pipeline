// GET status of a single ingestion run. Polled by the UI during long runs.
// Auth-gated with the same paths as the parent /api/discoveries/ingest so the
// run history doesn't leak when basic auth is on.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { isIngestAuthorized } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { runId } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('ingestion_runs')
    .select(`
      id,
      status,
      current_step,
      progress_percent,
      sources_count,
      articles_found,
      raw_articles_new,
      raw_articles_duplicate,
      articles_skipped_old,
      articles_skipped_irrelevant,
      articles_analyzed,
      articles_new,
      errors,
      started_at,
      finished_at
    `)
    .eq('id', runId)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 404 })
  return Response.json(data)
}
