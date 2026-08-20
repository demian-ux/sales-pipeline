-- ============================================================================
-- Seats + waterfall pipeline — 2026-08-20
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every create is `if not exists`.
--
-- Automates the seat-curation layer over firm_pool: a nightly worker finds one
-- verified-email person per firm (Apollo REST people/search + people/match,
-- async email waterfall as the only retry), records every credit in a ledger
-- against a hard weekly budget, and queues results for Demi's approve/reject
-- (Gate 1 = the /seats view). Approve creates a lead via POST /api/leads.
-- See handoffs/oaki-relations-seats-waterfall-handoff-2026-08-20.md.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── firm_seats — one seat attempt per firm (1:1; re-attempts overwrite) ──────
create table if not exists firm_seats (
  seat_id              uuid primary key default uuid_generate_v4(),
  firm_id              uuid not null references firm_pool(firm_id) on delete cascade unique,
  candidate_name       text,
  title                text,
  email                text,
  -- verified | waterfall_pending | waterfall_verified | none
  email_status         text not null default 'none',
  -- unworked → seat_pending → seat_approved → lead_created | seat_failed
  seat_status          text not null default 'unworked',
  -- machine reason when seat_status='seat_failed':
  --   no_domain | no_candidate | no_email | rejected | error:<detail>
  fail_reason          text,
  seat_source          text,                     -- apollo_match | apollo_waterfall
  credits_spent        numeric not null default 0,
  apollo_person_id     text,
  linkedin_url         text,
  waterfall_request_id text,                     -- non-null while a waterfall poll is pending
  lead_id              text,                     -- Sheets lead_id once approved → created
  found_at             timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_firm_seats_status    on firm_seats(seat_status);
create index if not exists idx_firm_seats_waterfall on firm_seats(waterfall_request_id) where waterfall_request_id is not null;

-- ── credit_ledger — every Apollo credit spent, at the moment it is spent ─────
create table if not exists credit_ledger (
  entry_id    uuid primary key default uuid_generate_v4(),
  firm_id     uuid references firm_pool(firm_id) on delete set null,
  action      text not null,                     -- match | waterfall
  credits     numeric not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_credit_ledger_created on credit_ledger(created_at desc);
