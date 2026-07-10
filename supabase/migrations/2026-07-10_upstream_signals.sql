-- ============================================================================
-- Upstream Signals — retune the opportunity_signal lane — 2026-07-10
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Apply this BEFORE deploying the code: the opp-signal insert and the list
-- query reference the new columns. Safe to re-run (every add/index is
-- `if not exists`, every source upsert is keyed on the unique url).
--
-- Does NOT add a new discovery_kind. It sharpens the EXISTING
-- discovery_kind='opportunity_signal' lane into the strict "upstream signal"
-- test from the July 10 sourcing handoff: FUTURE work a buyer will commission
-- where the design/development briefs are NOT YET AWARDED. The a/b/c heuristic
-- is stored as fields (not just folded into a score) so the weekly value-lane
-- run can rank by future_work_test + geo + freshness and match firms by
-- work_categories ∩ geo. See project_oaki_opportunity_signals + the three
-- July handoffs (upstream-signal-sourcing / firmographic-value-lane / firm-pool).
--
-- Discoveries gains (all nullable → existing rows type-check, new runs fill them):
--   • program_scope      — free text: what will be built/renovated, scale, timeframe
--   • briefs_status      — unawarded | partially_awarded | awarded (awarded auto-rejects)
--   • work_categories    — text[]: developer, architecture, interior_design, … (firm-pool join key)
--   • geo                — nyc | south_florida | europe | middle_east | other (firm-pool join key)
--   • future_work_test   — bool: the a && b && (briefs not awarded) result
--   • future_work_reason — one-line why the test passed / failed
--   • buyer_committed    — bool: test (a) — named buyer committing to future work
--   • programmatic_scope — bool: test (b) — plural/programmatic OR single pre-design-selection
-- (buyer_org from the handoff == the existing source_org column; not duplicated.)
-- ============================================================================

alter table discoveries add column if not exists program_scope      text;
alter table discoveries add column if not exists briefs_status      text;   -- unawarded | partially_awarded | awarded
alter table discoveries add column if not exists work_categories    text[];
alter table discoveries add column if not exists geo                text;   -- nyc | south_florida | europe | middle_east | other
alter table discoveries add column if not exists future_work_test   boolean;
alter table discoveries add column if not exists future_work_reason text;
alter table discoveries add column if not exists buyer_committed    boolean;
alter table discoveries add column if not exists programmatic_scope boolean;

-- Join keys for the value-lane firm-pool matcher (category ∩ geo) + the
-- future_work_test ranking axis. Partial indexes keep them opp-scoped.
create index if not exists idx_discoveries_geo
  on discoveries(geo) where discovery_kind = 'opportunity_signal';
create index if not exists idx_discoveries_future_work
  on discoveries(future_work_test) where discovery_kind = 'opportunity_signal';
create index if not exists idx_discoveries_briefs_status
  on discoveries(briefs_status) where discovery_kind = 'opportunity_signal';

-- ── Retune the sources ──────────────────────────────────────────────────────
-- The launch-flavored `Opp ·` feeds ("to open", "debuts", "breaks ground",
-- "new hotel") are exactly why the July 8 run surfaced rollouts and
-- completions. Retire them and seed `Upstream ·` feeds shaped for PRE-AWARD,
-- demand-creating language: renovation/expansion PROGRAMS, RFPs & competitions,
-- entitlement/rezoning that unlocks a district, capital committed to a
-- development pipeline, and government licenses that trigger private
-- construction (the Dec-2025 NY downstate casino licenses → ~$12B into design).
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
