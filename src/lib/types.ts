export type CampaignChannel = 'Email' | 'LinkedIn' | 'Letter' | 'Phone'
export type CampaignStatus = 'Active' | 'Paused' | 'Archived'
export type CampaignCadence = 'Daily' | 'Twice weekly' | 'Weekly' | 'Bi-weekly' | 'Monthly' | 'Quarterly'

export interface Campaign {
  campaign_id: string
  name: string
  description: string
  target_segment: string
  location?: string
  project_types?: string
  offer?: string
  pain_point?: string
  cta: string
  channels: CampaignChannel[]
  cadence: CampaignCadence
  status: CampaignStatus
  owner?: string
  notes?: string
  created_at: string
  updated_at: string
}

export type PipelineStage =
  | 'New Lead'
  | 'Contacted'
  | 'Replied'
  | 'Discovery'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Won'
  | 'Lost'
  | 'Nurture'
  | 'Dormant'
  // Deliberately parked: worked and set aside (e.g. a discovery re-derived to a
  // lead but held before drafting). First-class so the dedup sweep sees it as
  // "worked, don't re-chew" rather than a fresh New Lead. `held_reason` is
  // required when a lead moves here; `held_until` optionally re-arms it.
  | 'Held'

// Canonical display order for pipeline stages. Used by the Relationships
// page (group-by stage), the Campaigns page (stage breakdown), and anywhere
// else that needs a consistent ordering.
export const STAGE_ORDER: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Replied',
  'Discovery',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Nurture',
  'Held',
  'Dormant',
  'Lost',
]

export type LeadStatus = 'Active' | 'Inactive' | 'Archived'
export type RelationshipTemperature = 'Hot' | 'Warm' | 'Cool' | 'Cold'
export type UrgencyLevel = 'High' | 'Medium' | 'Low'
export type ConfidenceLevel = 'High' | 'Medium' | 'Low'
export type IntentLevel = 'high' | 'medium' | 'low'
export type RiskLevel = 'high' | 'medium' | 'low'
export type InteractionChannel = 'Email' | 'LinkedIn' | 'Phone' | 'Meeting' | 'Other'
export type InteractionDirection = 'Inbound' | 'Outbound'
export type LinkedInConnectionStatus =
  | 'Not Connected'
  | 'Connection Ready'
  | 'Connection Sent'
  | 'Connected'
  | 'Unknown'
export type LinkedInDMStatus =
  | 'Not Started'
  | 'DM Ready'
  | 'DM Sent'
  | 'Replied'
  | 'Not Interested'
  | 'Unknown'
export type LinkedInWarmth =
  | 'Passive'
  | 'Aware'
  | 'Connected'
  | 'Warm'
  | 'Engaged'
  | 'Active'

export interface Lead {
  lead_id: string
  company_id: string
  campaign_id?: string
  first_name: string
  last_name: string
  full_name: string
  email?: string
  linkedin_url?: string
  linkedin_connection_status?: LinkedInConnectionStatus
  linkedin_dm_status?: LinkedInDMStatus
  linkedin_warmth?: LinkedInWarmth
  last_linkedin_touch_date?: string
  linkedin_notes?: string
  title?: string
  company_name: string
  website?: string
  location?: string
  source?: string
  pipeline_stage: PipelineStage
  lead_status: LeadStatus
  business_fit_score?: number
  taste_score?: number
  relationship_score?: number
  opportunity_score?: number
  priority_score?: number
  relationship_temperature?: RelationshipTemperature
  last_touch_date?: string
  last_meaningful_touch?: string
  next_followup_date?: string
  next_action?: string
  known_pain_points?: string
  preferred_communication_style?: string
  owner?: string
  notes?: string
  // Held-stage metadata (2026-07-06). Populated when pipeline_stage === 'Held'.
  // held_until is a nullable ISO date for hooks that re-arm (e.g. "re-enter on
  // sales launch"). Stored in the Leads sheet — requires the two columns to
  // exist there; see LEAD_COLUMNS and /settings/sheets.
  held_reason?: string
  held_until?: string
  created_at: string
  updated_at: string
}

