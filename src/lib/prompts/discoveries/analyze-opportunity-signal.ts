// Upstream Signals analyzer (retunes the opportunity_signal lane, 2026-07-10).
//
// The strict test: does the article describe FUTURE work a buyer will commission
// where the design/development briefs are NOT YET AWARDED? If so, map it to the
// firm CATEGORIES that could win the work — the value lane broadcasts to a
// population of firms (category ∩ geo), it no longer excavates to one named firm.
// The outreach target is ALWAYS a design/dev firm — never the buyer org that
// announced the event.
//
// The a/b/c machine-checkable heuristic is returned as FIELDS (buyer_committed,
// programmatic_scope, briefs_status, future_work_test), not just folded into a
// score, so the weekly value-lane run can rank and filter on them. The score
// itself is computed deterministically in lib/discoveries/opportunity-score.ts.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { TARGET_GEO_DESCRIPTION } from '@/lib/discoveries/target-geo'
import type { OpportunitySegment, WorkCategory, BriefsStatus } from '@/lib/types'
import type {
  DesignDemand,
  DesignScope,
  TargetReachability,
} from '@/lib/discoveries/opportunity-score'

// Illustrative example firm in a target category — NOT the excavation target.
// The value lane matches the firm POOL by work_categories ∩ geo; these are just
// worked examples to make the card legible, and are never surfaced as "the" lead.
export interface UpstreamFirmExampleRaw {
  firm: string
  why_fit: string
  geography: string
}

export type DecisionMakerRole = 'principal' | 'design_director' | 'marketing_bd'

export interface OpportunitySignalAnalysis {
  // Kept for backward-compat with the processor: true when the article passes
  // the upstream test (== future_work_test). A false value drops the row.
  is_opportunity_signal: boolean
  title: string
  // The named BUYER (owner / brand / government / institution) committing to the
  // work. Context and reason-to-reach-out only — NEVER the outreach target.
  source_org: string | null
  signal_event: string
  // Canonical short label for dedup (e.g. "JFK Terminal 6 lounges").
  event_name: string | null
  region: string
  city: string
  country: string
  segment: OpportunitySegment
  // Free-text human label for the segment (e.g. "aviation interior design").
  beneficiary_segment: string

  // ── The upstream test, stored as fields ──
  // What will be built/renovated, its scale, and its timeframe.
  program_scope: string
  // Award state of the briefs. `awarded` auto-rejects downstream.
  briefs_status: BriefsStatus
  // Which firm categories could WIN the resulting work — the firm-pool join key.
  work_categories: WorkCategory[]
  // (a) a named buyer committing to future construction/renovation.
  buyer_committed: boolean
  // (b) commitment is plural/programmatic OR a single project pre-design-selection.
  programmatic_scope: boolean
  // (a) && (b) && briefs plausibly unawarded.
  future_work_test: boolean
  future_work_reason: string

  // Illustrative example firms in the target categories (not the lead).
  suggested_target_firms: UpstreamFirmExampleRaw[]
  decision_maker_role: DecisionMakerRole
  // The hook, written TO a firm in the target category.
  outreach_angle: string

