# Audit — Data models

> Where each entity is defined, what fields it has, where the conflicts are, and a recommended canonical model for the merged app.

## TL;DR

- **`Opportunity` is the headline conflict.** Relations and Terminal both have an entity called `Opportunity` but they model totally different things — Relations' is a lead-attached deal record, Terminal's is a market signal extracted from a news article. **Resolution: rename Terminal's to `Discovery`.**
- **`Company`/`Firm` are siblings.** Relations' `Company` is rich and design-aware (visual_identity_score, brand_positioning, architectural_style…). Fase B's `Firm` is a 6-field discovery row (name, country, project_type, reference_project, website, score). **Resolution: `Firm` becomes a candidate that is *promoted* into a `Company` once Oaki engages.**
- **`Lead` only exists in Relations.** Terminal has no "person" concept; Fase B has no "person" concept. No conflicts there.
- **Storage backends conflict more than schemas do** — three different stores (Sheets / Supabase / ephemeral). See `audit-recommendation.md` for the migration strategy.

---

## Model inventory

### Oaki Relations (`src/lib/types.ts`)

| Entity | Storage | Identity |
|---|---|---|
| `Lead` | Sheets `Leads` tab | `lead_id` |
| `Company` | Sheets `Companies` tab | `company_id` |
| `Opportunity` | Sheets `Opportunities` tab | `opportunity_id` (FK: `company_id`, `lead_id`, `campaign_id`) |
| `ResearchFinding` | Sheets `Research_Findings` | `finding_id` (FK: `company_id`, `lead_id`) |
| `Interaction` | Sheets `Interactions` | `interaction_id` (FK: `lead_id`, `company_id`; refs `gmail_thread_id`, `gmail_message_id`) |
| `AIInsight` | Sheets `AI_Insights` | `insight_id` (FK: `lead_id`, `company_id`, `opportunity_id`) |
| `Campaign` | Sheets `Campaigns` | `campaign_id` |
| `LeadWithCompany` | derived (API shape) | enriched lead + latest opp/insight + recent interactions |
| `LeadAnalysisOutput` | not stored (Claude output) | inline JSON |
| `DiscoveryPrepOutput` | Sheets `DiscoveryPrep` | inline JSON; saved per discovery session |
| `ResearchExtractionOutput` | derived (Claude output) | inline JSON |
| `LinkedInStrategyOutput` | derived (Claude output) | inline JSON |
| `StakeholderPrioritizationOutput` | derived (Claude output) | inline JSON |
| `ConversationState` | enum | `'waiting_for_us' \| 'waiting_for_them' \| 'active' \| 'cooling' \| 'dormant'` |
| `ParsedThread` | session memory only | `thread_id` |
| `ConversationAnalysis` | session memory only | `analysis_id` (keyed by `thread_id`) |
| `WorkflowAction` | unclear (`/api/workflow/track`) | `action_id` |
| `ApolloImportRow` | derived (CSV) | one row per CSV line |

### Opportunity Terminal (`src/types/index.ts` + `supabase/schema.sql`)

| Entity | Storage | Identity |
|---|---|---|
| `Source` (TS implicit) | Supabase `sources` table | `id` UUID; unique `url` |
| `Opportunity` | Supabase `opportunities` table | `id` UUID; unique `source_url` |
| `IngestionRun` (TS implicit) | Supabase `ingestion_runs` | `id` UUID |
| `RawArticle` (TS implicit) | Supabase `raw_articles` | `id` UUID; unique `url`, `normalized_url` |
| `AnalyzedArticle` (TS implicit) | Supabase `analyzed_articles` | `id` UUID; unique `url` |
| `GeneratedOutput` | Supabase `generated_outputs` | `id` UUID; FK `opportunity_id` |
| `AIAnalysis` | not stored as own table (fields denormalized into `opportunities`) | — |
| `AIClassification` | not stored | — |
| `ScoreBreakdown` | denormalized into `opportunities` (6 `score_*` columns) | — |
| `FilterState` | UI only | — |
| `OpportunityType` | enum | `'service' \| 'tender' \| 'trend'` |
| `SectorType` | enum | 9 values (hospitality, luxury_residential, mixed_use, airports, office, transport, cultural, retail, other) |
| `ClientType` | enum | 4 values (architecture_firm, real_estate_developer, interior_designer, urban_planner) |
| `OpportunityStatus` | enum | `'active' \| 'saved' \| 'archived'` |
| `SignalTier` | enum | `'strong_opportunity' \| 'watchlist' \| 'archive'` |

### Fase B (`apps/api/src/schemas/phaseB.schema.ts`, mirrored in `apps/web/src/types/phaseB.ts`)

| Entity | Storage | Identity |
|---|---|---|
| `Article` | ephemeral (response only) | no ID |
| `Firm` | ephemeral + optional Sheets append | no ID |
| `PhaseBAnalysis` | ephemeral (response wrapper) | `{ article, firms }` |
| `ClaudeUsage` | response meta | — |

---

## Conflict & resolution table

> "Recommended final" = canonical entity name + home in the merged app.

