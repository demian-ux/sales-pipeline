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
  SignalType,
  Tenure,
  ProjectStage,
  DeploymentHorizon,
  VizBuyerRole,
  EstScaleVsFloor,
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
  // The event behind the article — gates the feed (KEEP types vs auto-archived
  // DROP types). See lib/discoveries/signal-type.ts.
  signal_type: SignalType
  // Canonical name of the development if the article states one ("Magic City",
  // "The Standard Residences Midtown"), else null. Drives project-level dedup.
  project_name: string | null
  project_type: string
  investment_size: string | null
  timeline: string | null
  main_actors: string[]
  developer: string | null
  architect: string | null
  government_body: string | null
  // ICP-fit signals (scored deterministically in lib/discoveries/icp.ts)
  tenure: Tenure
  has_for_sale_residential: boolean
  project_stage: ProjectStage
  // Entitlement grading evidence — which body granted/received what, + the
  // source sentence. Null when project_stage isn't an entitlement band.
  entitlement_evidence: string | null
  // Capital-event fields (only meaningful when signal_type = 'capital_event').
  // deployment_horizon → stage-equivalent points in icp.ts; intent_evidence is
  // the quote establishing forward development intent (a fund raised to BUILD,
  // not a loan against an existing asset).
  deployment_horizon: DeploymentHorizon | null
  intent_evidence: string | null
  intent_source_url: string | null
  viz_buyer_role: VizBuyerRole
  viz_buyer_entity: string | null
  incumbent_viz: string | null
  est_scale_vs_floor: EstScaleVsFloor
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
- region_strategic: score by the PROJECT's location, not where the firms are headquartered.
  In-target (New York metro, Miami / South Florida, France, major European cities) = 75–100
  Adjacent (other US gateway cities, secondary European cities) = 40–60
  Out-of-target (everywhere else: rest of US, Australia, Middle East, Africa, Asia, South America) = 0–25

━━━ ICP-FIT EXTRACTION — read carefully ━━━

oaki sells editorial visualization for projects SOLD FROM IMAGERY before they exist:
for-sale condos, branded residences, and hospitality that run image-led pre-sales
campaigns. Rentals, owner-occupied buildings, and pure financing plays do not commission
this. Extract these signals literally from the article — do NOT infer the favorable answer:

- tenure: Is the residential product FOR SALE (condos, branded residences), RENTAL
  (apartments, lease-up, multifamily), OWNER_OCCUPIED (a corporate HQ / build-to-own), or
  MIXED? **If the article does not state it, return "unknown" — do NOT assume for_sale —
  and lower confidence_score accordingly.** This is the single highest-signal field; getting
  it wrong (e.g. calling a rental tower for-sale) is the worst error you can make here.
- has_for_sale_residential: true only if there is an explicit for-sale residential component.
- project_stage — grade the entitlement band HONESTLY; do not let vague "cleared an approval"
  phrasing inflate a pre-application filing into a granted entitlement:
    • pre_entitlement — no approvals, years out, nothing filed
    • pre_application — a pre-application, letter of intent, or first community-board contact
      has been FILED but nothing is approved. "cleared an early approval" with NO named
      approving body = pre_application (this is the trap: it reads advanced but is years from product).
    • application_pending — a formal application/rezoning has been SUBMITTED, not yet approved
    • entitled — a rezoning / site-plan / variance has been GRANTED by a named body (the sweet spot)
    • design_in_hand | sales_launch (actively marketing units) | under_construction | built_stabilized
    • financing_only — a capital-markets / refinancing / leasing story with no product to market
- entitlement_evidence: when project_stage is pre_application / application_pending / entitled, state
  WHICH approval body, WHAT was granted or filed, and the SOURCE SENTENCE. null otherwise. If you can
  name no approving body, the stage is pre_application, not entitled.
- viz_buyer_entity + viz_buyer_role: name the entity that would actually COMMISSION sales/marketing
  visualization, and classify it. This is usually NOT the lender, fund, sponsor, or capital-markets
  actor named in the headline — it is the DEVELOPER's marketing/development lead (developer_marketing)
  or the founder/principal of a design-led developer (developer_principal). architect if only the
  design firm is identifiable; broker if only a sales broker; **none_identified if only a financial
  sponsor/lender/fund can be named.** Do not promote a lender into the buyer slot.
