// Tavily search wrapper for the Prospecting pipeline. Runs three queries per
// article (architecture studios, interior design studios, real estate developers)
// scoped to the article's country when we can resolve it.
//
// Country normalization handles both English and a few common Spanish names
// (legacy from Fase B's Spanish prompt era) — the new English prompt should
// produce English locations, but we keep aliases for safety.

import { env } from '@/lib/env'
import type { ProspectingArticle } from '@/lib/types'

export class TavilyError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'TavilyError'
  }
}

export interface TavilyResult {
  title: string
  url: string
  content: string
  score?: number
}

export interface TavilySearch {
  query: string
  results: TavilyResult[]
}

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string; score?: number }>
}

const ACCEPTED_COUNTRIES = new Set([
  'argentina', 'australia', 'brazil', 'canada', 'chile', 'colombia',
  'france', 'germany', 'italy', 'mexico', 'netherlands', 'portugal',
  'spain', 'united arab emirates', 'united kingdom', 'united states', 'uruguay',
])

const COUNTRY_ALIASES = new Map<string, string>([
  ['alemania', 'germany'],
  ['brasil', 'brazil'],
  ['emiratos arabes unidos', 'united arab emirates'],
  ['espana', 'spain'],
  ['estados unidos', 'united states'],
  ['francia', 'france'],
  ['italia', 'italy'],
  ['paises bajos', 'netherlands'],
  ['reino unido', 'united kingdom'],
  ['usa', 'united states'],
  ['us', 'united states'],
  ['uk', 'united kingdom'],
  ['uae', 'united arab emirates'],
])

const MAX_RESULT_CONTENT_CHARS = 600

export async function discoverCandidateSources(article: ProspectingArticle): Promise<TavilySearch[]> {
  if (!env.TAVILY_API_KEY) {
    throw new TavilyError('TAVILY_API_KEY is not configured', 'TAVILY_API_KEY_MISSING')
  }

  const country = extractCountry(article.location)
  const countryParam = normalizeCountryForTavily(country)
  const queries = buildCandidateQueries(article, country)

  return Promise.all(queries.map((query) => searchTavily(query, countryParam)))
}

// Where to look for firms. City-level when the article gives one; when the
// article is US-wide with no city, bias toward Oaki's core markets (New York
// and Miami) instead of searching the whole country; never emit the literal
// "in unspecified" the legacy version produced.
function searchPlace(article: ProspectingArticle, country: string): string {
  const location = article.location?.trim() ?? ''
  if (location && location.toLowerCase() !== 'unspecified' && location.includes(',')) {
    return location // "City, Country" — search near the project itself
  }
  const c = country.toLowerCase()
  if (c === 'united states') return 'New York or Miami'
  if (c && c !== 'unspecified') return country
  return ''
}

function buildCandidateQueries(article: ProspectingArticle, country: string): string[] {
  const place = searchPlace(article, country)
  const scale = article.scale === 'unspecified' ? '' : article.scale
  const context = [article.project_type, scale].filter(Boolean).join(' ')
  const where = place ? ` in ${place}` : ''
  const what = context ? ` with ${context} projects` : ' working on high-end projects'

  return [
    `architecture studios${where}${what}`,
    `interior design studios${where}${what}`,
    `real estate developers${where}${what}`,
  ]
}

async function searchTavily(query: string, country: string | undefined): Promise<TavilySearch> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.TAVILY_TIMEOUT_MS)

  try {
    const response = await fetch(`${env.TAVILY_BASE_URL}/search`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        topic: 'general',
        search_depth: env.TAVILY_SEARCH_DEPTH,
        max_results: env.TAVILY_MAX_RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        country,
      }),
    })

    if (!response.ok) {
      const reason = response.status === 401 || response.status === 403
        ? 'TAVILY_AUTH_ERROR'
        : 'TAVILY_SEARCH_FAILED'
      throw new TavilyError(`Tavily search failed: HTTP ${response.status}`, reason)
    }

    const json = (await response.json()) as TavilyResponse

    return {
      query,
      results: (json.results ?? [])
        .filter((r) => r.title && r.url)
        .map((r) => ({
          title: r.title!.trim(),
          url: r.url!.trim(),
          content: (r.content ?? '').trim().slice(0, MAX_RESULT_CONTENT_CHARS),
          score: r.score,
        })),
    }
  } catch (err) {
    if (err instanceof TavilyError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new TavilyError('Tavily search timed out', 'TAVILY_TIMEOUT')
    }
    throw new TavilyError(
      `Tavily error: ${err instanceof Error ? err.message : String(err)}`,
      'TAVILY_UNKNOWN_ERROR',
    )
  } finally {
    clearTimeout(timer)
  }
}

function extractCountry(location: string): string {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  return parts.at(-1) || location || 'unspecified'
}

function normalizeCountryForTavily(country: string): string | undefined {
  const normalized = country
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const aliased = COUNTRY_ALIASES.get(normalized) ?? normalized
  return ACCEPTED_COUNTRIES.has(aliased) ? aliased : undefined
}