| Concept | Project | Entity name | Storage | Resolution |
|---|---|---|---|---|
| Person at a firm | Relations | `Lead` | Sheets | **Keep as `Lead`** — sole owner. |
| Firm (engaged) | Relations | `Company` | Sheets | **Keep as `Company`** — rich, design-aware, has scoring. |
| Firm (candidate, from article scan) | Fase B | `Firm` | ephemeral | **Rename to `FirmCandidate`** (or `Prospect`); model as a new entity that can be *promoted* into a `Company`. Don't merge with `Company` directly — Fase B firms have 6 fields, Companies have 20+. Promotion creates a Company row and fills only the fields Fase B provides. |
| Deal in motion | Relations | `Opportunity` | Sheets | **Keep as `Opportunity`** — lead-attached, has `pipeline_stage`, status workflow. |
| Market signal from news | Terminal | `Opportunity` | Supabase | **Rename to `Discovery`** (or `MarketSignal`). It's not a deal — it's a thing that may *cause* one. A `Discovery` can be promoted into an `Opportunity` by attaching it to a `Lead`. |
| Research note about a company | Relations | `ResearchFinding` | Sheets | **Keep as `ResearchFinding`** — owns the structured research entity. |
| Article URL fetched, pre-classified | Terminal | `raw_articles` (table) | Supabase | **Keep as `RawArticle`** — needed for dedup before classification. New entity for Relations. |
| Article URL post-classification dedup | Terminal | `analyzed_articles` (table) | Supabase | **Keep as `AnalyzedArticle`** — dedup index. |
| RSS feed source | Terminal | `sources` (table) | Supabase | **Keep as `Source`** — registry of feeds (and could later include manual sources). |
| Ingestion job log | Terminal | `ingestion_runs` (table) | Supabase | **Keep as `IngestionRun`** — observability for the cron pipeline. |
| Outreach copy stored | Terminal | `generated_outputs` (table) | Supabase | **Merge into Relations' `Interaction`** with a new `direction='draft'` + `body_summary=content` + `channel='letter'\|'email'\|'linkedin'`. Don't keep a parallel table — Relations already tracks outreach as Interactions. |
| Touchpoint | Relations | `Interaction` | Sheets | **Keep as `Interaction`** — the merged Interaction table absorbs `generated_outputs`. |
| AI analysis cached per lead | Relations | `AIInsight` | Sheets | **Keep as `AIInsight`** — pattern matches what Terminal's analysis does at a discovery level. |
| Campaign | Relations | `Campaign` | Sheets | **Keep as `Campaign`** — sole owner. |
| Discovery prep | Relations | `DiscoveryPrepOutput` | Sheets `DiscoveryPrep` | **Rename to `MeetingPrep`** in the merged app — avoids overloading the word "discovery" once Terminal's `Discovery` entity arrives. |
| Gmail thread | Relations | `ParsedThread` | session only | **Keep as `Thread`** (drop "Parsed" prefix). Persist to a new `Threads` table (Sheets or Supabase — see below). |
| Gmail thread analysis | Relations | `ConversationAnalysis` | session only | **Keep as `ThreadAnalysis`**. Persist. |

---

## Field-level overlaps & conflicts to watch

### Lead-like / Person fields
- **Only Relations has them.** No conflicts.
- Worth noting: Relations' `Lead` has both contact fields (email, linkedin_url, title) AND scored relationship fields (business_fit_score, taste_score, relationship_score, opportunity_score, priority_score). That's ~30 fields total. Keep as-is.

### Company vs Firm fields

| Field | Relations `Company` | Fase B `Firm` | Notes |
|---|---|---|---|
| Identity | `company_id` (own) | none | Firms have no ID; would need one on promotion. |
| Name | `company_name` | `name` | Different field name; map on promotion. |
| Country | `location` (combined) | `country` | Fase B is more specific; Relations conflates city + country. |
| Website | `website` | `website` (nullable) | Same shape. |
| Project type | `project_type` | `project_type` | Same field name, similar values, but Relations' is enum-ish ("luxury residential", "hospitality"), Fase B's is free-text Spanish ("torre residencial"). Normalize on promotion. |
| Industry | `industry` | — | Relations-only. |
| Reference project | — | `reference_project` | Fase B-only — save into `Company.known_projects[]` on promotion. |
| Fit score | `business_fit_score` (0-?), `design_quality_score`, `visual_identity_score` | `score` (0-100) | Different shapes. Map Fase B's `score` into Relations' `business_fit_score` with provenance note in `notes`. |
| Architectural style, brand positioning, market position, project scale, ideal_client_fit, fit_reason | Relations-only | — | Relations is much richer; leave blank on promotion until Demian fills them. |

**Recommendation**: build a `promoteFirmToCompany(firm: FirmCandidate): Company` helper that explicitly maps the 6 Fase B fields and leaves the rest empty. Document that promotion is a one-way operation; subsequent updates happen in Relations, not Fase B.

### Opportunity vs Discovery fields

