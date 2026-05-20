// Article metadata extractor. Cheap first call — produces just the title,
// project type, scale, location that feed the downstream Tavily query.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import type { ProspectingArticle } from '@/lib/types'
import type { ClaudeUsage } from '@/lib/prospecting/costEstimate'

const ArticleSchema = z.object({
  title: z.string().min(1),
  project_type: z.string().min(1),
  scale: z.string().min(1),
  location: z.string().min(1),
})

const SYSTEM = 'Extract the key facts from this news article. Respond with valid JSON only — no prose, no markdown.'

function userPrompt(sourceUrl: string, articleText: string): string {
  return `Analyze this article for Oaki Studio's Prospecting tool.

Source URL:
${sourceUrl}

Article text:
"""
${articleText}
"""

Return only this JSON shape (English values):
{
  "title": "short title",
  "project_type": "project type label, e.g. residential tower / hotel / mixed-use / urban masterplan",
  "scale": "size summary, e.g. 200 units, 40 floors, 50,000 m². Use 'unspecified' if unclear.",
  "location": "City, Country. Use just 'Country' or 'unspecified' if unclear."
}`
}

export async function extractArticleMetadata(params: {
  sourceUrl: string
  articleText: string
}): Promise<{ article: ProspectingArticle; usage?: ClaudeUsage }> {
  requireAnthropic()

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(params.sourceUrl, params.articleText) }],
    }),
    undefined,
    'extractArticleMetadata',
  )

  const article = parseJson(extractText(response.content), ArticleSchema)
  return {
    article: {
      title: article.title.trim(),
      project_type: article.project_type.trim(),
      scale: article.scale.trim(),
      location: article.location.trim(),
    },
    usage: response.usage,
  }
}
