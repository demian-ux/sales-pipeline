// Prospecting orchestrator: paste URL → article text → metadata → Tavily search → Claude scoring.
//
// Returns the ProspectingResult plus a meta payload with cost + timing the UI
// surfaces in the CostEstimateCard.

import { env } from '@/lib/env'
import { fetchArticleTextWithJina } from './jinaReader'
import { discoverCandidateSources } from './tavily'
import { extractArticleMetadata } from '@/lib/prompts/prospecting/extract-metadata'
import { selectProspectingFirms } from '@/lib/prompts/prospecting/select-firms'
import { persistFirmCandidates } from './persistence'
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

export async function runProspectingAnalysis(
  sourceUrl: string,
  // `segment` (the beneficiary segment of an Opportunity Signal, e.g. "aviation
  // interior design") steers the firm-search toward the kind of firm that would
  // WIN the resulting work, rather than re-deriving the target from the source
  // article (which, for an opp signal, is about the org that announced the event).
  options: { sourceDiscoveryId?: string; segment?: string } = {},
): Promise<ProspectingResponse> {
  const startedAt = Date.now()

  // 1. Pull cleaned article text via Jina
  const articleText = await fetchArticleTextWithJina(sourceUrl)

  // 2. Claude extracts title / project_type / scale / location
  const extraction = await extractArticleMetadata({ sourceUrl, articleText })

  // 3. Tavily searches for candidate firms in 3 dimensions (segment-steered when
  //    we have a beneficiary segment to target)
  const candidateSources = await discoverCandidateSources(extraction.article, options.segment)

  // 4. Claude scores and selects 5–8 firms from the Tavily haul
  const selection = await selectProspectingFirms({
    sourceUrl,
    articleText,
    article: extraction.article,
    candidateSources,
    segment: options.segment,
  })

  // 5. Persist firm candidates to Supabase (silent no-op if not configured).
  // The Dashboard's "High-importance Candidates" card reads from this table.
  await persistFirmCandidates(selection.result.firms, { sourceDiscoveryId: options.sourceDiscoveryId })

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
