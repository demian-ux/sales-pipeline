-- ============================================================================
-- P1/P2 migration — 2026-06-10
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: everything is `if not exists`.
-- ============================================================================

-- LETTER_DRAFTS — physical-letter drafts per lead (the first touch of the
-- cold sequence). Mirrors email_drafts / linkedin_drafts.
create table if not exists letter_drafts (
  id         uuid primary key default uuid_generate_v4(),
  lead_id    text not null unique,      -- Sheets Leads.lead_id (no FK — cross-store)
  company_id text,
  content    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_letter_drafts_lead on letter_drafts(lead_id);
