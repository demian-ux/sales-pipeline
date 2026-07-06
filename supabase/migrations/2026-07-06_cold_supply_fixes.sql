-- ============================================================================
-- Cold-supply fixes — 2026-07-06
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every column uses `add column if not exists`, every index
-- `if not exists`. Additive only — no data is dropped, no column is retyped.
--
-- Companion to the July 6 handoff spec. Adds, on `discoveries`:
--   Workstream A — capital events + entitlement grading:
--     • intent_evidence / intent_source_url — the forward-development-intent
--       quote that turns a capital raise/acquisition from DROP into a KEEP.
--     • deployment_horizon — how far out a capital_event deploys.
--     • entitlement_evidence — which body granted what, + the source sentence.
--   Workstream B — verified excavation:
--     • verified_principal (jsonb) — the resolved developer/designer-of-record.
--     • excavation_status — unattempted | attempted_unresolved | resolved.
--   Workstream C2 — discovery work-tracking:
--     • work_status — unworked | drafted | held | rejected | already_engaged.
--     • work_reason / worked_at — why + when a run acted on the row.
-- And on `ingestion_runs` (Workstream D — supply-health instrumentation):
--     • discovery_kind — which mode the run was (project_launch | opportunity_signal).
--     • drafts_staged — drafts produced from this run's material (patched in
--       later by the working session via the API).
--
-- Going-forward only: legacy rows keep these NULL / default until re-ingested.
-- ============================================================================

-- ── Workstream A — capital events + entitlement grading ─────────────────────
alter table discoveries add column if not exists intent_evidence      text;
alter table discoveries add column if not exists intent_source_url    text;
alter table discoveries add column if not exists deployment_horizon   text;   -- active_now | 1_2_years | 3_plus_years | unstated
alter table discoveries add column if not exists entitlement_evidence text;

-- ── Workstream B — verified excavation ──────────────────────────────────────
-- verified_principal shape: { firm, role, evidence_url, evidence_quote, verified_at, verified_by }
alter table discoveries add column if not exists verified_principal jsonb;
alter table discoveries add column if not exists excavation_status  text;      -- unattempted | attempted_unresolved | resolved

-- ── Workstream C2 — discovery work-tracking ─────────────────────────────────
alter table discoveries add column if not exists work_status text not null default 'unworked';  -- unworked | drafted | held | rejected | already_engaged
alter table discoveries add column if not exists work_reason text;
alter table discoveries add column if not exists worked_at   timestamptz;

create index if not exists idx_discoveries_work_status on discoveries(work_status);

-- Backfill: rows already flagged already_engaged at ingestion should read that
-- way in the new field too, so they drop off the default new-signal board. Only
-- touches rows still at the default 'unworked' — never overwrites a hand-set
-- state. Safe to re-run.
update discoveries
   set work_status = 'already_engaged'
 where already_engaged = true
   and work_status = 'unworked';

-- ── Workstream D — supply-health instrumentation ────────────────────────────
alter table ingestion_runs add column if not exists discovery_kind text;                       -- 'project_launch' | 'opportunity_signal'
alter table ingestion_runs add column if not exists drafts_staged  integer not null default 0;

-- ── Workstream A — capital-event + hospitality source feeds ─────────────────
-- Shaped Google-News queries (direct trade-press RSS is bot-blocked). The
-- analyzer only KEEPs these as capital_event when it can quote forward
-- development intent; loans/refis/stabilized trades stay DROP. Upsert on the
-- unique url so re-runs and fresh installs both no-op safely.
insert into sources (name, url, source_type, region, sector, active, sort_order) values
  ('GNews Capital · Dev Funds',      'https://news.google.com/rss/search?q=(%22closes+fund%22+OR+%22capital+raise%22+OR+raises+OR+%22launches+fund%22+OR+%22new+fund%22)+(condominium+OR+residential+OR+%22branded+residences%22+OR+hotel+OR+resort+OR+development)+(develop+OR+%22to+build%22+OR+pipeline)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential', true, 140),
  ('GNews Capital · Redev Acquisitions','https://news.google.com/rss/search?q=(acquires+OR+acquisition+OR+buys)+(%22development+site%22+OR+hotel+OR+%22for+redevelopment%22+OR+%22to+redevelop%22+OR+%22to+develop%22+OR+repositioning)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use', true, 150),
  ('GNews Hospitality Rollouts',     'https://news.google.com/rss/search?q=(hotel+OR+resort+OR+%22branded+residences%22)+(%22to+open%22+OR+%22new+hotel%22+OR+%22design+team%22+OR+%22breaks+ground%22+OR+unveils+OR+debuts)+(%22New+York%22+OR+Miami+OR+%22South+Florida%22+OR+London+OR+Paris+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 160)
on conflict (url) do update set
  name = excluded.name, region = excluded.region, sector = excluded.sector,
  active = excluded.active, sort_order = excluded.sort_order;
