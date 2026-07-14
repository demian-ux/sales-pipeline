-- ============================================================================
-- Oaki — Supabase schema
-- Run this file once against your Supabase project (SQL editor or `supabase db push`).
-- Safe to re-run: every CREATE uses IF NOT EXISTS, every ALTER uses IF NOT EXISTS.
-- ============================================================================
--
-- Tables provisioned:
--   sources             — registered RSS feeds for the ingestion pipeline
--   discoveries         — market signals extracted from articles (renamed from
--                         Terminal's `opportunities` to avoid colliding with
--                         Oaki Relations' own Opportunity entity, which lives
--                         in Google Sheets and represents lead-attached deals)
--   raw_articles        — pre-classification dedup cache
--   analyzed_articles   — post-classification dedup index
--   ingestion_runs      — observability log for each cron-triggered run
--   generated_outputs   — Claude-generated letters/emails/linkedin per discovery
--   threads             — Gmail thread cache (per Lead)
--   thread_analyses     — Claude analysis of a thread
--   app_secrets         — small key/value store; Gmail OAuth tokens live here
--
-- Posture: RLS is OFF for most tables (single-user app, basic-auth at the app
-- level, server-side service_role for all writes). RLS is ON for app_secrets
-- since it holds OAuth tokens.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ============================================================================
-- SOURCES — curated RSS feeds (ported as-is from Opportunity Terminal)
-- ============================================================================
create table if not exists sources (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  url         text not null unique,
  source_type text not null,                  -- 'rss' | 'api' | 'manual'
  region      text,
  sector      text,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  discovery_kind text not null default 'project_launch',  -- 'project_launch' | 'opportunity_signal'
  created_at  timestamptz not null default now()
);

create index if not exists idx_sources_active on sources(active, sort_order);
create index if not exists idx_sources_kind   on sources(discovery_kind, active, sort_order);

