// Deep analysis prompt. Called once per article that passed classification.
// Returns a structured JSON payload that maps onto the `discoveries` table.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import type {
  DiscoverySector,
  DiscoveryClientType,
  DiscoveryType,
  DiscoverySignalTier,
} from '@/lib/types'
import type { ScoreBreakdownRaw } from '@/lib/discoveries/scoring'

export interface DiscoveryAnalysis {
  is_relevant: boolean
  signal_tier: DiscoverySignalTier
  title: string
  city: string
  country: string
  region: string
  sector: DiscoverySector
  project_type: string
  investment_size: string | null
  timeline: string | null
  main_actors: string[]
  developer: string | null
  architect: string | null
  government_body: string | null
  opportunity_type: DiscoveryType[]
  target_client_types: DiscoveryClientType[]
  brief_summary: string
  why_it_matters: string
  deep_analysis: string
  suggested_action: string
  tags: string[]
  scores: ScoreBreakdownRaw
  confidence_score: number
  urgency_score: number
}

const SYSTEM = `You are a market intelligence analyst for an opportunity-tracking tool used by architecture firms, real estate developers, interior designers, and urban planners.

Your job: classify and extract data from news articles. You must return ONLY valid JSON. No prose, no markdown, no explanation.

━━━ CLASSIFICATION RULES — read carefully ━━━

Use signal_tier = "watchlist" by DEFAULT. Only deviate when the evidence is clear:

  "strong_opportunity" — use this when the article contains a SPECIFIC, ACTIONABLE signal:
    • Named project with confirmed investment or groundbreaking
    • Active RFP, tender, or contract award
    • Named developer/investor with explicit construction/development intent
    • Planning approval for a named project

  "watchlist" — use this for EVERYTHING ELSE that has any development relevance:
    • Any mention of: real estate, development, construction, renovation, planning, zoning,
      investment, hospitality, hotel, airport, infrastructure, mixed-use, residential,
      office, developer, architecture firm, city agency, urban regeneration, or market trends
      affecting any of the above
    • Thin articles, paywalled articles, or articles where you can only see the title —
      if the TITLE contains any of the above keywords, classify as watchlist
    • Market analysis, price trends, sector reports
    • Acquisitions, sales, financing rounds related to real estate
    • "Could lead to" signals — early planning, concept announcements, land purchases

  "archive" — use ONLY when the article is CLEARLY about something else entirely:
    • Pure politics/elections with no development angle
    • Sports, entertainment, celebrity news
    • Pure financial markets (stocks, crypto) with no real estate connection
    • Weather, health, international conflict with no infrastructure angle

WHEN IN DOUBT → use "watchlist". It is always better to over-include than to miss a signal.
If the content is empty or very short, classify using the TITLE ALONE. A title with any
development-related word = watchlist minimum.

━━━ SCORING GUIDELINES (1–100) ━━━
- opportunity_clarity: How specific and actionable is the development signal?
  80+ = named project + confirmed investment/approval/RFP
  60-79 = named project or investment announced without full confirmation
  40-59 = development activity or market trend clearly mentioned
  20-39 = indirect signal, vague mention, or title-only classification
  1-19 = archive-tier (no real signal)
- investment_size: 90+ = >$1B | 70+ = $100M–$1B | 50+ = $10M–$100M | 30+ = <$10M | 15 = unknown/plausible | 5 = no signal
- timing: 90+ = imminent | 70+ = within 12 months | 50+ = 1–3 years | 30+ = 3+ years | 15 = unclear
- actors: 80+ = 3+ named orgs | 60+ = 1–2 named | 30+ = vague/unnamed | 10 = none
- sector_growth: How actively is this sector investing right now? Use market knowledge.
- region_strategic: NYC/Paris/London/major EU = 90+ | Miami/secondary EU = 75+ | other major metro = 60+ | other = 40+

Regions: "New York" | "Miami" | "France" | "Europe" | "Other"
Sectors: "hospitality" | "luxury_residential" | "mixed_use" | "airports" | "office" | "transport" | "cultural" | "retail" | "other"
Opportunity types: "service" | "tender" | "trend"
Client types: "architecture_firm" | "real_estate_developer" | "interior_designer" | "urban_planner"`