export interface Company {
  company_id: string
  company_name: string
  website?: string
  linkedin_company_url?: string
  industry?: string
  location?: string
  company_size?: string
  project_type?: string
  ideal_client_fit?: boolean
  fit_reason?: string
  design_quality_score?: number
  visual_identity_score?: number
  brand_positioning?: string
  architectural_style?: string
  market_position?: string
  project_scale?: string
  known_projects?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Opportunity {
  opportunity_id: string
  company_id: string
  // Optional — when empty, the Opportunity is Company-level (not yet attached
  // to a specific contact). Shows on every Lead at the same Company until
  // someone attaches it explicitly. See docs/execution-plan or AGENTS.md for
  // the rationale (Discovery → Firm flow can create opportunities before
  // Apollo brings in contacts).
  lead_id?: string
  campaign_id?: string
  opportunity_type: string
  source?: string
  summary: string
  why_now: string
  recommended_action: string
  urgency: UrgencyLevel
  confidence: number
  // Provenance: set when an Opportunity is promoted from a Discovery (market signal)
  discovered_from_id?: string
  discovered_from_url?: string
  status: 'Open' | 'In Progress' | 'Contacted' | 'Snoozed' | 'Closed' | 'Dismissed' | 'Archived'
  created_at: string
  updated_at: string
}

export interface ResearchFinding {
  finding_id: string
  company_id: string
  lead_id?: string
  source_type: string
  source_url?: string
  research_summary: string
  design_observations?: string
  market_positioning?: string
  visual_identity_notes?: string
  signals_detected?: string
  created_at: string
}

export interface Interaction {
  interaction_id: string
  lead_id: string
  company_id: string
  channel: InteractionChannel
  direction: InteractionDirection
  subject?: string
  body_summary?: string
  gmail_thread_id?: string
  gmail_message_id?: string
  linkedin_manual_status?: string
  sent_at?: string
  created_at: string
}

export interface AIInsight {
  insight_id: string
  lead_id: string
  company_id: string
  opportunity_id?: string
  summary: string
  why_now: string
  intent_level: IntentLevel
  recommended_next_action: string
  suggested_email?: string
  suggested_linkedin_dm?: string
  discovery_questions: string[]
  objections: string[]
  opportunities: string[]
  risk_level: RiskLevel
  confidence: number
  created_at: string
}

// Analyze — why now? Email and LinkedIn DM are produced by separate prompts
// (generate-email, generate-linkedin-dm) and persisted to their own Supabase
// tables. The legacy AIInsight.suggested_email / suggested_linkedin_dm fields
// remain (optional) for backward compatibility with rows created before the
// split, but the analyze prompt no longer fills them.
export interface LeadAnalysisOutput {
  summary: string
  why_now: string
  intent_level: IntentLevel
  recommended_next_action: string
  discovery_questions: string[]
  objections: string[]
  opportunities: string[]
  risk_level: RiskLevel
  confidence: number
}

export interface EmailDraftOutput {
  email: string
}

export interface LinkedInDraftOutput {
  dm: string
}

export interface MeetingPrepOutput {
  company_overview: string
  relationship_context: string
  why_meet_now: string
  likely_needs: string[]
  budget_questions: string[]
  pipeline_questions: string[]
  pain_point_questions: string[]
  marketing_goal_questions: string[]
  portfolio_references_to_show: string[]
  risks: string[]
  recommended_positioning: string
}

export interface ResearchExtractionOpportunity {
  opportunity_type: string
  summary: string
  why_now: string
  recommended_action: string
  urgency: UrgencyLevel
  confidence: number
}

export interface ResearchExtractionOutput {
  research_summary: string
  signals_detected: string[]
  design_observations: string
  market_positioning: string
  visual_identity_notes: string
  opportunities: ResearchExtractionOpportunity[]
  suggested_next_action: string
  suggested_email: string
  suggested_linkedin_dm: string
}

export interface LinkedInStrategyOutput {
  recommended_linkedin_action: 'Connect' | 'DM' | 'Engage first' | 'Wait' | 'Use email instead' | 'Nurture'
  why: string
  connection_note: string
  suggested_dm: string
  risk: string
  confidence: number
}

export interface StakeholderRanking {
  lead_id: string
  reason: string
  stakeholder_influence_score: number
  creative_alignment_score: number
  relationship_probability_score: number
}

export interface StakeholderPrioritizationOutput {
  best_contact_id: string
  ranking: StakeholderRanking[]
  recommended_approach: string
}

// Apollo import types
export interface ApolloImportRow {
  first_name: string
  last_name: string
  email?: string
  title?: string
  company_name: string
  website?: string
  linkedin_url?: string
  linkedin_company_url?: string
  location?: string
  industry?: string
  company_size?: string
  phone?: string
  // Optional warmth-context columns (generic CSV / Kanbox imports)
  source?: string
  pipeline_stage?: string
  relationship_temperature?: string
  last_touch_date?: string
  notes?: string
  // Populated by server during preview/import
  action?: 'create' | 'duplicate' | 'update' | 'rejected'
  duplicate_of?: string
  duplicate_reason?: string
  reject_reason?: string
}

// Workflow memory
export type WorkflowActionType =
  | 'draft_copied'
  | 'draft_sent'
  | 'draft_dismissed'
  | 'gmail_draft_created'
  | 'recommendation_accepted'
  | 'recommendation_dismissed'

export interface WorkflowAction {
  action_id: string
  type: WorkflowActionType
  lead_id?: string
  insight_id?: string
  opportunity_id?: string
  channel?: 'email' | 'linkedin'
  note?: string
  recorded_at: string
}

export interface ApolloImportResult {
  created_leads: number
  created_companies: number
  skipped_duplicates: number
  errors: string[]
}

export interface LeadWithCompany extends Lead {
  company?: Company
  latest_opportunity?: Opportunity
  latest_insight?: AIInsight
  recent_interactions?: Interaction[]
}

// ============================================================================
// Discovery module (from Opportunity Terminal — renamed)
// ============================================================================
// A Discovery is a market signal extracted from an article (typically RSS-ingested).
// It can be promoted into an Opportunity by attaching it to a Lead.
// Stored in Supabase (not Sheets) — high-volume, machine-generated.

export type DiscoverySignalTier = 'strong_opportunity' | 'watchlist' | 'archive'
export type DiscoveryStatus = 'active' | 'saved' | 'archived'

// Work-tracking, orthogonal to DiscoveryStatus (2026-07-06). `status` is the
// board bucket (active/saved/archived); `work_status` records whether a run has
// already acted on the row so the next run judges only what's new instead of
// re-chewing consumed material. The default active board hides held / rejected
// / already_engaged. `already_engaged` is set at ingestion when a named actor
// is already a CRM Company; the rest are set as runs work the row.
//
// `unworked` means NEVER REVIEWED (2026-07-14). A row a human/run looked at and
// deliberately kept for a future hook is `benched` — reviewed, still available,
// but not backlog. Conflating the two is what made the board shout "34 unworked"
// the day after every active row had been triaged.
export type WorkStatus =
  | 'unworked'
  | 'benched'
  | 'drafted'
  | 'held'
  | 'rejected'
  | 'already_engaged'

// States that mean "a run consumed this row" (stamps worked_at). `benched` is a
// verdict but not consumption — it stamps reviewed_at only, and stays on the board.
export const CONSUMING_STATUSES: readonly WorkStatus[] = ['drafted', 'held', 'rejected', 'already_engaged']

// The states hidden from the default new-signal board — worked material that
// shouldn't be re-judged. Revealed via an explicit filter.
export const WORKED_HIDDEN_STATUSES: readonly WorkStatus[] = ['held', 'rejected', 'already_engaged']

export type DiscoveryType = 'service' | 'tender' | 'trend'

export type DiscoverySector =
  | 'hospitality'
  | 'aviation_hospitality'   // airport lounges / premium-terminal interiors (oaki does these); NOT terminal/runway infra
  | 'luxury_residential'
  | 'mixed_use'
  | 'airports'               // terminal / runway / apron infrastructure — off-scope, archived via signal_type
  | 'office'
  | 'transport'
  | 'cultural'
  | 'retail'
  | 'other'

// Event type of the underlying news, orthogonal to sector. Gates the feed:
// KEEP types describe a project with a future imagery window (still to be sold
// or leased from renders); DROP types are too-late / wrong-actor / non-project
// signals that get analyzed then auto-archived. Emitted by the analyze prompt,
// classified by lib/discoveries/signal-type.ts. See project_oaki_discovery_icp_scope.
export type SignalType =
  // KEEP — a named project advancing, imagery still ahead
  | 'new_development'       // reveal / unveiling / launch of a new project
  | 'approval_filing'       // site-specific rezoning, entitlement, planning application, approval
  | 'groundbreaking'        // construction start
  | 'sales_launch'          // sales gallery / "now selling" / leasing launch
  | 'branded_partnership'   // branded-residence or hospitality-operator deal on a NEW development
  | 'redesign'              // major redesign / repositioning of an in-progress development
  | 'capital_event'         // fund close / dev-intent acquisition / portfolio expansion / new dev arm — fires EARLIER than a launch, before an incumbent visualizer exists. KEEP only when forward development intent is stated (see intent_evidence); otherwise the analyzer emits transaction/financing.
  // DROP — no future imagery window, wrong actor, or not a project
  | 'transaction'           // resale / unit sale / portfolio or land trade
  | 'financing'             // loan / refi / recap / construction financing
  | 'completion'            // topping-off / completion / opening / "now open"
  | 'policy'                // non-site-specific policy / regulation / zoning-law change
  | 'government_program'    // government or affordable-housing program announcement
  | 'corporate_pr'          // brokerage / operator expansion or alliance PR with no project
  | 'market_roundup'        // ranking / "top deals" / bulletin / market report
  | 'infrastructure'        // airport terminal/runway, rail/port/transit (≠ airport LOUNGE)
  // neutral fallback — treated as KEEP so a fuzzy event isn't silently dropped
  | 'other'

export type DiscoveryClientType =
  | 'architecture_firm'
  | 'real_estate_developer'
  | 'interior_designer'
  | 'urban_planner'

// ── ICP-fit layer (additive to discovery_score; see lib/discoveries/icp.ts) ──
// A second scoring axis: does this signal match the kind of deal oaki sells
// into (pre-sale, image-led residential / hospitality)? Extracted by the
// analyze prompt, scored deterministically in icp.ts, blended into combined_score.
export type Tenure = 'for_sale' | 'rental' | 'owner_occupied' | 'mixed' | 'unknown'

export type ProjectStage =
  | 'pre_entitlement'
  // Graded entitlement band (2026-07-06). Splits the old catch-all "approved/
  // filing" into three so a pre-application filing (years from product — the
  // Grupo T&C trap) can't score like a granted rezoning (the sweet spot).
  | 'pre_application'      // pre-app / letter of intent / community-board first contact — scores like pre_entitlement
  | 'application_pending'  // formal application submitted, not yet approved
  | 'entitled'             // rezoning / site-plan / variance GRANTED — post-entitlement, pre-marketing sweet spot
  | 'entitled_no_design'   // legacy value (pre-2026-07-06 rows); kept so old data type-checks
  | 'design_in_hand'
  | 'sales_launch'
  | 'under_construction'
  | 'built_stabilized'
  | 'financing_only'

// How far out a capital_event's stated development intent deploys. Maps to
// project_stage-equivalent points in icp.ts since a fund/acquisition has no
// literal construction stage yet. (2026-07-06)
export type DeploymentHorizon = 'active_now' | '1_2_years' | '3_plus_years' | 'unstated'

export type SectorFit = 'high' | 'medium' | 'low'

export type VizBuyerRole =
  | 'developer_marketing'
  | 'developer_principal'
  | 'architect'
  | 'broker'
  | 'none_identified'

export type EstScaleVsFloor = 'above' | 'near' | 'below' | 'unknown'

export type FitTier = 'prime' | 'workable' | 'complement' | 'weak' | 'disqualified'

// ── Opportunity Signals (second discovery mode; see project_oaki_opportunity_signals) ──
// 'project_launch' = the original direct-ICP pipeline (the prospect IS the source
// of the event). 'opportunity_signal' = upstream demand-creating events mapped to
// the design/dev firm that would WIN the resulting work (the prospect is never
// the source org).
export type DiscoveryKind = 'project_launch' | 'opportunity_signal'

// The beneficiary segment a demand-creating event maps to. Drives the
// deterministic opportunity score (segment fit + imagery-heaviness) and the
// on-demand firm-search. See lib/discoveries/opportunity-segments.ts.
export type OpportunitySegment =
  | 'aviation'            // airport / airline lounge & terminal programs → aviation-interior firms
  | 'hospitality'         // hotel-brand rollouts, resorts, F&B → hospitality architects/designers
  | 'cultural'            // museum / university / civic expansions → cultural-institutional architects
  | 'competitions'        // design competitions & masterplan RFPs → competition specialists (Naos lane)
  | 'experiential'        // flagships, brand experience centers, themed/entertainment → experiential designers
  | 'branded_residences'  // hospitality-flagged for-sale residential → luxury residential architects
  | 'other'

// ── Upstream-signal fields (2026-07-10; retunes the opportunity_signal lane) ──
// The strict pre-award test: FUTURE work a buyer will commission, briefs not
// yet awarded. Stored as fields (not just a score) so the weekly value-lane run
// ranks by future_work_test + geo + freshness and matches firms by
// work_categories ∩ geo. See the July 10 upstream-signal-sourcing handoff.

// Which firm CATEGORIES the resulting work could hire — the join key the
// value-lane firm-pool matches on (category ∩ geo). Distinct from
// OpportunitySegment (what KIND of project); this is who WINS the work.
export type WorkCategory =
  | 'development'
  | 'architecture'
  | 'interior_design'
  | 'hospitality_design'
  | 'landscape'
  | 'experiential'

// Firm-pool geography vocabulary (matches the firm-pool store's `geo`). Derived
// deterministically from region+country in code (lib/discoveries/target-geo.ts),
// not the prompt, so it can't drift.
export type Geo = 'nyc' | 'south_florida' | 'europe' | 'middle_east' | 'other'

// Award state of the design/development briefs. `awarded` auto-rejects — the
// whole point of the lane is to reach firms BEFORE the brief is won.
export type BriefsStatus = 'unawarded' | 'partially_awarded' | 'awarded'

// A target firm proposed by the opportunity-signal analyzer — ALWAYS a designer
// or developer (the prospect), never the source org. Persisted as JSONB on the
// discovery; enriched on demand by the Tavily find-firms flow.
export interface SuggestedTargetFirm {
  firm: string
  why_fit: string
  geography: string
  in_crm: boolean
  // true when the article already named this firm as the designer/developer
  // attached to the work (a stronger, specific lead) vs a candidate the
  // analyzer surfaced for an open brief.
  already_named?: boolean
  apollo_org_id?: string | null
  // Provenance (2026-07-06). Suggestions are hints by default and must never be
  // rendered as a card's primary prospect. Excavation promotes a firm to the
  // first-class `verified_principal` with independent evidence — it never
  // rewrites this field to 'verified'.
  confidence?: 'unverified_hint'
}

// The actual developer/designer-of-record for a signal, resolved by excavation
// (2026-07-06). Empty until something fills it. Written ONLY with a quotable
// independent source — a suggested_target_firm is never promoted here without
// its own evidence. This, not the hints, is a card's headline prospect.
export type PrincipalRole = 'developer' | 'designer' | 'operator'

export interface VerifiedPrincipal {
  firm: string
  role: PrincipalRole
  evidence_url?: string | null
  evidence_quote?: string | null
  verified_at?: string | null
  verified_by: 'pipeline' | 'manual'
}

// Excavation lifecycle for a discovery's verified_principal.
//   unattempted          — no excavation run yet
//   attempted_unresolved — excavation ran, found no quotable developer-of-record
//   resolved             — verified_principal is populated
export type ExcavationStatus = 'unattempted' | 'attempted_unresolved' | 'resolved'

export interface DiscoveryScoreBreakdown {
  score_opportunity_clarity: number
  score_investment_size: number
  score_timing: number
  score_actors: number
  score_sector_growth: number
  score_region_strategic: number
}

export interface Discovery extends DiscoveryScoreBreakdown {
  id: string
  title: string
  date_published?: string
  source: string
  source_url: string
  region?: string
  city?: string
  country?: string
  sector: DiscoverySector
  project_type?: string
  opportunity_type: DiscoveryType[]
  target_client_types: DiscoveryClientType[]
  investment_size?: string
  timeline?: string
  main_actors: string[]
  developer?: string
  architect?: string
  government_body?: string
  brief_summary: string
  why_it_matters: string
  deep_analysis: string
  suggested_action: string
  tags: string[]
  signal_tier: DiscoverySignalTier
  discovery_score: number
  urgency_score: number
  confidence_score: number

