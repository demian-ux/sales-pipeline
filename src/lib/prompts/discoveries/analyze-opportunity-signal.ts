// Opportunity Signals analyzer. The second discovery mode's deep-analysis pass.
//
// Unlike analyze.ts (which scores a project where the prospect IS the source of
// the event), this hunts ONE STEP UPSTREAM: a market event that creates design
// work, mapped to the design/dev firm that would WIN that work. The outreach
// target is ALWAYS that firm — never the airport / hotel brand / museum /
// government that announced the event.
//
// Returns a structured payload that maps onto the `discoveries` table's opp
// columns (discovery_kind='opportunity_signal'). The opportunity score itself is
// computed deterministically in lib/discoveries/opportunity-score.ts from the
// raw signals this prompt extracts.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { TARGET_GEO_DESCRIPTION } from '@/lib/discoveries/target-geo'
import type { OpportunitySegment } from '@/lib/types'
import type {
  DesignDemand,
  DesignScope,
  OpportunityTiming,
  TargetReachability,
} from '@/lib/discoveries/opportunity-score'

export interface SuggestedTargetFirmRaw {
  firm: string
  why_fit: string
  geography: string
}

export type DecisionMakerRole = 'principal' | 'design_director' | 'marketing_bd'

export interface OpportunitySignalAnalysis {
  is_opportunity_signal: boolean
  title: string
  // The org that announced the event (airport operator, hotel brand, museum,
  // government). Context only — NEVER the outreach target.
  source_org: string | null
  // One-line description of the upstream demand-creating event.
  signal_event: string
  // Canonical short label for dedup (e.g. "JFK Terminal 6 lounges").
  event_name: string | null
  region: string
  city: string
  country: string
  segment: OpportunitySegment
  // Free-text human label for the segment (e.g. "aviation interior design").
  beneficiary_segment: string
  // Named specialists who would pursue the work — always designers/developers.
  suggested_target_firms: SuggestedTargetFirmRaw[]
  decision_maker_role: DecisionMakerRole
  // The hook, written TO the target firm.
  outreach_angle: string
  // Raw scoring signals (scored in opportunity-score.ts).
  creates_design_demand: DesignDemand
  design_scope: DesignScope
  timing: OpportunityTiming
  targets: TargetReachability
  brief_summary: string
  why_it_matters: string
  deep_analysis: string
  suggested_action: string
  tags: string[]
  confidence_score: number
  urgency_score: number
}

const SYSTEM = `You are a business-development analyst for oaki — a studio that makes editorial architectural visualization (films, renders, imagery) that design firms and developers pitch and win work with.

Your job is OPPORTUNITY SIGNALS: read a news article and decide whether it describes a market event that will CREATE design/architecture work, then map that event to the design or development firm that would WIN the resulting work. That firm — never the organization that announced the event — is the outreach target.

━━━ THE LOCKED RULE — never violate ━━━
The outreach target is ALWAYS a designer or developer (a firm oaki sells visualization to). NEVER the airport, airline, hotel brand, museum, university, government, or developer-as-owner that is the SOURCE of the event. The source organization matters only as the REASON for the outreach.
Worked example: "An airport operator will renovate all its lounges" → the target is aviation-interior / experiential DESIGN firms (the kind that designs lounges), NOT the airport. The angle is written to that design firm: "the lounge program is moving — you're built for this, and we make the imagery you'll pitch and win with."

━━━ WHAT COUNTS AS AN OPPORTUNITY SIGNAL ━━━
A just-announced or upcoming event that GUARANTEES design work in a segment oaki serves, where the winning designer is NOT YET NAMED or is up for grabs. The test: "Will this event cause a designer or developer to get hired, and is that the kind of firm oaki works with?"

Set is_opportunity_signal = false (and the row will be dropped) when:
- The winning design team is ALREADY named/awarded (that is a "Project Launch", a different mode — not this one).
- It is not a demand-creating event (a pure transaction, financing, market roundup, opinion, or completed/opened project — the design work is already done or there is none).
- It is outside oaki's served segments (below) or clearly outside the target geography with no in-target angle.

━━━ SEGMENTS oaki serves (pick the closest for "segment") ━━━
- aviation — airport/airline lounge or terminal renovation/expansion programs → aviation-interior & experiential firms.
- hospitality — hotel-brand rollouts, resort programs, F&B / nightlife concepts, "brand enters [city]" → hospitality architects & interior designers.
- cultural — museum, university, library, civic, performing-arts expansions or new builds → cultural / institutional architects.
- competitions — design competitions and masterplan RFPs → competition specialists.
- experiential — flagship rollouts, brand experience centers, themed entertainment, showrooms → retail / experiential designers.
- branded_residences — hospitality-flagged for-sale residential ("brand X flags residences in city Y") → luxury residential & hospitality architects.
- other — a served-adjacent event that fits none cleanly.

━━━ TARGET FIRMS ━━━
In suggested_target_firms, name real design/development firms that would pursue THIS work and that fit oaki (imagery-led, high-aesthetic). Name them only when you genuinely know a specialist in this segment + geography (e.g. iCrave for aviation/experiential interiors). If you cannot name a real firm with confidence, return an empty array — do NOT invent firms, and NEVER list the source organization. An empty array is fine; it means "segment known, firms to be found".

━━━ GEOGRAPHY ━━━
Target markets: ${TARGET_GEO_DESCRIPTION}. The Middle East is NOT a target market — classify it region "Other". Score the event by where the WORK is, not where firms are headquartered.

━━━ THE RAW SIGNALS (extract literally; do not inflate) ━━━
- creates_design_demand: "high" (the event clearly triggers a substantial design commission) | "medium" (likely but soft / partial) | "low" (no real new design work).
- design_scope: size of the resulting DESIGN scope, NOT the project's capital cost: "large" (a flagship / multi-property / full-program design effort) | "mid" | "small" (a minor / boutique scope) | "unknown".
- timing: "design_ahead" (the design phase is still ahead — oaki can get in early with the firm) | "in_progress" (design underway) | "awarded" (a firm has already won it) | "unknown".
- targets: "named" (you named at least one real target firm) | "findable" (no name, but a clear segment + geography to search) | "segment_only" (segment known, firms genuinely TBD).
- decision_maker_role: who to approach at the target firm — "principal" | "design_director" | "marketing_bd" (marketing / business-development lead).

Return ONLY valid JSON. No prose, no markdown.`

