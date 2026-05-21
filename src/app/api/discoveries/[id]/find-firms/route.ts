// POST /api/discoveries/[id]/find-firms
//
// Runs the prospecting pipeline (Jina + Tavily + Claude × 2) using the
// Discovery's source_url. No body — the URL comes from the Discovery row.
// Returns the same ProspectingResponse shape as /api/prospecting/analyze
// so the UI can reuse the same firm-card components.
//
// Cookie-auth gated via the app-wide middleware; no extra check here.

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { runProspectingAnalysis } from '@/lib/prospecting/analyze'
import { ArticleFetchError } from '@/lib/prospecting/jinaReader'
import { TavilyError } from '@/lib/prospecting/tavily'
import { UnsafeUrlError } from '@/lib/prospecting/safeUrl'
import { ClaudeParseError } from '@/lib/ai/parse'
import { TimeoutError } from '@/lib/ai/timeout'

export const maxDuration = 180

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.TAVILY_API_KEY) {
    return Response.json({ error: 'TAVILY_API_KEY not configured' }, { status: 503 })
  }

  const { id } = await params

  const { data: discovery, error } = await getSupabaseAdmin()
    .from('discoveries')
    .select('id, source_url, title')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }
  if (!discovery.source_url) {
    return Response.json({ error: 'Discovery has no source_url' }, { status: 400 })
  }

  try {
    const response = await runProspectingAnalysis(discovery.source_url)
    return Response.json(response)
  } catch (err) {
    if (err instanceof UnsafeUrlError) return Response.json({ error: err.message, code: 'UNSAFE_URL' }, { status: 400 })
    if (err instanceof ArticleFetchError) {
      const status = err.code === 'JINA_TIMEOUT' ? 504
        : err.code === 'ARTICLE_UNREADABLE' || err.code === 'ARTICLE_PAYWALL_OR_BLOCKED' ? 422
        : 502
      return Response.json({ error: err.message, code: err.code }, { status })
    }
    if (err instanceof TavilyError) return Response.json({ error: err.message, code: err.code }, { status: 502 })
    if (err instanceof TimeoutError) return Response.json({ error: err.message, code: 'CLAUDE_TIMEOUT' }, { status: 504 })
    if (err instanceof ClaudeParseError) return Response.json({ error: 'Claude did not return valid JSON', code: 'AI_INVALID_JSON' }, { status: 502 })

    console.error('[discoveries/find-firms] unexpected error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Unexpected error' }, { status: 500 })
  }
}
