// Firm selection prompt. Translated from Fase B's original Spanish
// PHASE_B_SYSTEM_PROMPT to English (per Demian's decision Q4 — keep everything
// in English for consistency across the merged app).
//
// Takes an extracted article + a pile of Tavily search results, returns 5–8
// scored firm candidates fit for Oaki Studio's visualization work.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import type { ProspectingArticle, ProspectingResult, FirmCandidate } from '@/lib/types'
import type { ClaudeUsage } from '@/lib/prospecting/costEstimate'
import type { TavilySearch } from '@/lib/prospecting/tavily'

const FINAL_ARTICLE_CONTEXT_CHARS = 8_000

const FirmSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  project_type: z.string().min(1),
  reference_project: z.string().min(1),
  website: z.union([z.string().url(), z.literal(''), z.null()]).transform((v) => (v === '' ? null : v)),
  score: z.number().int().min(0).max(100),
})

const ResultSchema = z.object({
  article: z.object({
    title: z.string().min(1),
    project_type: z.string().min(1),
    scale: z.string().min(1),
    location: z.string().min(1),
  }),
  firms: z.array(FirmSchema).min(0).max(8),
})

const SYSTEM = `You are the analysis engine for Prospecting, an internal Oaki Studio tool.

Oaki Studio creates animation and architectural visualization for architecture studios and real estate developers.

Your task:
1. Read the cleaned text of an architecture or real estate news article.
2. Use the extracted article data as project reference.
3. Review Tavily search results to find firms in the same country.
4. Return between 5 and 8 firms that are good prospects for architectural visualization services.

ACCEPTED firm types:
- Architecture studio
- Interior design studio
- Real estate developer (a company that develops and promotes its own projects)

EXCLUDED firm types (only exclude if you can clearly identify they are this type):
- Construction firms or general contractors
- Property management companies
- Real estate investment funds, REITs, or investment firms
- Asset management companies
- Brokers, marketing agencies, media outlets, or magazines

Inclusion criteria:
- If a firm appears in Tavily results in the context of architecture, design, or real estate development, include it. No additional verification needed.
- Use any project mentioned in the Tavily results as that firm's reference. If no specific project is mentioned, use the article's project type as a general reference.
- Only exclude a firm if you can CLEARLY identify it as a builder, investment fund, property manager, or broker — not for lack of information.
- Do not include Oaki Studio.
- If there are more than 8 candidates, prioritize those working on projects similar in type and scale to the article.
- If you find fewer than 5, return what you have.

For the "website" field:
- If the Tavily result includes the firm's official URL (their own domain, not ArchDaily/Dezeen/LinkedIn), use it.
- Otherwise, set null. No verification needed.

For the "score" field (0 to 100):
Assign a prospect score for Oaki Studio. The ideal reference firm is iCrave: an interior architecture studio specialized in hospitality, restaurants, bars, clubs, entertainment, and high-end experiential commercial spaces.

Score criteria:
- 85-100: Interior design or interior architecture studios focused on hospitality, F&B, entertainment, retail, or experiential commercial spaces. High-aesthetic projects where visualization is key to selling the concept.
- 65-84: Architecture studios with strong portfolios in commercial, hotel, mixed-use with hospitality components, or luxury residential. Real estate developers of hotels or resorts.
- 45-64: Architecture studios or developers with mixed projects (residential + commercial). Mid-scale projects where visualization adds value but is not central.
- 25-44: Primarily residential firms, mass-market housing developers, or projects where visualization has less commercial weight.
- 0-24: Firms with little alignment to Oaki Studio's services.

Apply the score with judgment: prioritize project type and aesthetic importance over company size.

Article extraction rules:
- "title" should be short.
- "project_type" should be a clear label. Examples: "residential tower", "mixed-use", "urban masterplan", "hotel", "offices", "retail", "resort", "multifamily housing".
- "scale" should summarize size, height, square meters, number of units, number of floors, or urban scale. If unclear, use "unspecified".
- "location" should be "City, Country". If the city is unclear, use just "Country". If country is unclear, use "unspecified".

Output format:
- Respond only with a valid JSON object.
- No Markdown, no code blocks, no preamble or trailing prose, no comments, no trailing commas.
- All keys and values in English.
- The JSON must match exactly:

{
  "article": {
    "title": "short title",
    "project_type": "project type",
    "scale": "project scale",
    "location": "City, Country"
  },
  "firms": [
    {
      "name": "Firm name",
      "country": "Country",
      "project_type": "type of projects they do",
      "reference_project": "a known project of theirs or a similar project type",
      "website": "https://company.com",
      "score": 75
    }
  ]
}`

function userPrompt(params: {
  sourceUrl: string
  articleText: string
  article: ProspectingArticle
  candidateSources: TavilySearch[]
}): string {
  return `Analyze this article and the Tavily search results below.

Source URL:
${params.sourceUrl}

Extracted article data:
${JSON.stringify(params.article, null, 2)}

Article text:
"""
${params.articleText.slice(0, FINAL_ARTICLE_CONTEXT_CHARS)}
"""

Tavily search results:
${JSON.stringify(params.candidateSources, null, 2)}`
}

export async function selectProspectingFirms(params: {
  sourceUrl: string
  articleText: string
  article: ProspectingArticle
  candidateSources: TavilySearch[]
}): Promise<{ result: ProspectingResult; usage?: ClaudeUsage }> {
  requireAnthropic()

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(params) }],
    }),
    undefined,
    'selectProspectingFirms',
  )

  const raw = parseJson(extractText(response.content), ResultSchema)

  // De-dup by lowercased name (Claude occasionally returns near-duplicates)
  const seen = new Map<string, FirmCandidate>()
  const discoveredAt = new Date().toISOString()
  for (const firm of raw.firms) {
    const key = firm.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.set(key, {
      candidate_id: `${key.replace(/[^a-z0-9]+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
      name: firm.name.trim(),
      country: firm.country.trim(),
      project_type: firm.project_type.trim(),
      reference_project: firm.reference_project.trim(),
      website: firm.website,
      score: firm.score,
      source_article_url: params.sourceUrl,
      discovered_at: discoveredAt,
    })
  }

  return {
    result: {
      article: raw.article,
      firms: Array.from(seen.values()).slice(0, 8),
    },
    usage: response.usage,
  }
}