  // Event-type gate + project identity + CRM cross-reference (2026-06-25).
  // All optional so legacy (pre-migration) rows type-check.
  signal_type?: SignalType | null
  project_name?: string | null
  project_key?: string | null
  already_engaged?: boolean
  engaged_company_id?: string | null
  engaged_company_name?: string | null

  // ICP-fit layer — all optional so legacy (pre-migration) rows type-check.
  tenure?: Tenure
  has_for_sale_residential?: boolean
  project_stage?: ProjectStage
  sector_fit?: SectorFit
  viz_buyer_role?: VizBuyerRole
  viz_buyer_entity?: string | null
  incumbent_viz?: string | null
  est_scale_vs_floor?: EstScaleVsFloor
  icp_fit_score?: number | null
  fit_tier?: FitTier | null
  fit_reason?: string | null
  partner_radar?: boolean
  combined_score?: number | null

  // Opportunity Signals mode (2026-06-25). All optional so launch rows and
  // legacy (pre-migration) rows type-check. discovery_kind defaults to
  // 'project_launch' in the DB, so an absent value means a launch row.
  discovery_kind?: DiscoveryKind
  source_org?: string | null
  signal_event?: string | null
  beneficiary_segment?: string | null
  outreach_angle?: string | null
  opportunity_score?: number | null
  suggested_target_firms?: SuggestedTargetFirm[] | null