- incumbent_viz: any visualization / rendering / CGI vendor already credited on THIS project — parse
  image credits and phrasing like "renderings by X", "visuals by X", "CGI by X". null if none found.
- est_scale_vs_floor: is the project large enough to support a real viz commission?
  above (100+ units, branded residences, GDV $100M+, flagship) | near (mid-size) |
  below (boutique / <20 units / small) | unknown.
- deployment_horizon (capital_event ONLY; null otherwise): how soon the stated intent turns into
  buildable product — active_now (deploying now / this year / "openings this summer") |
  1_2_years | 3_plus_years | unstated (intent stated but no timeline).
- intent_evidence + intent_source_url (capital_event ONLY; null otherwise): the exact QUOTE that
  establishes forward development intent (e.g. "the $400M fund will develop luxury condominiums"),
  and the source URL. If you cannot quote forward intent, the event is transaction/financing, not
  capital_event.

━━━ SIGNAL_TYPE — the event behind the article ━━━

Classify what KIND of event this is. This is independent of the signal_tier and of the sector. KEEP types describe a project with imagery still ahead (it will be sold or leased from renders); DROP types are too-late, wrong-actor, or not a project — they get archived downstream, so do not soften a DROP into a KEEP.

  KEEP:
    • new_development — a new project revealed / unveiled / announced / launched
    • approval_filing — a SITE-SPECIFIC rezoning, entitlement, planning application, or approval for a named project
    • groundbreaking — construction starting on a named project
    • sales_launch — a sales gallery opening, "now selling", or a leasing launch
    • branded_partnership — a branded-residence or hotel-operator deal attached to a NEW development
    • redesign — a major redesign or repositioning of an in-progress development
    • capital_event — a capital move that will CREATE future development: a fund close / capital raise
      earmarked for a named development type ("closes $400M fund for luxury condo development"), an
      acquisition of a site or hotel WITH stated repositioning/development intent, a design-led
      developer/operator portfolio-expansion ("X doubles portfolio, N openings, pipeline to 2028"), or
      a new development arm / platform launch. Capital events fire EARLIER than a launch, before an
      incumbent visualizer exists — that earliness is the point.
      ► DISCRIMINATOR: capital_event requires explicit FORWARD DEVELOPMENT INTENT. A loan/refi against
        an EXISTING building = financing (DROP). A stabilized-asset trade = transaction (DROP). A fund
        raised to BUILD, or an acquisition to REDEVELOP = capital_event (KEEP). If you cannot find a
        stated intent-to-build/develop, classify transaction or financing — do NOT default to capital_event.

  DROP:
    • transaction — a resale, unit sale, portfolio trade, or land trade (a deal changing hands, not a project launching)
    • financing — a loan, refinancing, recapitalization, or construction-financing story
    • completion — a topping-off, completion, opening, or "now open" (the imagery window has passed)
    • policy — a non-site-specific policy, regulation, or zoning-law change (a city-wide SEQR/zoning story, NOT a specific project's approval — that is approval_filing)
    • government_program — a government or affordable-housing program announcement
    • corporate_pr — a brokerage / operator / firm "expansion", "alliance", or hire with no specific project
    • market_roundup — a ranking, "top deals", bulletin, or market report covering many deals
    • infrastructure — an airport TERMINAL / runway / apron, rail, port, or transit project (NOTE: an airport LOUNGE or premium-terminal interior is NOT infrastructure — that is sector "aviation_hospitality", signal_type new_development/redesign)

  other — use only when none of the above fits. Treated as KEEP downstream, so prefer a specific type when you can.

━━━ PROJECT_NAME ━━━
If the article names the development ("Magic City", "The Standard Residences Midtown", "One High Line"), return that proper name in project_name. Return null if there is no named project (a policy story, a market roundup, a firm-level PR item). Used to dedupe the same project arriving via two outlets — so be consistent (the project's name, not the headline).

Regions: "New York" | "Miami" | "France" | "Europe" | "Other"
Assign "Other" whenever the project is outside the four target regions — out-of-target discoveries are capped at watchlist downstream, so do not stretch a region label to fit. (The Middle East is NOT a target market — classify it "Other".)
Sectors: "hospitality" | "aviation_hospitality" | "luxury_residential" | "mixed_use" | "airports" | "office" | "transport" | "cultural" | "retail" | "other"
  • aviation_hospitality — airport LOUNGES, business/first-class lounges, premium-terminal interiors. oaki does these; treat them as in-scope hospitality, NOT as airport infrastructure.
  • airports — terminal / runway / apron / general airport infrastructure. Off-scope (pair with signal_type "infrastructure").
  • cultural — museums, galleries, civic / cultural landmarks (especially in Europe). In-scope.
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
  "sector": "hospitality|aviation_hospitality|luxury_residential|mixed_use|airports|office|transport|cultural|retail|other",
  "signal_type": "new_development|approval_filing|groundbreaking|sales_launch|branded_partnership|redesign|capital_event|transaction|financing|completion|policy|government_program|corporate_pr|market_roundup|infrastructure|other",
  "project_name": "the development's proper name, or null",
  "project_type": "brief project type description",
  "investment_size": "formatted amount or null",
  "timeline": "timeline description or null",
  "main_actors": ["array", "of", "actor", "names"],
  "developer": "developer name or null — the ENTITY OF RECORD actually buying/building/commissioning, as stated in the article. Do NOT guess from adjacent mentions: if the article names only a seller, broker, lender, or neighboring firm but not the actual buyer/developer, use null.",
  "architect": "architect/designer name or null",
  "government_body": "government body name or null",
  "tenure": "for_sale|rental|owner_occupied|mixed|unknown — use unknown if the article does not say",
  "has_for_sale_residential": true,
  "project_stage": "pre_entitlement|pre_application|application_pending|entitled|design_in_hand|sales_launch|under_construction|built_stabilized|financing_only",
  "entitlement_evidence": "which body granted/received what + source sentence, or null",
  "deployment_horizon": "active_now|1_2_years|3_plus_years|unstated — capital_event only, else null",
  "intent_evidence": "quote establishing forward development intent — capital_event only, else null",
  "intent_source_url": "source URL for the intent quote — capital_event only, else null",
  "viz_buyer_entity": "the developer marketing/dev lead or principal who would commission viz, or null — NOT the lender/fund",
  "viz_buyer_role": "developer_marketing|developer_principal|architect|broker|none_identified",
  "incumbent_viz": "rendering/CGI vendor already credited on this project, or null",
  "est_scale_vs_floor": "above|near|below|unknown",
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
  // Event-type gate. Unknown/garbage degrades to 'other' (KEEP) so a malformed
  // field can't silently archive a real launch — the DROP set is opt-in only.
  signal_type: z
    .enum([
      'new_development', 'approval_filing', 'groundbreaking', 'sales_launch',
      'branded_partnership', 'redesign', 'capital_event', 'transaction', 'financing', 'completion',
      'policy', 'government_program', 'corporate_pr', 'market_roundup',
      'infrastructure', 'other',
    ])
    .catch('other'),
  project_name: z.string().nullable().catch(null),
  project_type: z.string().catch(''),
  investment_size: z.string().nullable().catch(null),
  timeline: z.string().nullable().catch(null),
  main_actors: z.array(z.string()).catch([]),
  developer: z.string().nullable().catch(null),
  architect: z.string().nullable().catch(null),
  government_body: z.string().nullable().catch(null),
  // ICP-fit signals — each degrades to a conservative default (never assume
  // for_sale / a reachable buyer) so a malformed field can't inflate fit.
  tenure: z.enum(['for_sale', 'rental', 'owner_occupied', 'mixed', 'unknown']).catch('unknown'),
  has_for_sale_residential: z.boolean().catch(false),
  project_stage: z
    .enum(['pre_entitlement', 'pre_application', 'application_pending', 'entitled', 'entitled_no_design', 'design_in_hand', 'sales_launch', 'under_construction', 'built_stabilized', 'financing_only'])
    .catch('pre_entitlement'),
  entitlement_evidence: z.string().nullable().catch(null),
  deployment_horizon: z.enum(['active_now', '1_2_years', '3_plus_years', 'unstated']).nullable().catch(null),
  intent_evidence: z.string().nullable().catch(null),
  intent_source_url: z.string().nullable().catch(null),
  viz_buyer_entity: z.string().nullable().catch(null),
  viz_buyer_role: z
    .enum(['developer_marketing', 'developer_principal', 'architect', 'broker', 'none_identified'])
    .catch('none_identified'),
  incumbent_viz: z.string().nullable().catch(null),
  est_scale_vs_floor: z.enum(['above', 'near', 'below', 'unknown']).catch('unknown'),
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