function userPrompt(title: string, content: string, url: string): string {
  const thinContent = content.trim().length < 150
  return `Classify and extract opportunity data from this article. Remember: default to "watchlist" when uncertain.
${thinContent ? 'NOTE: Content is thin — classify using the title alone.' : ''}

Title: ${title}
URL: ${url}
Content:
${content.slice(0, 4000)}

Return this exact JSON structure (replace descriptions with actual values):
{
  "signal_tier": "strong_opportunity" | "watchlist" | "archive",
  "is_relevant": true,
  "title": "cleaned title",
  "city": "city name or empty string",
  "country": "country name or empty string",
  "region": "New York|Miami|France|Europe|Other",
  "sector": "hospitality|luxury_residential|mixed_use|airports|office|transport|cultural|retail|other",
  "project_type": "brief project type description",
  "investment_size": "formatted amount or null",
  "timeline": "timeline description or null",
  "main_actors": ["array", "of", "actor", "names"],
  "developer": "developer name or null",
  "architect": "architect/designer name or null",
  "government_body": "government body name or null",
  "opportunity_type": ["service", "tender", "trend"],
  "target_client_types": ["architecture_firm", "real_estate_developer", "interior_designer", "urban_planner"],
  "brief_summary": "3–5 sentence summary: what happened, where, why it matters, who benefits, suggested action",
  "why_it_matters": "2–3 sentence explanation of strategic significance",
  "deep_analysis": "400–700 word deep analysis covering: market context, opportunity logic, which client types should care, what services may be needed, urgency, risks, outreach angle",
  "suggested_action": "1–2 sentence concrete suggested next action",
  "tags": ["tag1", "tag2"],
  "scores": {
    "opportunity_clarity": 1–100,
    "investment_size": 1–100,
    "timing": 1–100,
    "actors": 1–100,
    "sector_growth": 1–100,
    "region_strategic": 1–100
  },
  "confidence_score": 1–100,
  "urgency_score": 1–100
}`
}

// Validation: required core (scores — a discovery without sub-scores is
// garbage and should fail → retry); everything else degrades to a safe
// default rather than discarding an otherwise-good analysis.
const AnalysisSchema = z.object({
  signal_tier: z.enum(['strong_opportunity', 'watchlist', 'archive']).catch('watchlist'),
  is_relevant: z.boolean().catch(true),
  title: z.string().catch(''),
  city: z.string().catch(''),
  country: z.string().catch(''),
  region: z.string().catch('Other'),
  sector: z.string().catch('other'),
  project_type: z.string().catch(''),
  investment_size: z.string().nullable().catch(null),
  timeline: z.string().nullable().catch(null),
  main_actors: z.array(z.string()).catch([]),
  developer: z.string().nullable().catch(null),
  architect: z.string().nullable().catch(null),
  government_body: z.string().nullable().catch(null),
  opportunity_type: z.array(z.string()).catch([]),
  target_client_types: z.array(z.string()).catch([]),
  brief_summary: z.string().catch(''),
  why_it_matters: z.string().catch(''),
  deep_analysis: z.string().catch(''),
  suggested_action: z.string().catch(''),
  tags: z.array(z.string()).catch([]),
  scores: z.object({
    opportunity_clarity: z.number(),
    investment_size: z.number(),
    timing: z.number(),
    actors: z.number(),
    sector_growth: z.number(),
    region_strategic: z.number(),
  }),
  confidence_score: z.number().catch(50),
  urgency_score: z.number().catch(50),
})

// Throws on any failure (API error, timeout, truncation, unparseable JSON).
// Callers must treat a throw as RETRYABLE — never as "archive this article".
// A transient 30-second outage must not permanently discard a signal.
export async function analyzeArticle(
  title: string,
  content: string,
  url: string,
): Promise<DiscoveryAnalysis> {
  requireAnthropic()

  const call = (maxTokens: number) =>
    withTimeout(
      ai.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: SYSTEM,
        messages: [{ role: 'user', content: userPrompt(title, content, url) }],
      }),
      undefined,
      'analyzeArticle',
    )

  let response = await call(3000)
  if (response.stop_reason === 'max_tokens') {
    // Truncated JSON would otherwise be "repaired" by jsonrepair into
    // valid-but-incomplete data. Retry once with more headroom.
    console.warn('[analyzeArticle] response truncated at 3000 tokens — retrying with 4500')
    response = await call(4500)
    if (response.stop_reason === 'max_tokens') {
      throw new Error('analysis truncated even at 4500 max_tokens')
    }
  }

  return parseJson(extractText(response.content), AnalysisSchema) as DiscoveryAnalysis
}