| Field | Relations `Opportunity` | Terminal `Opportunity` (→ `Discovery`) | Notes |
|---|---|---|---|
| Identity | `opportunity_id` | `id` (UUID) | Different formats; coexist fine since they're different entities. |
| Foreign keys | `company_id`, `lead_id`, `campaign_id` | `source` (text), no FKs | Relations is relational; Terminal is more of an event log. |
| What it is | A deal | A news signal | **Fundamentally different.** Resolved by renaming. |
| Summary | `summary`, `why_now`, `recommended_action` | `brief_summary`, `why_it_matters`, `suggested_action` | Identical *concepts*, different field names. When promoting Discovery → Opportunity, copy the text across. |
| Urgency | `urgency` (string), `confidence` (string) | `urgency_score` (number), `confidence_score` (number) | Relations uses categorical ("high", "medium"), Terminal uses 0-100. **Standardize on numeric scores** in the merged app; show categorical labels in UI. |
| Status | `status` (string) | `status` `'active'\|'saved'\|'archived'` | Different lifecycles. Keep separate. |
| Source | `source` | `source`, `source_url` (unique), `date_published` | Terminal has provenance; Relations does not. **Add `source_url` + `discovered_from_id` (FK to Discovery) to Relations' Opportunity** so we can track which discovery triggered each deal. |
| Sector / region / actors | — | `sector`, `region`, `country`, `city`, `main_actors[]`, `developer`, `architect`, `government_body`, `investment_size`, `timeline` | All Terminal-only. Keep on `Discovery`. |
| Scoring | `business_fit_score` etc (on lead, not opp) | 6 score_* columns | Different granularity. Keep separate. |

### Status enum collision risk
- Relations' `Opportunity.status`: free-form string (no enum found).
- Terminal's `Opportunity.status`: `'active' \| 'saved' \| 'archived'`.

If we keep them as separate entities (as recommended), no conflict. **If anyone is tempted to merge them later, this will be a foot-gun.**

### Date format consistency
- All three use `created_at` / `updated_at` ISO strings (no Date objects in interfaces).
- Terminal's `date_published` is `timestamptz` in Postgres but serialized to ISO string in TS.
- No format conflicts.

### ID format consistency
- Relations: `Date.now()`-based string IDs (per `docs/current-build-status.md`, prone to collision under load — but single-user app makes this low risk).
- Terminal: `uuid` from Postgres `gen_random_uuid()`.
- Fase B: no IDs.

**Recommendation**: on merge, **adopt UUIDs everywhere new** (cheap on Sheets, free on Supabase). Don't backfill existing Sheet rows.

---

## Storage decision (cross-cutting)

The three projects use three different stores:

| Store | Used by | Strengths | Weaknesses |
|---|---|---|---|
| **Google Sheets** | Relations | Demian can edit directly; zero-ops; mock-fallback pattern proven | No indexing, no joins, fragile under volume; "silently fail" issues already flagged in Relations' `current-build-status.md` |
| **Supabase (Postgres)** | Terminal | Real schema, dedup via UNIQUE constraints, indexes, filter queries | Adds an external dependency, ops burden, vendor lock-in (mild) |
| **Ephemeral (in-memory)** | Fase B | Simple; no migration cost | Lost on restart; can't track results over time |

There is no single right answer — and the brief is clear that this is an audit, not a decision. **Three plausible paths:**

1. **Sheets-first.** Keep Relations as-is. Port Terminal's tables to Sheets tabs. Port Fase B to write Discoveries/Firms to Sheets. *Pro:* preserves the "Demian can edit directly" muscle. *Con:* Terminal's dedup and filter queries are non-trivial in Sheets — would either lose them or rebuild them in-memory.

2. **Supabase-first.** Migrate Relations' Sheets backend to Supabase. *Pro:* Terminal already there; Fase B can move there easily; gain real querying. *Con:* loses the "edit in Sheets" workflow; non-trivial migration; biggest blast radius.

3. **Hybrid (most likely best).** Keep Sheets for Lead/Company/Opportunity/Interaction (entities Demian touches). Use Supabase for `Discovery`, `RawArticle`, `AnalyzedArticle`, `IngestionRun`, `Source`, `Thread`, `ThreadAnalysis` (entities that are machine-generated and high-volume). Promotion (Discovery → Opportunity, Firm → Company) is the bridge.

**Surface this for Demian's review before the merge.** Listed as an open question in `audit-summary.md`.

---

## Canonical type module (target shape)

For when the merge starts (not now), the consolidated `src/lib/types.ts` should look roughly like:

```
Person:        Lead
Org:           Company  ←  FirmCandidate (promoted)
Deal:          Opportunity  ←  Discovery (promoted by attaching a Lead)
Signal:        Discovery, RawArticle, AnalyzedArticle, Source, IngestionRun
Notes:         ResearchFinding
Touchpoint:    Interaction  (absorbs GeneratedOutput)
AI cache:      AIInsight, ThreadAnalysis
Threads:       Thread (replaces ParsedThread + ConversationState)
Workflow:      Campaign, MeetingPrep (renamed from DiscoveryPrepOutput)
```

Do not split into per-module type files. One source of truth keeps cross-entity invariants visible.