  // Upstream-signal fields (2026-07-10). All optional so launch + legacy opp
  // rows type-check. buyer_org == source_org (above); not duplicated.
  program_scope?: string | null           // what will be built/renovated, scale, timeframe
  briefs_status?: BriefsStatus | null      // awarded auto-rejects
  work_categories?: WorkCategory[] | null  // firm-pool join key
  geo?: Geo | null                         // firm-pool join key
  future_work_test?: boolean | null        // a && b && (briefs not awarded)
  future_work_reason?: string | null
  buyer_committed?: boolean | null         // test (a)
  programmatic_scope?: boolean | null      // test (b)

  // Capital events + entitlement grading (2026-07-06, Workstream A). All
  // optional so legacy rows type-check.
  intent_evidence?: string | null       // quote establishing forward development intent (capital_event)
  intent_source_url?: string | null
  deployment_horizon?: DeploymentHorizon | null
  entitlement_evidence?: string | null  // which body, what was granted, source sentence (entitlement grades)

  // Verified excavation (2026-07-06, Workstream B).
  verified_principal?: VerifiedPrincipal | null
  excavation_status?: ExcavationStatus | null

  // Work-tracking (2026-07-06, Workstream C2; review state 2026-07-14).
  work_status?: WorkStatus
  work_reason?: string | null
  worked_at?: string | null        // a run consumed the row
  reviewed_at?: string | null      // any verdict was written, benched included
  re_arm_at?: string | null        // YYYY-MM-DD; a held row returns to the board on this date
  duplicate_urls?: string[] | null // later articles about a project we already hold

