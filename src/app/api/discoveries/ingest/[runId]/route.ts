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
      finished_at,
      discovery_kind,
      drafts_staged
    `)
    .eq('id', runId)
    .single()

  if (error) return Response.json({ error: error.message }, { status: 404 })
  return Response.json(data)
}

// PATCH — record drafts staged from this run's material (supply-health
// instrumentation, 2026-07-06). The working session sets this after it turns a
// run's discoveries into drafts. Accepts { drafts_staged } (absolute) or
// { increment } (add to the current count).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { runId } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  let draftsStaged: number
  if (typeof body.drafts_staged === 'number') {
    draftsStaged = Math.max(0, Math.floor(body.drafts_staged))
  } else if (typeof body.increment === 'number') {
    const { data: cur, error: readErr } = await supabase
      .from('ingestion_runs')
      .select('drafts_staged')
      .eq('id', runId)
      .single()
    if (readErr) return Response.json({ error: readErr.message }, { status: 404 })
    draftsStaged = Math.max(0, (cur?.drafts_staged ?? 0) + Math.floor(body.increment))
  } else {
    return Response.json(
      { error: 'Provide drafts_staged (absolute) or increment (delta)' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('ingestion_runs')
    .update({ drafts_staged: draftsStaged })
    .eq('id', runId)
    .select('id, drafts_staged')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ run: data })
}
