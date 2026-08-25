-- Source health tracking (2026-08-25).
--
-- A dead feed returns nothing and costs supply in silence — the two The Real
-- Deal feeds were dead for weeks before the failed-run banner was noticed.
-- Health now lives ON the source row, stamped by every ingestion run:
--   • last_success_at / last_failure_at — the two clocks.
--   • consecutive_failures — reset to 0 on any successful fetch.
--   • health — 'ok' | 'degraded' (1-2 consecutive failures) | 'dead' (3+).
--     Derived, but materialized so /api/sources and the report endpoint can
--     filter on it without recomputing.
--   • last_error — the most recent failure message, for diagnosis without
--     digging through ingestion_runs.errors.
--
-- The AG offering-plans source (source_type 'ag_offering_plans') is a manual
-- lane that fails loudly by design — the health writer skips it so it never
-- shows as 'dead' (it has no fetchable endpoint to be dead).
--
-- Idempotent — safe to re-run.

alter table sources add column if not exists last_success_at       timestamptz;
alter table sources add column if not exists last_failure_at       timestamptz;
alter table sources add column if not exists consecutive_failures  integer not null default 0;
alter table sources add column if not exists health                text not null default 'ok';
alter table sources add column if not exists last_error            text;

create index if not exists idx_sources_health on sources(health) where health <> 'ok';

comment on column sources.health is
  'ok | degraded (1-2 consecutive failed fetches) | dead (3+). Stamped by every ingestion run; manual lanes (ag_offering_plans) are never stamped.';