-- ============================================================================
-- DISCOVERIES — main table, one row per analyzed article
-- (Terminal's `opportunities` table, renamed; field names preserved except
--  opportunity_score → discovery_score to match the new entity name)
-- ============================================================================
create table if not exists discoveries (
  id                         uuid primary key default uuid_generate_v4(),
  created_at                 timestamptz not null default now(),

  -- Source metadata
  title                      text not null,
  date_published             timestamptz,
  source                     text not null,
  source_url                 text not null unique,        -- dedup key
  source_type                text,

  -- Location
  region                     text,
  city                       text,
  country                    text,

  -- Classification
  sector                     text,
  project_type               text,
  opportunity_type           text[],
  target_client_types        text[],

  -- Project details
  investment_size            text,
  timeline                   text,
  main_actors                text[],
  developer                  text,
  architect                  text,
  government_body            text,

  -- AI analysis
  brief_summary              text,
  why_it_matters             text,
  deep_analysis              text,
  suggested_action           text,
  tags                       text[],

  -- Signal tier + scores (all 1–100)
  signal_tier                text,                         -- 'strong_opportunity' | 'watchlist' | 'archive'
  discovery_score            integer,
  urgency_score              integer,
  confidence_score           integer,

  score_opportunity_clarity  integer,
  score_investment_size      integer,
  score_timing               integer,
  score_actors               integer,
  score_sector_growth        integer,
  score_region_strategic     integer,

  -- ICP-fit layer (2026-06-16) — second axis: can oaki sell into this deal?
  -- Extracted signals from the analyze prompt:
  tenure                     text,                          -- for_sale | rental | owner_occupied | mixed | unknown
  has_for_sale_residential   boolean,
  project_stage              text,                          -- pre_entitlement | entitled_no_design | design_in_hand | sales_launch | under_construction | built_stabilized | financing_only
  sector_fit                 text,                          -- high | medium | low
  viz_buyer_role             text,                          -- developer_marketing | developer_principal | architect | broker | none_identified
  viz_buyer_entity           text,                          -- named actor that would commission viz (≠ lender/fund)
  incumbent_viz              text,                          -- render/image-credit vendor, if any
  est_scale_vs_floor         text,                          -- above | near | below | unknown
  -- Computed in code (lib/discoveries/icp.ts) at insert time:
  icp_fit_score              integer,                       -- 0–100, NULL on legacy rows
  fit_tier                   text,                          -- prime | workable | complement | weak | disqualified
  fit_reason                 text,                          -- one-line why-fit / why-not
  partner_radar              boolean not null default false,
  -- Blended sort key. Falls back to discovery_score when icp_fit_score is NULL.
  combined_score             integer generated always as (
    case
      when icp_fit_score is null then discovery_score
      else round(0.6 * icp_fit_score + 0.4 * discovery_score)::int
    end
  ) stored,

  -- Event-type gate + project identity + CRM cross-reference (2026-06-25).
  signal_type                text,                          -- new_development | approval_filing | … | transaction | financing | … (lib/discoveries/signal-type.ts)
  project_name               text,                          -- canonical development name extracted by the analyzer, if stated
  project_key                text,                          -- normalize(project_name)|normalize(city); app-level dedup key
  already_engaged            boolean not null default false,-- developer/actor matched a Company already in the CRM roster
  engaged_company_id         text,                          -- matched Sheets company_id, when already_engaged
  engaged_company_name       text,                          -- matched Company name, for the card badge

  -- Opportunity Signals mode (2026-06-25) — second discovery mode. Upstream
  -- demand events mapped to the design/dev firm that would WIN the work (the
  -- prospect is never the source org). Launch rows keep discovery_kind default.
  discovery_kind             text not null default 'project_launch',  -- 'project_launch' | 'opportunity_signal'
  source_org                 text,                          -- the org that announced the event (NOT the target)
  signal_event               text,                          -- one-line description of the upstream event
  beneficiary_segment        text,                          -- the segment that captures the resulting work
  outreach_angle             text,                          -- the hook framed TO the target firm
  opportunity_score          integer,                       -- opp-mode score (NULL for launch rows)
  suggested_target_firms     jsonb,                         -- [{firm,why_fit,geography,in_crm,apollo_org_id,confidence}]

  -- Upstream-signal fields (2026-07-10). Sharpen the opportunity_signal lane to
  -- the strict pre-award test: FUTURE work a buyer will commission, briefs not
  -- yet awarded. The a/b/c heuristic is stored as fields (not just a score) so
  -- the weekly value-lane run ranks by future_work_test + geo + freshness and
  -- matches firms by work_categories ∩ geo. buyer_org == source_org (above).
  program_scope              text,                          -- what will be built/renovated, scale, timeframe
  briefs_status              text,                          -- unawarded | partially_awarded | awarded (awarded auto-rejects)
  work_categories            text[],                        -- developer | architecture | interior_design | … (firm-pool join key)
  geo                        text,                          -- nyc | south_florida | europe | middle_east | other (firm-pool join key)
  future_work_test           boolean,                       -- a && b && (briefs not awarded)
  future_work_reason         text,                          -- one-line why the test passed/failed
  buyer_committed            boolean,                       -- test (a): named buyer committing to future work
  programmatic_scope         boolean,                       -- test (b): plural/programmatic OR single pre-design-selection

  -- Capital events + entitlement grading (2026-07-06). capital_event KEEP rows
  -- store the forward-intent quote; deployment_horizon maps to stage points in
  -- icp.ts. Graded entitlement bands store which body granted what.
  intent_evidence            text,
  intent_source_url          text,
  deployment_horizon         text,                          -- active_now | 1_2_years | 3_plus_years | unstated
  entitlement_evidence       text,

  -- Verified excavation (2026-07-06). verified_principal is the resolved
  -- developer/designer-of-record (the card's headline prospect), written only
  -- with independent evidence — suggested_target_firms are never promoted here
  -- without their own source.
  verified_principal         jsonb,                         -- {firm,role,evidence_url,evidence_quote,verified_at,verified_by}
  excavation_status          text,                          -- unattempted | attempted_unresolved | resolved

  -- Discovery work-tracking (2026-07-06). Orthogonal to `status`: records
  -- whether a run has acted on the row so the next run doesn't re-chew it. The
  -- default active board hides held / rejected / already_engaged.
  -- 2026-07-14: `unworked` now means NEVER REVIEWED; a row that was reviewed and
  -- deliberately kept is `benched` (still on the board, still offered to runs).
  work_status                text not null default 'unworked', -- unworked | benched | drafted | held | rejected | already_engaged
  work_reason                text,
  worked_at                  timestamptz,                    -- when a run CONSUMED the row (drafted/held/rejected/already_engaged)
  reviewed_at                timestamptz,                    -- when ANY verdict was written, benched included
  re_arm_at                  date,                           -- a held row returns to the active board on this date
  duplicate_urls             text[],                         -- later articles about a project we already hold (ingest dedup)

  status                     text not null default 'active',   -- 'active' | 'saved' | 'archived'
  raw_content                text,

  -- Provenance for promotion back to Relations' Opportunity entity
  promoted_to_opportunity_id text                              -- nullable; set when promoted
);

create index if not exists idx_discoveries_sector  on discoveries(sector);
create index if not exists idx_discoveries_region  on discoveries(region);
create index if not exists idx_discoveries_country on discoveries(country);
create index if not exists idx_discoveries_score   on discoveries(discovery_score desc);
create index if not exists idx_discoveries_status  on discoveries(status);
create index if not exists idx_discoveries_date    on discoveries(date_published desc);
create index if not exists idx_discoveries_created on discoveries(created_at desc);
create index if not exists idx_discoveries_tier    on discoveries(signal_tier);
create index if not exists idx_discoveries_combined on discoveries(combined_score desc);
create index if not exists idx_discoveries_fit_tier on discoveries(fit_tier);
create index if not exists idx_discoveries_signal_type on discoveries(signal_type);
create index if not exists idx_discoveries_project_key on discoveries(project_key);
create index if not exists idx_discoveries_engaged    on discoveries(already_engaged);
create index if not exists idx_discoveries_kind       on discoveries(discovery_kind);
create index if not exists idx_discoveries_work_status on discoveries(work_status);
create index if not exists idx_discoveries_re_arm_at   on discoveries(re_arm_at);
-- Upstream-signal join keys + ranking axis (2026-07-10), opp-scoped.
create index if not exists idx_discoveries_geo           on discoveries(geo) where discovery_kind = 'opportunity_signal';
create index if not exists idx_discoveries_future_work   on discoveries(future_work_test) where discovery_kind = 'opportunity_signal';
create index if not exists idx_discoveries_briefs_status on discoveries(briefs_status) where discovery_kind = 'opportunity_signal';

-- ============================================================================
-- INGESTION_RUNS — one row per ingest cycle
-- ============================================================================
create table if not exists ingestion_runs (
  id                          uuid primary key default uuid_generate_v4(),
  started_at                  timestamptz not null default now(),
  finished_at                 timestamptz,
  sources_count               integer default 0,
  articles_found              integer default 0,
  raw_articles_new            integer default 0,
  raw_articles_duplicate      integer default 0,
  articles_skipped_old        integer default 0,
  articles_skipped_irrelevant integer default 0,
  articles_analyzed           integer default 0,
  articles_new                integer default 0,
  errors                      text[],
  failed_sources              text[],
  current_step                text,
  progress_percent            integer not null default 0,
  status                      text not null default 'running', -- 'running' | 'done' | 'failed'
  -- Supply-health instrumentation (2026-07-06). `discovery_kind` records which
  -- mode the run was; `drafts_staged` is patched in later by the working
  -- session (drafts produced from this run's material). articles_new already
  -- carries net-new discoveries per run.
  discovery_kind              text,                            -- 'project_launch' | 'opportunity_signal'
  drafts_staged               integer not null default 0
);

create index if not exists idx_ingestion_runs_started on ingestion_runs(started_at desc);

-- ============================================================================
-- RAW_ARTICLES — pre-classification dedup cache
-- ============================================================================
create table if not exists raw_articles (
  id                uuid primary key default uuid_generate_v4(),
  url               text not null unique,
  normalized_url    text not null unique,
  title             text not null,
  source            text not null,
  source_feed_url   text,
  published_at      timestamptz,
  raw_content       text,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  research_run_id   uuid references ingestion_runs(id) on delete set null,
  status            text not null default 'new',
  skip_reason       text,
  analysis_attempts integer not null default 0,
  analyzed_at       timestamptz
);

create index if not exists idx_raw_articles_normalized_url on raw_articles(normalized_url);
create index if not exists idx_raw_articles_status         on raw_articles(status);
create index if not exists idx_raw_articles_published      on raw_articles(published_at desc);
create index if not exists idx_raw_articles_source         on raw_articles(source);

-- ============================================================================
-- ANALYZED_ARTICLES — post-analysis URL dedup (lighter than RAW_ARTICLES)
-- ============================================================================
create table if not exists analyzed_articles (
  id           uuid primary key default uuid_generate_v4(),
  url          text not null unique,
  title        text,
  source       text,
  published_at timestamptz,
  signal_tier  text not null default 'archive',
  created_at   timestamptz not null default now()
);

create index if not exists idx_analyzed_articles_url  on analyzed_articles(url);
create index if not exists idx_analyzed_articles_tier on analyzed_articles(signal_tier);

-- ============================================================================
-- GENERATED_OUTPUTS — Claude-generated letters/emails/linkedin per Discovery
-- (Phase 2 keeps this as its own table; a later phase may merge into the
--  Sheets `Interactions` table once Lead-attached drafts are unified.)
-- ============================================================================
create table if not exists generated_outputs (
  id                uuid primary key default uuid_generate_v4(),
  discovery_id      uuid not null references discoveries(id) on delete cascade,
  created_at        timestamptz not null default now(),
  output_type       text not null,                          -- 'letter' | 'email' | 'linkedin'
  recipient_name    text,
  recipient_company text,
  client_type       text,
  content           text not null
);

create index if not exists idx_generated_outputs_discovery on generated_outputs(discovery_id);

-- ============================================================================
-- THREADS — Gmail thread cache (per Lead). Replaces session-memory storage.
-- IDs reference Google Sheets rows by string ID (no FK).
-- ============================================================================
create table if not exists threads (
  thread_id          text primary key,                      -- Gmail thread ID
  lead_id            text not null,                         -- Sheets Leads.lead_id
  company_id         text not null,                         -- Sheets Companies.company_id
  subject            text,
  snippet            text,
  message_count      integer default 0,
  last_message_at    timestamptz,
  last_message_from  text,                                  -- 'us' | 'them'
  participants       text[],
  messages           jsonb,                                 -- full ParsedMessage[] payload
  inferred_state     text,                                  -- waiting_for_us | waiting_for_them | active | cooling | dormant
  synced_at          timestamptz not null default now()
);

create index if not exists idx_threads_lead   on threads(lead_id);
create index if not exists idx_threads_synced on threads(synced_at desc);

-- ============================================================================
-- THREAD_ANALYSES — Claude analysis output per thread
-- ============================================================================
create table if not exists thread_analyses (
  analysis_id          text primary key,
  thread_id            text not null references threads(thread_id) on delete cascade,
  lead_id              text not null,
  state                text,
  intent               text,
  tone                 text,
  momentum             text,
  urgency_signals      text[],
  objections           text[],
  relationship_signals text[],
  summary              text,
  recommended_response text,
  response_deadline    text,
  analyzed_at          timestamptz not null default now()
);

create index if not exists idx_thread_analyses_thread on thread_analyses(thread_id);
create index if not exists idx_thread_analyses_lead   on thread_analyses(lead_id);

-- ============================================================================
-- APP_SECRETS — small key/value store for things that can't live on Vercel's
-- ephemeral filesystem. Notably: Gmail OAuth tokens.
-- RLS enabled — only service_role (server) can read/write.
-- ============================================================================
create table if not exists app_secrets (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_secrets enable row level security;
-- No policies are defined — anon/auth roles get zero access. Only service_role bypasses RLS.

-- ============================================================================
-- TASKS — manual tasks for the Dashboard's Today card.
-- Auto-derived signals (overdue follow-ups, stalled proposals, waiting Gmail
-- threads) are computed on read and not stored here. Snoozed signals live in
-- the `snoozed_signals` blob under app_secrets, not in this table.
-- ============================================================================
create table if not exists tasks (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  body          text,
  due_date      date,
  link_type     text,          -- 'lead' | 'opportunity' | 'discovery' | 'candidate' | 'conversation' | null
  link_id       text,
  status        text not null default 'open',   -- 'open' | 'done' | 'snoozed'
  snoozed_until date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists idx_tasks_status   on tasks(status);
create index if not exists idx_tasks_due_date on tasks(due_date);

-- ============================================================================
-- FIRM_CANDIDATES — persisted prospecting results.
-- Previously ephemeral (request-scoped). Each prospecting run upserts its
-- firms here; status transitions: 'new' → 'promoted' | 'dismissed'.
-- The unique index on (name, source_article_url) handles re-runs from the
-- same article without duplicating candidates.
-- ============================================================================
create table if not exists firm_candidates (
  id                          uuid primary key default uuid_generate_v4(),
  candidate_id                text not null unique,           -- preserves the original synthesized string ID
  name                        text not null,
  country                     text,
  project_type                text,
  reference_project           text,
  website                     text,
  score                       integer,                         -- 0-100
  source_article_url          text not null,
  source_discovery_id         uuid references discoveries(id) on delete set null,
  status                      text not null default 'new',    -- 'new' | 'dismissed' | 'promoted'
  promoted_to_company_id      text,                            -- Sheets company_id after promotion
  promoted_to_opportunity_id  text,
  discovered_at               timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_firm_candidates_status on firm_candidates(status);
create index if not exists idx_firm_candidates_score  on firm_candidates(score desc);
create unique index if not exists idx_firm_candidates_name_article
  on firm_candidates(name, source_article_url);

-- ============================================================================
-- EMAIL_DRAFTS / LINKEDIN_DRAFTS — Claude-generated outreach copy per Lead.
-- One row per (lead_id) per type; rerunning the Draft action upserts the
-- existing row. Lead detail page reads these and falls back to legacy
-- AIInsight.suggested_email / suggested_linkedin_dm when these are empty.
-- ============================================================================
create table if not exists email_drafts (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     text not null unique,
  company_id  text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_email_drafts_lead on email_drafts(lead_id);

create table if not exists linkedin_drafts (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     text not null unique,
  company_id  text not null,
  content     text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_linkedin_drafts_lead on linkedin_drafts(lead_id);

-- ============================================================================
-- SEED: trusted RSS sources (ported from Opportunity Terminal)
-- Re-running this updates `active` and `sort_order` for existing rows.
-- ============================================================================
insert into sources (name, url, source_type, region, sector, active, sort_order) values
  ('GNews Real Estate NY', 'https://news.google.com/rss/search?q=real+estate+new+york+development&hl=en&gl=US&ceid=US:en',       'rss', 'new_york', 'general',           true,  10),
  ('GNews Real Estate MIA','https://news.google.com/rss/search?q=real+estate+miami+development&hl=en&gl=US&ceid=US:en',          'rss', 'miami',    'general',           true,  20),
  -- Geo-qualified (June 2026): the unqualified queries pulled worldwide articles — 31% of discoveries were out of target geography.
  -- Airport feed targets LOUNGES / premium-terminal interiors (oaki's aviation work), not terminal/runway infrastructure.
  ('GNews Airport Lounges', 'https://news.google.com/rss/search?q=(airport+OR+terminal)+(lounge+OR+%22business+class%22+OR+%22first+class%22+OR+VIP)+design+(%22New+York%22+OR+JFK+OR+Miami+OR+Paris+OR+London+OR+Europe)&hl=en&gl=US&ceid=US:en','rss','global',  'aviation_hospitality', true,  30),
  ('GNews Hospitality EU', 'https://news.google.com/rss/search?q=hotel+hospitality+development+europe&hl=en&gl=US&ceid=US:en',   'rss', 'europe',   'hospitality',       true,  40),
  ('GNews Luxury Resi',    'https://news.google.com/rss/search?q=luxury+residential+development+architecture+(%22New+York%22+OR+Manhattan+OR+Brooklyn+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en','rss','global','luxury_residential', true,  50),
  ('GNews France RE',      'https://news.google.com/rss/search?q=immobilier+developpement+france&hl=fr&gl=FR&ceid=FR:fr',        'rss', 'france',   'general',           true,  60),
  ('Urbanize Miami',       'https://miami.urbanize.city/feed',                           'rss', 'miami',    'general',      true,  70),
  ('Urbanize NYC',         'https://ny.urbanize.city/feed',                              'rss', 'new_york', 'general',      true,  80),
  ('NY YIMBY',             'https://newyorkyimby.com/feed',                              'rss', 'new_york', 'general',      true,  85),
  ('6sqft',                'https://www.6sqft.com/feed/',                                'rss', 'new_york', 'general',      true,  86),
  ('Curbed NY',            'https://ny.curbed.com/rss/index.xml',                        'rss', 'new_york', 'general',      true,  90),
  ('Commercial Observer',  'https://commercialobserver.com/feed/',                       'rss', 'new_york', 'general',      true, 100),
  ('Dezeen',               'https://www.dezeen.com/feed/',                               'rss', 'global',   'architecture', true, 110),
  ('ArchDaily',            'https://www.archdaily.com/feed',                             'rss', 'global',   'architecture', true, 120),
  ('World Architecture',   'https://www.world-architects.com/en/rss',                    'rss', 'global',   'architecture', true, 130),
  ('The Architect''s Newspaper', 'https://www.archpaper.com/feed/',                      'rss', 'global',   'cultural',     true, 125),
  -- Known-inactive: bot-blocked / paywalled / feed discontinued
  ('The Real Deal',        'https://therealdeal.com/feed/',                              'rss', 'new_york', 'general',      false, 200),
  ('Bisnow',               'https://www.bisnow.com/feed',                                'rss', 'global',   'general',      false, 200),
  ('CoStar News',          'https://www.costar.com/rss/news',                            'rss', 'global',   'general',      false, 200),
  ('Reuters Business',     'https://feeds.reuters.com/reuters/businessNews',             'rss', 'global',   'general',      false, 200),
  ('Le Moniteur',          'https://www.lemoniteur.fr/rss/actualites',                   'rss', 'france',   'general',      false, 200),
  ('Building Design',      'https://www.bdonline.co.uk/rss',                             'rss', 'europe',   'architecture', false, 200)
on conflict (url) do update set active = excluded.active, sort_order = excluded.sort_order;

-- ── Capital-event + hospitality feeds (2026-07-06, Workstream A) ─────────────
-- Capital events fire earlier in the cycle than a launch — a fund raised to
-- BUILD, a site/hotel acquired to REDEVELOP, a design-led operator doubling its
-- pipeline. The analyzer classifies these `capital_event` (KEEP) only when it
-- can quote forward development intent; loans/refis/stabilized trades stay DROP.
-- Direct trade-press RSS (The Real Deal, Bisnow, PERE, Commercial Observer) is
-- bot-blocked/paywalled (see the inactive rows above), so these are shaped
-- Google-News queries, matching the rest of the source list.
insert into sources (name, url, source_type, region, sector, active, sort_order) values
  ('GNews Capital · Dev Funds',      'https://news.google.com/rss/search?q=(%22closes+fund%22+OR+%22capital+raise%22+OR+raises+OR+%22launches+fund%22+OR+%22new+fund%22)+(condominium+OR+residential+OR+%22branded+residences%22+OR+hotel+OR+resort+OR+development)+(develop+OR+%22to+build%22+OR+pipeline)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential',    true, 140),
  ('GNews Capital · Redev Acquisitions','https://news.google.com/rss/search?q=(acquires+OR+acquisition+OR+buys)+(%22development+site%22+OR+hotel+OR+%22for+redevelopment%22+OR+%22to+redevelop%22+OR+%22to+develop%22+OR+repositioning)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use',             true, 150),
  ('GNews Hospitality Rollouts',     'https://news.google.com/rss/search?q=(hotel+OR+resort+OR+%22branded+residences%22)+(%22to+open%22+OR+%22new+hotel%22+OR+%22design+team%22+OR+%22breaks+ground%22+OR+unveils+OR+debuts)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality',           true, 160)
on conflict (url) do update set
  name = excluded.name, region = excluded.region, sector = excluded.sector,
  active = excluded.active, sort_order = excluded.sort_order;

-- ── Upstream-signal sources (discovery_kind='opportunity_signal') ────────────
-- Retuned 2026-07-10 for the strict PRE-AWARD test: demand-creating events
-- where briefs are not yet awarded — renovation/expansion PROGRAMS, RFPs &
-- competitions, entitlement/rezoning that unlocks a district, capital committed
-- to a development pipeline, and government licenses that trigger private
-- construction. The launch-flavored `Opp ·` feeds ("to open", "debuts",
-- "breaks ground") are retired first — they surfaced rollouts/completions.
-- See migrations/2026-07-10_upstream_signals.sql.
update sources
  set active = false
  where discovery_kind = 'opportunity_signal' and name like 'Opp · %';

insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('Upstream · Aviation Programs',   'https://news.google.com/rss/search?q=(airport+OR+airline+OR+terminal)+(lounge+OR+%22terminal+renovation%22+OR+%22terminal+redevelopment%22+OR+%22terminal+expansion%22+OR+modernization+OR+overhaul)+(program+OR+RFP+OR+%22request+for+proposals%22+OR+%22master+plan%22+OR+%22capital+program%22+OR+plan)+(JFK+OR+LaGuardia+OR+Newark+OR+%22New+York%22+OR+Miami+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'aviation_hospitality', true, 300, 'opportunity_signal'),
  ('Upstream · Hospitality Pipelines','https://news.google.com/rss/search?q=(hotel+OR+resort+OR+hospitality+OR+%22branded+residences%22)+(%22to+enter%22+OR+enters+OR+%22pipeline+of%22+OR+%22expansion+plan%22+OR+%22to+develop%22+OR+%22signs%22+OR+%22management+agreement%22+OR+%22brand+to+enter%22)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 310, 'opportunity_signal'),
  ('Upstream · Cultural Capital Projects','https://news.google.com/rss/search?q=(museum+OR+university+OR+library+OR+%22performing+arts%22+OR+civic+OR+cultural)+(%22capital+project%22+OR+expansion+OR+%22new+building%22+OR+%22new+wing%22+OR+%22to+build%22+OR+%22master+plan%22+OR+competition+OR+RFP)+(Europe+OR+London+OR+Paris+OR+%22New+York%22+OR+Miami)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'cultural', true, 320, 'opportunity_signal'),
  ('Upstream · Competitions & RFPs',  'https://news.google.com/rss/search?q=(%22design+competition%22+OR+%22architecture+competition%22+OR+%22open+call%22+OR+%22request+for+proposals%22+OR+RFP+OR+%22master+plan%22+OR+masterplan+OR+%22invited+competition%22)+(architecture+OR+design+OR+redevelopment+OR+waterfront+OR+district)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'other', true, 330, 'opportunity_signal'),
  ('Upstream · Entitlements & Rezoning','https://news.google.com/rss/search?q=(%22rezoning+approved%22+OR+%22zoning+approved%22+OR+%22master+plan+approved%22+OR+entitlement+OR+%22special+permit%22+OR+%22redevelopment+plan%22+OR+%22approves+plan%22+OR+%22land+use%22)+(development+OR+district+OR+waterfront+OR+mixed-use)+(%22New+York%22+OR+Brooklyn+OR+Queens+OR+Miami+OR+%22Miami+Beach%22+OR+%22South+Florida%22)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use', true, 340, 'opportunity_signal'),
  ('Upstream · Capital for Pipeline', 'https://news.google.com/rss/search?q=(%22capital+commitment%22+OR+%22closes+fund%22+OR+raises+OR+%22development+pipeline%22+OR+%22joint+venture%22+OR+%22to+develop%22)+(develop+OR+%22to+build%22+OR+pipeline+OR+residential+OR+hotel+OR+mixed-use)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential', true, 350, 'opportunity_signal'),
  ('Upstream · Licenses & Approvals', 'https://news.google.com/rss/search?q=(%22licenses+awarded%22+OR+%22license+awarded%22+OR+%22gaming+license%22+OR+%22casino+license%22+OR+%22awarded+the+license%22+OR+%22wins+bid%22+OR+%22selected+to+develop%22+OR+%22development+rights%22)+(casino+OR+resort+OR+development+OR+district+OR+waterfront)+(%22New+York%22+OR+downstate+OR+Miami+OR+%22South+Florida%22+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use', true, 360, 'opportunity_signal'),
  ('Upstream · Skift',                'https://skift.com/feed/', 'rss', 'global', 'aviation_hospitality', true, 370, 'opportunity_signal')
on conflict (url) do update set
  name = excluded.name, region = excluded.region, sector = excluded.sector,
  active = excluded.active, sort_order = excluded.sort_order,
  discovery_kind = excluded.discovery_kind;

-- ============================================================================
-- WORKFLOW_ACTIONS — durable sent/copied/dismissed tracking (P0, 2026-06-09).
-- Replaces sessionCache.workflowActions. IDs reference Sheets rows (no FK).
-- ============================================================================
create table if not exists workflow_actions (
  action_id      text primary key,
  type           text not null,        -- draft_copied | draft_sent | draft_dismissed | gmail_draft_created | recommendation_accepted | recommendation_dismissed
  lead_id        text,
  insight_id     text,
  opportunity_id text,
  channel        text,                 -- 'email' | 'linkedin'
  note           text,
  recorded_at    timestamptz not null default now()
);

create index if not exists idx_workflow_actions_recorded on workflow_actions(recorded_at desc);
create index if not exists idx_workflow_actions_lead     on workflow_actions(lead_id);

-- ============================================================================
-- MEETING_PREPS — durable per-lead meeting prep (P0, 2026-06-09).
-- Replaces sessionCache.meetingPreps.
-- ============================================================================
create table if not exists meeting_preps (
  lead_id    text primary key,
  prep       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- LETTER_DRAFTS — physical-letter drafts per lead (P2, 2026-06-10).
-- Mirrors email_drafts / linkedin_drafts.
-- ============================================================================
create table if not exists letter_drafts (
  id         uuid primary key default uuid_generate_v4(),
  lead_id    text not null unique,
  company_id text,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_letter_drafts_lead on letter_drafts(lead_id);

-- ============================================================================
-- LEAD_DRAFTS — N drafts per lead with a status lifecycle, written by
-- external agents via POST /api/leads/{id}/drafts (2026-06-10).
-- status: draft → approved → sent. Marking `sent` auto-logs an Interaction.
-- ============================================================================
create table if not exists lead_drafts (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     text not null,
  company_id  text,
  channel     text not null check (channel in ('letter', 'email', 'linkedin_dm')),
  subject     text,
  body        text not null,
  status      text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  created_by  text,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_lead_drafts_lead on lead_drafts(lead_id);

alter table lead_drafts enable row level security;

-- ============================================================================
-- FIRM_POOL / FIRM_POOL_CONTACTS / VALUE_TOUCHES — value-lane state (2026-07-10).
-- The population + outreach ledger for oaki-prospecting v6 Lane 1b. Distinct
-- from Sheets companies/leads but linked (linked_company_id). `categories` uses
-- the same WorkCategory tokens as a discovery's work_categories so the value-
-- outreach match (category ∩ geo) is exact. The pilot seed lives in
-- migrations/2026-07-10_firm_pool.sql. See project_oaki_opportunity_signals.
-- ============================================================================
create table if not exists firm_pool (
  firm_id            uuid primary key default uuid_generate_v4(),
  name               text not null unique,
  domain             text,
  apollo_org_id      text,
  website            text,
  categories         text[] not null default '{}',
  geo                text,                              -- nyc | south_florida | europe | middle_east | other
  icp_notes          text,
  pool_status        text not null default 'active',    -- active | parked | candidate | excluded | converted
  exclusion_reason   text,
  linked_company_id  text,
  signal_ref         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_firm_pool_status     on firm_pool(pool_status);
create index if not exists idx_firm_pool_geo        on firm_pool(geo);
create index if not exists idx_firm_pool_categories on firm_pool using gin(categories);

create table if not exists firm_pool_contacts (
  contact_id      uuid primary key default uuid_generate_v4(),
  firm_id         uuid not null references firm_pool(firm_id) on delete cascade,
  name            text,
  title           text,
  email           text,
  email_status    text,                                 -- verified | guessed | bounced | unknown
  linkedin_url    text,
  seat_checked_at timestamptz,
  is_primary      boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists idx_firm_pool_contacts_firm on firm_pool_contacts(firm_id);

create table if not exists value_touches (
  touch_id        uuid primary key default uuid_generate_v4(),
  firm_id         uuid not null references firm_pool(firm_id) on delete cascade,
  contact_id      uuid references firm_pool_contacts(contact_id) on delete set null,
  signal_ref      text not null,
  batch_date      date,
  sent_at         timestamptz,
  gmail_thread_id text,
  bump_due        date,
  reply_status    text not null default 'none',         -- none | replied | call | brief
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- Same-signal dedup: one touch per (firm, signal_ref).
create unique index if not exists idx_value_touches_firm_signal on value_touches(firm_id, signal_ref);
create index if not exists idx_value_touches_firm on value_touches(firm_id);
create index if not exists idx_value_touches_sent on value_touches(sent_at desc nulls last);
