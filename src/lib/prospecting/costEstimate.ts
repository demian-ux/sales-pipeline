// Computes USD cost estimate for one Prospecting run. Pulled into the UI's
// CostEstimateCard so Demian sees the spend per request (Tavily + Claude tokens).

import { env } from '@/lib/env'

export interface ClaudeUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export interface CostEstimate {
  totalUsd: number
  tavilyUsd: number
  claudeUsd: number
  tavilyQueries: number
  inputTokens: number
  outputTokens: number
}

const TAVILY_CREDIT_PRICE_USD = 0.008

// Per-MTok USD prices (verified 2026-06: Opus 4.5+ is $5/$25; Haiku 4.5 is
// $1/$5; Sonnet 4.x is $3/$15).
const MODEL_PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8':         { input: 5,   output: 25 },
  'claude-opus-4-7':         { input: 5,   output: 25 },
  'claude-opus-4-6':         { input: 5,   output: 25 },
  'claude-sonnet-4-6':       { input: 3,   output: 15 },
  'claude-sonnet-4-5':       { input: 3,   output: 15 },
  'claude-sonnet-4':         { input: 3,   output: 15 },
  'claude-haiku-4-5':        { input: 1,   output: 5 },
  'claude-3-5-haiku-latest': { input: 0.8, output: 4 },
}

export function estimateProspectingCost(params: {
  model: string
  tavilyQueries: number
  usages: Array<ClaudeUsage | undefined>
}): CostEstimate {
  const tavilyUsd = params.tavilyQueries * getTavilyQueryCost()
  const modelPrice = getModelPrice(params.model)
  const inputTokens  = params.usages.reduce((sum, u) => sum + sumInputTokens(u), 0)
  const outputTokens = params.usages.reduce((sum, u) => sum + (u?.output_tokens ?? 0), 0)
  const claudeUsd =
    (inputTokens  / 1_000_000) * modelPrice.input +
    (outputTokens / 1_000_000) * modelPrice.output

  return {
    totalUsd: tavilyUsd + claudeUsd,
    tavilyUsd,
    claudeUsd,
    tavilyQueries: params.tavilyQueries,
    inputTokens,
    outputTokens,
  }
}

function getTavilyQueryCost(): number {
  if (env.TAVILY_SEARCH_DEPTH === 'advanced') return TAVILY_CREDIT_PRICE_USD * 2
  return TAVILY_CREDIT_PRICE_USD
}

function sumInputTokens(u?: ClaudeUsage): number {
  if (!u) return 0
  return (u.input_tokens ?? 0)
    + (u.cache_creation_input_tokens ?? 0)
    + (u.cache_read_input_tokens ?? 0)
}

function getModelPrice(model: string): { input: number; output: number } {
  const lower = model.toLowerCase()
  const exact = MODEL_PRICES_PER_MILLION[lower]
  if (exact) return exact
  if (lower.includes('opus'))   return { input: 15,  output: 75 }
  if (lower.includes('haiku'))  return { input: 0.8, output: 4 }
  if (lower.includes('sonnet')) return { input: 3,   output: 15 }
  return { input: 3, output: 15 }
}
