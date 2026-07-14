-- ============================================================================
-- Contact provenance — 2026-07-14 (b)
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: additive columns only.
--
-- Why: the 15 Nammos contacts were POSTed with {lead_id, enriched_at, source}
-- and the route answered 201 — but firm_pool_contacts has no such columns and
-- the Zod schema didn't accept those keys, so all three were silently dropped.
-- The caller had every reason to believe the link was stored. It wasn't.
--
-- These are the fields the value lane actually needs to avoid paying Apollo
-- twice for the same head: WHEN a contact was enriched, WHICH batch produced it,
-- and WHICH lead it became.
-- ============================================================================

alter table firm_pool_contacts add column if not exists lead_id     text;         -- Sheets lead_id, once the contact becomes a lead
alter table firm_pool_contacts add column if not exists enriched_at timestamptz;  -- when the email was derived (Apollo credit spent)
alter table firm_pool_contacts add column if not exists source      text;         -- batch tag / provenance of the enrichment

create index if not exists idx_firm_pool_contacts_lead on firm_pool_contacts(lead_id);

comment on column firm_pool_contacts.enriched_at is
  'When this contact was enriched. A non-null value means an Apollo credit was already spent — do not re-enrich.';