  // Raw scoring signals (timing is derived from briefs_status downstream).
  creates_design_demand: DesignDemand
  design_scope: DesignScope
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

Your job is UPSTREAM SIGNALS: read a news article and decide whether it describes FUTURE work a buyer will commission where the design/development briefs are NOT YET AWARDED, then map it to the firm CATEGORIES that could win that work. oaki reaches those firms EARLY, as market intelligence — before the brief is won.

━━━ THE SIGNAL TEST (this is the core — apply it literally) ━━━
A qualifying signal is FUTURE work a buyer will commission, where the design/development briefs are not yet awarded. Canonical example: "a company that owns airports in Spain will renovate all of them over the next 5 years" — that interests firms who work in airport renovations, because the briefs are still ahead.

QUALIFIES:
- renovation / expansion programs (a portfolio or a multi-year plan);
- RFPs and open design competitions;
- capital deployed for a development pipeline (a fund or JV raised/committed to BUILD);
- a brand announcing entry to a market before naming its design team;
- entitlement / zoning / master-plan packages that unlock a district;
- government licenses or development rights that trigger private construction (e.g. downstate casino licenses → billions entering design over the following years).

NEVER QUALIFIES (set future_work_test=false, is_opportunity_signal=false):
- another developer's finished or SELLING project — sales launches, pre-sale milestones, sellouts, "now selling";
- completions / openings / "now open" / topping-out;
- a transaction or financing of a single EXISTING asset (a trade, loan, refi, recap);
- market roundups, rankings, opinion, loyalty/program tweaks;
- anything where the design team is already publicly named AND the brief is complete (no work left to win).

━━━ THE MACHINE-CHECKABLE HEURISTIC — answer each, then combine ━━━
(a) buyer_committed: is there a NAMED buyer (owner / brand / government / institution) committing to future construction or renovation? (Not a broker, lender, or fund unless it is the developer-of-record committing to build.)
(b) programmatic_scope: is the commitment plural or programmatic (multiple projects, multiple years, a district) OR a single project clearly BEFORE design-team selection?
(c) briefs_status: are the briefs plausibly unawarded? → "unawarded" (no design/dev firm chosen yet), "partially_awarded" (a masterplanner or one parcel named, but individual briefs still open), or "awarded" (design team named and the brief is complete).
future_work_test = (a) AND (b) AND (briefs_status ≠ "awarded"). Set is_opportunity_signal to the SAME value. Put the deciding fact in future_work_reason (one line).

━━━ THE LOCKED RULE — never violate ━━━
The outreach target is ALWAYS a designer or developer (a firm oaki sells visualization to). NEVER the airport, airline, hotel brand, museum, university, government, or owner that is the SOURCE of the event — that org is the source_org, the reason for the outreach, never the target.

━━━ WORK CATEGORIES (the firm-pool join key — pick ALL that could win the work) ━━━
From: development, architecture, interior_design, hospitality_design, landscape, experiential. Pick the categories of firm that this specific work would hire — e.g. an airport lounge program → interior_design + hospitality_design + experiential; a rezoned waterfront district → development + architecture + landscape; a museum wing → architecture + experiential.

━━━ SEGMENT (pick the closest — drives the score) ━━━
- aviation — airport/airline lounge or terminal renovation/expansion programs.
- hospitality — hotel-brand rollouts, resort programs, F&B / nightlife, "brand enters [city]".
- cultural — museum, university, library, civic, performing-arts expansions or new builds.
- competitions — design competitions and masterplan RFPs.
- experiential — flagship rollouts, brand experience centers, themed entertainment, showrooms.
- branded_residences — hospitality-flagged for-sale residential.
- other — a served-adjacent event that fits none cleanly.

━━━ GEOGRAPHY ━━━
Target markets: ${TARGET_GEO_DESCRIPTION}. The Middle East is NOT a target market — classify it region "Other". Score the event by where the WORK is, not where firms are headquartered.

━━━ EXAMPLE FIRMS (optional, illustrative — NOT the lead) ━━━
The value lane broadcasts to the whole matched CATEGORY of firms via oaki's firm pool; it does not pitch one named firm. So do NOT hunt for the single firm attached to the project. You MAY list a couple of real, well-known specialist firms in the target category + geography as illustration (e.g. iCrave for aviation/experiential interiors) — never the source org, never invented names. If you can't name real ones, return an empty array; the category + geo is what matters.

━━━ THE RAW SIGNALS (extract literally; do not inflate) ━━━
- creates_design_demand: "high" (clearly triggers a substantial design commission) | "medium" (likely but soft/partial) | "low" (no real new design work).
- design_scope: size of the resulting DESIGN scope, not the project's capital cost: "large" (flagship / multi-property / full-program) | "mid" | "small" | "unknown".
- targets: "named" (you named a real example firm) | "findable" (clear category + geography to search) | "segment_only" (category known, firms TBD).
- decision_maker_role: who to approach at the target firm — "principal" | "design_director" | "marketing_bd".

Return ONLY valid JSON. No prose, no markdown.`

function userPrompt(title: string, content: string, url: string): string {
  const thinContent = content.trim().length < 150
  return `Analyze this article as an UPSTREAM SIGNAL. Apply the signal test literally: FUTURE work a buyer will commission, briefs NOT yet awarded. The outreach target is the CATEGORY of design/dev firms that would win the work, NEVER the org that announced the event.
${thinContent ? 'NOTE: Content is thin — judge from the title alone, and lower confidence_score.' : ''}

Title: ${title}
URL: ${url}
Content:
${content.slice(0, 4000)}

Return this exact JSON structure (replace descriptions with actual values):
{
  "is_opportunity_signal": true,
  "title": "cleaned title",
  "source_org": "the named buyer that announced the future work (owner/brand/gov/institution), or null",
  "signal_event": "one line: what future work, by whom, over what horizon — the demand-creating event",
  "event_name": "a short canonical label for dedup (e.g. 'JFK Terminal 6 lounges'), or null",
  "city": "city or empty string",
  "country": "country or empty string",
  "region": "New York|Miami|France|Europe|Other",
  "segment": "aviation|hospitality|cultural|competitions|experiential|branded_residences|other",
  "beneficiary_segment": "free-text label, e.g. 'aviation interior design'",
  "program_scope": "what will be built/renovated, its scale, and its timeframe",
  "briefs_status": "unawarded|partially_awarded|awarded",
  "work_categories": ["development|architecture|interior_design|hospitality_design|landscape|experiential", "..."],
  "buyer_committed": true,
  "programmatic_scope": true,
  "future_work_test": true,
  "future_work_reason": "one line: why it passes or fails the a/b/c test",
  "suggested_target_firms": [
    { "firm": "a real example firm in the target category (illustrative)", "why_fit": "one line why they fit this category", "geography": "where they are" }
  ],
  "decision_maker_role": "principal|design_director|marketing_bd",
  "outreach_angle": "2-3 sentence hook written TO a firm in the target category — calm, specific, references the real event; positions oaki as the partner who helps them win that kind of work; never generic",
  "creates_design_demand": "high|medium|low",
  "design_scope": "large|mid|small|unknown",
  "targets": "named|findable|segment_only",
  "brief_summary": "3-5 sentences: the future work, the category it feeds, why oaki should reach that category now",
  "why_it_matters": "2-3 sentences on the strategic significance for oaki",
  "deep_analysis": "300-600 words: the event, the design demand it creates, which firm categories pursue it and why, timing, the value-first angle, risks",
  "suggested_action": "1-2 sentences: the concrete next step (which category/geo to value-touch, with what hook)",
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

// Required core: the raw scoring signals + the a/b/c test fields (a signal
// without them can't be scored or gated → fail → retry). Everything else
// degrades to a safe default rather than discarding an otherwise-good analysis.
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
  program_scope: z.string().catch(''),
  briefs_status: z.enum(['unawarded', 'partially_awarded', 'awarded']),
  work_categories: z
    .array(z.enum(['development', 'architecture', 'interior_design', 'hospitality_design', 'landscape', 'experiential']))
    .catch([]),
  buyer_committed: z.boolean().catch(false),
  programmatic_scope: z.boolean().catch(false),
  future_work_test: z.boolean(),
  future_work_reason: z.string().catch(''),
  suggested_target_firms: z.array(FirmRawSchema).catch([]),
  decision_maker_role: z.enum(['principal', 'design_director', 'marketing_bd']).catch('principal'),
  outreach_angle: z.string().catch(''),
  creates_design_demand: z.enum(['high', 'medium', 'low']),
  design_scope: z.enum(['large', 'mid', 'small', 'unknown']),
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
      throw new Error('upstream-signal analysis truncated even at 4500 max_tokens')
    }
  }

  return parseJson(extractText(response.content), AnalysisSchema) as OpportunitySignalAnalysis
}
