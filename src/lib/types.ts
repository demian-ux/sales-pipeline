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
export type DiscoveryType = 'service' | 'tender' | 'trend'

export type DiscoverySector =
  | 'hospitality'
  | 'luxury_residential'
  | 'mixed_use'
  | 'airports'
  | 'office'
  | 'transport'
  | 'cultural'
  | 'retail'
  | 'other'

export type DiscoveryClientType =
  | 'architecture_firm'
  | 'real_estate_developer'
  | 'interior_designer'
  | 'urban_planner'

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