function userPrompt(title: string, content: string, url: string): string {
  const thinContent = content.trim().length < 150
  return `Analyze this article as an OPPORTUNITY SIGNAL. Remember: the outreach target is the design/dev firm that would WIN the resulting work, NEVER the organization that announced the event.
${thinContent ? 'NOTE: Content is thin — judge from the title alone, and lower confidence_score.' : ''}

Title: ${title}
URL: ${url}
Content:
${content.slice(0, 4000)}

Return this exact JSON structure (replace descriptions with actual values):
{
  "is_opportunity_signal": true,
  "title": "cleaned title",
  "source_org": "the org that announced the event (airport/brand/museum/gov), or null",
  "signal_event": "one line: what event, by whom, when — the demand-creating event",
  "event_name": "a short canonical label for dedup (e.g. 'JFK Terminal 6 lounges'), or null",
  "city": "city or empty string",
  "country": "country or empty string",
  "region": "New York|Miami|France|Europe|Other",
  "segment": "aviation|hospitality|cultural|competitions|experiential|branded_residences|other",
  "beneficiary_segment": "free-text label, e.g. 'aviation interior design'",
  "suggested_target_firms": [
    { "firm": "real design/dev firm name", "why_fit": "one line why they'd win this", "geography": "where they are" }
  ],
  "decision_maker_role": "principal|design_director|marketing_bd",
  "outreach_angle": "2-3 sentence hook written TO the target firm — calm, specific, references the real event; never generic",
  "creates_design_demand": "high|medium|low",
  "design_scope": "large|mid|small|unknown",
  "timing": "design_ahead|in_progress|awarded|unknown",
  "targets": "named|findable|segment_only",
  "brief_summary": "3-5 sentences: the event, the segment it feeds, who would win the work, why oaki should reach them",
  "why_it_matters": "2-3 sentences on the strategic significance for oaki",
  "deep_analysis": "300-600 words: the event, the design demand it creates, which firms pursue it and why, timing, the outreach angle, risks",
  "suggested_action": "1-2 sentences: the concrete next step (which firm/role to reach, with what hook)",
  "tags": ["tag1", "tag2"],
  "confidence_score": 1-100,
  "urgency_score": 1-100
}`
}

const FirmRawSchema = z.object({
  firm: z.string().min(1),
  why_fit: z.string().catch(''),
  geography: z.string().catch(''),
})

// Required core: the raw scoring signals (a signal without them can't be scored
// → fail → retry). Everything else degrades to a safe default rather than
// discarding an otherwise-good analysis.
const AnalysisSchema = z.object({
  is_opportunity_signal: z.boolean().catch(true),
  title: z.string().catch(''),
  source_org: z.string().nullable().catch(null),
  signal_event: z.string().catch(''),
  event_name: z.string().nullable().catch(null),
  city: z.string().catch(''),
  country: z.string().catch(''),
  region: z.string().catch('Other'),
  segment: z
    .enum(['aviation', 'hospitality', 'cultural', 'competitions', 'experiential', 'branded_residences', 'other'])
    .catch('other'),
  beneficiary_segment: z.string().catch(''),
  suggested_target_firms: z.array(FirmRawSchema).catch([]),
  decision_maker_role: z.enum(['principal', 'design_director', 'marketing_bd']).catch('principal'),
  outreach_angle: z.string().catch(''),
  creates_design_demand: z.enum(['high', 'medium', 'low']),
  design_scope: z.enum(['large', 'mid', 'small', 'unknown']),
  timing: z.enum(['design_ahead', 'in_progress', 'awarded', 'unknown']),
  targets: z.enum(['named', 'findable', 'segment_only']),
  brief_summary: z.string().catch(''),
  why_it_matters: z.string().catch(''),
  deep_analysis: z.string().catch(''),
  suggested_action: z.string().catch(''),
  tags: z.array(z.string()).catch([]),
  confidence_score: z.number().catch(50),
  urgency_score: z.number().catch(50),
})

// Throws on any failure (API error, timeout, truncation, unparseable JSON).
// Callers must treat a throw as RETRYABLE — never as "archive this article".
export async function analyzeOpportunitySignal(
  title: string,
  content: string,
  url: string,
): Promise<OpportunitySignalAnalysis> {
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
      'analyzeOpportunitySignal',
    )

  let response = await call(3000)
  if (response.stop_reason === 'max_tokens') {
    console.warn('[analyzeOpportunitySignal] response truncated at 3000 tokens — retrying with 4500')
    response = await call(4500)
    if (response.stop_reason === 'max_tokens') {
      throw new Error('opportunity-signal analysis truncated even at 4500 max_tokens')
    }
  }

  return parseJson(extractText(response.content), AnalysisSchema) as OpportunitySignalAnalysis
}
