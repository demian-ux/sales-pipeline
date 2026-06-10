-- ============================================================================
-- P0 persistence migration — 2026-06-09
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: everything is `if not exists`.
--
-- Until this runs, the app still works: workflow actions and meeting preps
-- fall back to session memory (the old behavior) and failed_sources is
-- silently skipped on the run record.
-- ============================================================================

-- 1. WORKFLOW_ACTIONS — durable sent/copied/dismissed tracking.
--    Replaces sessionCache.workflowActions, which was wiped on every
--    restart/redeploy (previously-sent drafts reappeared as unsent).
create table if not exists workflow_actions (
  action_id      text primary key,
  type           text not null,        -- draft_copied | draft_sent | draft_dismissed | gmail_draft_created | recommendation_accepted | recommendation_dismissed
  lead_id        text,                 -- Sheets Leads.lead_id (no FK — cross-store)
  insight_id     text,
  opportunity_id text,
  channel        text,                 -- 'email' | 'linkedin'
  note           text,
  recorded_at    timestamptz not null default now()
);

create index if not exists idx_workflow_actions_recorded on workflow_actions(recorded_at desc);
create index if not exists idx_workflow_actions_lead     on workflow_actions(lead_id);

-- 2. MEETING_PREPS — durable per-lead meeting prep.
--    Replaces sessionCache.meetingPreps (a prep generated yesterday was gone
--    today after any redeploy).
create table if not exists meeting_preps (
  lead_id    text primary key,         -- Sheets Leads.lead_id
  prep       jsonb not null,           -- MeetingPrepOutput payload
  updated_at timestamptz not null default now()
);

-- 3. INGESTION_RUNS.failed_sources — dead RSS feeds become visible per run
--    instead of being indistinguishable from genuinely empty feeds.
alter table ingestion_runs add column if not exists failed_sources text[];