  status: DiscoveryStatus
  raw_content?: string
  created_at: string
}

// Pre-analysis dedup cache row. Stores raw article URLs seen during ingestion,
// before classifier decides whether to deep-analyze.
export interface RawArticle {
  id: string
  url: string
  normalized_url: string
  title: string
  source: string
  source_feed_url?: string
  published_at?: string
  raw_content?: string
  first_seen_at: string
  last_seen_at: string
  research_run_id?: string
  status: 'new' | 'skipped_classifier' | 'skipped_old' | 'analyzed' | 'failed'
  skip_reason?: string
  analysis_attempts: number
  analyzed_at?: string
}

// Post-analysis dedup cache (lighter than RawArticle — just the URL + decision).
export interface AnalyzedArticle {
  id: string
  url: string
  title: string
  source: string
  published_at?: string
  signal_tier: DiscoverySignalTier
  created_at: string
}

// Registered RSS feed source.
export interface Source {
  id: string
  name: string
  url: string
  source_type: 'rss' | 'api' | 'manual'
  region?: string
  sector?: DiscoverySector
  active: boolean
  sort_order: number
  // Which discovery mode this feed belongs to. Defaults to 'project_launch' in
  // the DB; opportunity-signal feeds are tagged 'opportunity_signal'.
  discovery_kind?: DiscoveryKind
  created_at: string
}

// Observability for the ingestion pipeline. One row per cron-triggered run.
export interface IngestionRun {
  id: string
  started_at: string
  finished_at?: string
  sources_count: number
  articles_found: number
  raw_articles_new: number
  raw_articles_duplicate: number
  articles_skipped_old: number
  articles_skipped_irrelevant: number
  articles_analyzed: number
  articles_new: number
  errors: string[]
  // Sources that threw on fetch this run. The column has existed since the
  // 2026-06-09 migration and the processor has always written it — but this type
  // omitted it, so no caller could read it, and four dead feeds went unnoticed
  // for weeks (2026-07-14). Surfaced on the discoveries board via the last-run
  // health banner; never let a fetch failure be visible only to console.log.
  failed_sources?: string[]
  current_step?: string
  progress_percent: number
  status: 'running' | 'done' | 'failed'
}

// ============================================================================
// Prospecting module (from Fase B — renamed)
// ============================================================================
// A FirmCandidate is a firm discovered by analyzing an article URL.
// Lightweight, ephemeral (request-scoped) by default — promoted to a full
// Company via an explicit user action.

export interface ProspectingArticle {
  title: string
  project_type: string
  scale: string
  location: string
}

export interface FirmCandidate {
  // Synthesized within a single Prospecting run; not persisted by default.
  candidate_id: string
  name: string
  country: string
  project_type: string
  reference_project: string
  website: string | null
  score: number // 0-100
  // Provenance — the article that surfaced this firm
  source_article_url: string
  discovered_at: string
}

export interface ProspectingResult {
  article: ProspectingArticle
  firms: FirmCandidate[]
}

// ============================================================================
// Gmail conversations — canonical names
// ============================================================================
// Phase 2 will move the Gmail module to use these canonical names. For Phase 1,
// they alias the existing types from lib/gmail/types.ts so new code can
// reference the future-canonical names without breaking what exists.
//
// Note: this creates a circular-import risk if anything in lib/gmail/types
// ever imports back from lib/types. As of Phase 1 it doesn't, so this is safe.

export type { ParsedThread as Thread, ConversationAnalysis as ThreadAnalysis } from './gmail/types'

// ============================================================================
// Dashboard — tasks, drafts, persisted candidates, layout, snoozed signals
// ============================================================================
// All five live in Supabase (tasks/firm_candidates/email_drafts/linkedin_drafts
// in their own tables; dashboard_layout + snoozed_signals as JSONB blobs in
// app_secrets). See supabase/schema.sql.

export type TaskStatus = 'open' | 'done' | 'snoozed'
export type TaskLinkType =
  | 'lead'
  | 'opportunity'
  | 'discovery'
  | 'candidate'
  | 'conversation'

export interface Task {
  id: string
  title: string
  body?: string | null
  due_date?: string | null      // ISO date 'YYYY-MM-DD'
  link_type?: TaskLinkType | null
  link_id?: string | null
  status: TaskStatus
  snoozed_until?: string | null  // ISO date
  created_at: string
  updated_at: string
  completed_at?: string | null
}

// Persisted FirmCandidate row (the in-memory FirmCandidate above is ephemeral,
// used by /api/prospecting responses; this is the Supabase shape).
export type FirmCandidateStatus = 'new' | 'dismissed' | 'promoted'

export interface FirmCandidateRow {
  id: string
  candidate_id: string
  name: string
  country?: string | null
  project_type?: string | null
  reference_project?: string | null
  website?: string | null
  score?: number | null
  source_article_url: string
  source_discovery_id?: string | null
  status: FirmCandidateStatus
  promoted_to_company_id?: string | null
  promoted_to_opportunity_id?: string | null
  discovered_at: string
  updated_at: string
}

export interface EmailDraft {
  id: string
  lead_id: string
  company_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface LinkedInDraft {
  id: string
  lead_id: string
  company_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface LetterDraft {
  id: string
  lead_id: string
  company_id: string
  content: string
  created_at: string
  updated_at: string
}

// Persisted in app_secrets under key 'dashboard_layout'. Cards not in the
// array are treated as hidden (defaults filled in by the server route when
// no row exists yet).
export type DashboardCardId =
  | 'today'
  | 'send_queue'
  | 'linkedin_dm_queue'
  | 'opportunities'
  | 'attention'
  | 'conversations'
  | 'discoveries'
  | 'candidates'

export interface DashboardLayoutEntry {
  id: DashboardCardId
  visible: boolean
}

export interface DashboardLayout {
  cards: DashboardLayoutEntry[]
}

// Persisted in app_secrets under key 'snoozed_signals'. Each entry hides
// one auto-signal from the Today queue until snoozed_until passes. The
// signal_key encodes type + natural ID, e.g. 'thread:abc123',
// 'stalled_proposal:opp_xyz', 'overdue_followup:lead_123'.
export interface SnoozedSignal {
  signal_key: string
  snoozed_until: string  // ISO timestamp
}

export interface SnoozedSignalsBlob {
  signals: SnoozedSignal[]
}

// ============================================================================
// Firm Pool + Value-Outreach state (2026-07-10) — the value lane's population +
// outreach ledger. Supabase-backed (machine-generated, queryable). A firm's
// `categories` reuse WorkCategory tokens so category ∩ geo matches a signal's
// work_categories. See handoffs/firm-pool-crm-handoff-2026-07-10.md.
// ============================================================================

// active   — enriched + touchable now
// parked   — enriched, waiting for a matching signal
// candidate— an LLM example-firm hint from a signal, not yet verified
// excluded — client / engaged account / warm thread / mismatched mailbox
// converted— became a real lead/opportunity
export type PoolStatus = 'active' | 'parked' | 'candidate' | 'excluded' | 'converted'

export type EmailStatus = 'verified' | 'guessed' | 'bounced' | 'unknown'

export type ReplyStatus = 'none' | 'replied' | 'call' | 'brief'

export interface FirmPool {
  firm_id: string
  name: string
  domain?: string | null
  apollo_org_id?: string | null
  website?: string | null
  categories: WorkCategory[]
  geo?: Geo | null
  icp_notes?: string | null
  pool_status: PoolStatus
  exclusion_reason?: string | null
  linked_company_id?: string | null
  signal_ref?: string | null
  created_at: string
  updated_at: string
}

export interface FirmPoolContact {
  contact_id: string
  firm_id: string
  name?: string | null
  title?: string | null
  email?: string | null
  email_status?: EmailStatus | null
  linkedin_url?: string | null
  seat_checked_at?: string | null
  is_primary: boolean
  created_at: string
}

export interface ValueTouch {
  touch_id: string
  firm_id: string
  contact_id?: string | null
  signal_ref: string          // discovery id OR free-text signal name
  batch_date?: string | null
  sent_at?: string | null     // null until confirmed in Gmail Sent
  gmail_thread_id?: string | null
  bump_due?: string | null    // +7d from send
  reply_status: ReplyStatus
  notes?: string | null
  created_at: string
  updated_at: string
}
