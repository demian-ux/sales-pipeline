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
  created_at  timestamptz not null default now()
);

create index if not exists idx_sources_active on sources(active, sort_order);

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
  status                      text not null default 'running' -- 'running' | 'done' | 'failed'
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
  ('GNews Airport Design', 'https://news.google.com/rss/search?q=airport+modernization+design+architecture+(%22New+York%22+OR+%22JFK%22+OR+%22LaGuardia%22+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en','rss','global',  'airports',          true,  30),
  ('GNews Hospitality EU', 'https://news.google.com/rss/search?q=hotel+hospitality+development+europe&hl=en&gl=US&ceid=US:en',   'rss', 'europe',   'hospitality',       true,  40),
  ('GNews Luxury Resi',    'https://news.google.com/rss/search?q=luxury+residential+development+architecture+(%22New+York%22+OR+Manhattan+OR+Brooklyn+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en','rss','global','luxury_residential', true,  50),
  ('GNews France RE',      'https://news.google.com/rss/search?q=immobilier+developpement+france&hl=fr&gl=FR&ceid=FR:fr',        'rss', 'france',   'general',           true,  60),
  ('Urbanize Miami',       'https://miami.urbanize.city/feed',                           'rss', 'miami',    'general',      true,  70),
  ('Urbanize NYC',         'https://ny.urbanize.city/feed',                              'rss', 'new_york', 'general',      true,  80),
  ('Curbed NY',            'https://ny.curbed.com/rss/index.xml',                        'rss', 'new_york', 'general',      true,  90),
  ('Commercial Observer',  'https://commercialobserver.com/feed/',                       'rss', 'new_york', 'general',      true, 100),
  ('Dezeen',               'https://www.dezeen.com/feed/',                               'rss', 'global',   'architecture', true, 110),
  ('ArchDaily',            'https://www.archdaily.com/feed',                             'rss', 'global',   'architecture', true, 120),
  ('World Architecture',   'https://www.world-architects.com/en/rss',                    'rss', 'global',   'architecture', true, 130),
  -- Known-inactive: bot-blocked / paywalled / feed discontinued
  ('The Real Deal',        'https://therealdeal.com/feed/',                              'rss', 'new_york', 'general',      false, 200),
  ('Bisnow',               'https://www.bisnow.com/feed',                                'rss', 'global',   'general',      false, 200),
  ('CoStar News',          'https://www.costar.com/rss/news',                            'rss', 'global',   'general',      false, 200),
  ('Reuters Business',     'https://feeds.reuters.com/reuters/businessNews',             'rss', 'global',   'general',      false, 200),
  ('Le Moniteur',          'https://www.lemoniteur.fr/rss/actualites',                   'rss', 'france',   'general',      false, 200),
  ('Building Design',      'https://www.bdonline.co.uk/rss',                             'rss', 'europe',   'architecture', false, 200)
on conflict (url) do update set active = excluded.active, sort_order = excluded.sort_order;

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
