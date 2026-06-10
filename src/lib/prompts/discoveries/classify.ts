// Cheap first-pass classifier. Decides whether an article is worth the
// (more expensive) deep-analysis pass.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText, ClaudeParseError } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { env } from '@/lib/env'
import type { DiscoverySignalTier } from '@/lib/types'

export interface DiscoveryClassification {
  should_analyze: boolean
  signal_tier: DiscoverySignalTier
  confidence_score: number
  reason: string
}

const ClassificationSchema = z.object({
  should_analyze: z.boolean(),
  signal_tier: z.enum(['strong_opportunity', 'watchlist', 'archive']).catch('watchlist'),
  confidence_score: z.number().catch(0),
  reason: z.string().catch(''),
})

const SYSTEM = `You are a fast triage analyst for a market intelligence tool.

Return ONLY valid JSON. No prose, markdown, or commentary.

Decide whether a news article deserves full opportunity analysis for architecture, real estate development, interior design, hospitality, infrastructure, airports, urban planning, or city-building work.

Use should_analyze = true when the title/snippet suggests any plausible development, project, investment, planning, zoning, construction, real estate, hotel, airport, infrastructure, office, mixed-use, residential, cultural, retail, or urban regeneration signal.

Use should_analyze = false only when the article is clearly unrelated, stale commentary without project/business signal, sports, entertainment, celebrity, weather, pure politics, health, generic finance, or market news with no built-environment angle.

When unsure, choose should_analyze = true.`

function userPrompt(title: string, content: string, url: string): string {
  return `Classify this article for whether it deserves full analysis.

Title: ${title}
URL: ${url}
Snippet:
${content.slice(0, 1200)}

Return this exact JSON shape:
{
  "should_analyze": true,
  "signal_tier": "strong_opportunity" | "watchlist" | "archive",
  "confidence_score": 1,
  "reason": "short reason"
}`
}

export async function classifyArticle(
  title: string,
  content: string,
  url: string,
): Promise<DiscoveryClassification | null> {
  requireAnthropic()

  const classifierModel = env.ANTHROPIC_CLASSIFIER_MODEL ?? MODEL

  try {
    const response = await withTimeout(
      ai.messages.create({
        model: classifierModel,
        max_tokens: 300,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(title, content, url) }],
      }),
      undefined,
      'classifyArticle',
    )

    return parseJson(extractText(response.content), ClassificationSchema) as DiscoveryClassification
  } catch (err) {
    if (err instanceof ClaudeParseError) {
      console.warn('[classify] Unparseable response — treating as inconclusive')
      return null
    }
    console.error('[classify] error:', err instanceof Error ? err.message : err)
    return null
  }
}
