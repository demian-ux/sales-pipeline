// POST /api/prospecting/analyze — paste URL, return scored firm candidates.
// Calls Jina + Tavily + Claude (twice). Bounded by `maxDuration` because the
// full pipeline takes ~30–60s on a cold path.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { runProspectingAnalysis } from '@/lib/prospecting/analyze'
import { ArticleFetchError } from '@/lib/prospecting/jinaReader'
import { TavilyError } from '@/lib/prospecting/tavily'
import { UnsafeUrlError } from '@/lib/prospecting/safeUrl'
import { ClaudeParseError } from '@/lib/ai/parse'
import { TimeoutError } from '@/lib/ai/timeout'

export const maxDuration = 180

const BodySchema = z.object({
  url: z.string().url('Must be a valid URL'),
  // Provenance: set when prospecting was launched from a Discovery, so
  // firm_candidates.source_discovery_id links back to the signal.
  discovery_id: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.TAVILY_API_KEY) {
    return Response.json({ error: 'TAVILY_API_KEY not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  try {
    const response = await runProspectingAnalysis(parsed.data.url, {
      sourceDiscoveryId: parsed.data.discovery_id,
    })
    return Response.json(response)
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return Response.json({ error: err.message, code: 'UNSAFE_URL' }, { status: 400 })
    }
    if (err instanceof ArticleFetchError) {
      const status = err.code === 'JINA_TIMEOUT' ? 504
        : err.code === 'ARTICLE_UNREADABLE' || err.code === 'ARTICLE_PAYWALL_OR_BLOCKED' ? 422
        : 502
      return Response.json({ error: err.message, code: err.code }, { status })
    }
    if (err instanceof TavilyError) {
      return Response.json({ error: err.message, code: err.code }, { status: 502 })
    }
    if (err instanceof TimeoutError) {
      return Response.json({ error: err.message, code: 'CLAUDE_TIMEOUT' }, { status: 504 })
    }
    if (err instanceof ClaudeParseError) {
      return Response.json({ error: 'Claude did not return valid JSON', code: 'AI_INVALID_JSON' }, { status: 502 })
    }

    console.error('[prospecting/analyze] unexpected error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Unexpected error' }, { status: 500 })
  }
}
