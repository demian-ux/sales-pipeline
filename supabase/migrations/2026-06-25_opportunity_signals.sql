-- ============================================================================
-- Opportunity Signals — second discovery mode — 2026-06-25
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Apply this BEFORE deploying the code: the ingest insert and the list query
-- reference the new columns. Safe to re-run (every add/index is `if not exists`,
-- every source upsert is keyed on the unique url).
--
-- Adds a SECOND discovery mode beside the existing "Project Launches" pipeline.
-- Opportunity Signals hunt one step upstream — market events that CREATE design
-- work — and the outreach target is always the designer/developer who would win
-- that work, never the source org. See project_oaki_opportunity_signals.
--
-- Discoveries gains:
--   • discovery_kind        — 'project_launch' (existing rows) | 'opportunity_signal'
--   • source_org            — the org that announced the event (NOT the target)
--   • signal_event          — one-line description of the upstream event
--   • beneficiary_segment   — the segment that captures the resulting work
--   • outreach_angle        — the hook framed TO the target firm
--   • opportunity_score     — opp-mode score (NULL for launch rows)
--   • suggested_target_firms — JSONB [{firm,why_fit,geography,in_crm,apollo_org_id}]
-- Sources gains:
--   • discovery_kind        — which mode a feed belongs to (default project_launch)
--
-- Existing rows default discovery_kind='project_launch', so the launch board is
-- unchanged. opportunity_score mirrors into discovery_score at insert time, so
-- the DB-generated combined_score (= discovery_score when icp_fit_score is NULL)
-- and every existing sort/index/filter just work for opp rows too.
-- ============================================================================

alter table discoveries add column if not exists discovery_kind        text not null default 'project_launch';
alter table discoveries add column if not exists source_org            text;
alter table discoveries add column if not exists signal_event          text;
alter table discoveries add column if not exists beneficiary_segment   text;
alter table discoveries add column if not exists outreach_angle        text;
alter table discoveries add column if not exists opportunity_score     integer;
alter table discoveries add column if not exists suggested_target_firms jsonb;

create index if not exists idx_discoveries_kind on discoveries(discovery_kind);

alter table sources add column if not exists discovery_kind text not null default 'project_launch';
create index if not exists idx_sources_kind on sources(discovery_kind, active, sort_order);

-- ── Seed opportunity-signal sources ─────────────────────────────────────────
-- All tagged discovery_kind='opportunity_signal'. Google News RSS queries shaped
-- to surface DEMAND-CREATING events (a program/RFP/rollout that will hire a
-- design firm), geo-biased to oaki's target markets, plus Skift (aviation +
-- hospitality demand news). The pipeline tolerates a failed source, so a
-- publisher feed that bot-blocks just drops out of the run rather than failing it.
insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('Opp · Aviation Programs',     'https://news.google.com/rss/search?q=(airport+OR+airline+OR+terminal)+(lounge+OR+%22terminal+renovation%22+OR+%22terminal+redevelopment%22+OR+%22terminal+expansion%22+OR+overhaul+OR+modernization)+(program+OR+plan+OR+RFP+OR+%22design+team%22)+(%22New+York%22+OR+JFK+OR+Newark+OR+Miami+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'aviation_hospitality', true, 300, 'opportunity_signal'),
  ('Opp · Hospitality Rollouts',  'https://news.google.com/rss/search?q=(hotel+OR+resort+OR+hospitality)+(%22brand+enters%22+OR+%22to+open%22+OR+flag+OR+rollout+OR+%22new+property%22+OR+pipeline+OR+%22signs+deal%22)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 310, 'opportunity_signal'),
  ('Opp · Cultural / Institutional', 'https://news.google.com/rss/search?q=(museum+OR+university+OR+library+OR+%22performing+arts%22+OR+civic+OR+cultural)+(expansion+OR+%22new+building%22+OR+renovation+OR+%22capital+project%22+OR+%22to+build%22+OR+%22new+wing%22)+(Europe+OR+London+OR+Paris+OR+%22New+York%22+OR+Miami)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'cultural', true, 320, 'opportunity_signal'),
  ('Opp · Competitions & RFPs',    'https://news.google.com/rss/search?q=(%22design+competition%22+OR+%22architecture+competition%22+OR+%22open+call%22+OR+%22request+for+proposals%22+OR+RFP+OR+masterplan)+(architecture+OR+design+OR+redevelopment+OR+waterfront)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'other', true, 330, 'opportunity_signal'),
  ('Opp · Experiential / Flagship', 'https://news.google.com/rss/search?q=(flagship+OR+%22experience+center%22+OR+%22brand+experience%22+OR+immersive+OR+%22themed+entertainment%22+OR+%22entertainment+district%22)+(design+OR+architecture+OR+%22to+open%22)+(%22New+York%22+OR+Miami+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'retail', true, 340, 'opportunity_signal'),
  ('Opp · Branded Residences',     'https://news.google.com/rss/search?q=%22branded+residences%22+(announce+OR+plans+OR+launch+OR+partnership+OR+%22to+develop%22)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential', true, 350, 'opportunity_signal'),
  ('Opp · Skift',                  'https://skift.com/feed/', 'rss', 'global', 'aviation_hospitality', true, 360, 'opportunity_signal')
on conflict (url) do update set
  name = excluded.name, region = excluded.region, sector = excluded.sector,
  active = excluded.active, sort_order = excluded.sort_order,
  discovery_kind = excluded.discovery_kind;
