// Prospecting orchestrator: paste URL → article text → metadata → Tavily search → Claude scoring.
//
// Returns the ProspectingResult plus a meta payload with cost + timing the UI
// surfaces in the CostEstimateCard.

import { env } from '@/lib/env'
import { fetchArticleTextWithJina } from './jinaReader'
import { discoverCandidateSources } from './tavily'
import { extractArticleMetadata } from '@/lib/prompts/prospecting/extract-metadata'
import { selectProspectingFirms } from '@/lib/prompts/prospecting/select-firms'
import { estimateProspectingCost, type ClaudeUsage, type CostEstimate } from './costEstimate'
import type { ProspectingResult } from '@/lib/types'

export interface ProspectingMeta {
  sourceUrl: string
  model: string
  durationMs: number
  articleChars: number
  tavilyQueries: Array<{ query: string; resultCount: number }>
  tavilyResults: number
  usage: { extraction?: ClaudeUsage; selection?: ClaudeUsage }
  costEstimate: CostEstimate
}

export interface ProspectingResponse {
  data: ProspectingResult
  meta: ProspectingMeta
}

export async function runProspectingAnalysis(sourceUrl: string): Promise<ProspectingResponse> {
  const startedAt = Date.now()

  // 1. Pull cleaned article text via Jina
  const articleText = await fetchArticleTextWithJina(sourceUrl)

  // 2. Claude extracts title / project_type / scale / location
  const extraction = await extractArticleMetadata({ sourceUrl, articleText })

  // 3. Tavily searches for candidate firms in 3 dimensions
  const candidateSources = await discoverCandidateSources(extraction.article)

  // 4. Claude scores and selects 5–8 firms from the Tavily haul
  const selection = await selectProspectingFirms({
    sourceUrl,
    articleText,
    article: extraction.article,
    candidateSources,
  })

  const durationMs = Date.now() - startedAt
  const tavilyResults = candidateSources.reduce((sum, s) => sum + s.results.length, 0)
  const costEstimate = estimateProspectingCost({
    model: env.ANTHROPIC_MODEL,
    tavilyQueries: candidateSources.length,
    usages: [extraction.usage, selection.usage],
  })

  return {
    data: selection.result,
    meta: {
      sourceUrl,
      model: env.ANTHROPIC_MODEL,
      durationMs,
      articleChars: articleText.length,
      tavilyQueries: candidateSources.map((s) => ({ query: s.query, resultCount: s.results.length })),
      tavilyResults,
      usage: { extraction: extraction.usage, selection: selection.usage },
      costEstimate,
    },
  }
}
