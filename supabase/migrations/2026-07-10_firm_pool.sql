-- ============================================================================
-- Firm Pool + Value-Outreach state — 2026-07-10
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every create is `if not exists`, every seed upsert is guarded.
--
-- The value lane (oaki-prospecting v6, Lane 1b) is a standing weekly campaign:
-- one upstream signal → matched firm category × geo → value-first drafts →
-- Demi sends → +7d bump → firm rests until a fresh signal fits it. This moves
-- the pool + its outreach state out of decision-trail HTML files and into the
-- CRM so dedup, "who's been touched with what", and cadence spacing are
-- queryable. See handoffs/firm-pool-crm-handoff-2026-07-10.md.
--
-- Consumer of the signals: the upstream-signal lane (discovery_kind=
-- 'opportunity_signal'), matched by work_categories ∩ geo. The firm-side
-- `categories` MUST use the same tokens as a signal's work_categories
-- (development / architecture / interior_design / hospitality_design /
-- landscape / experiential) so the join is exact.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ── firm_pool — the population (distinct from Sheets companies/leads, linked) ──
create table if not exists firm_pool (
  firm_id            uuid primary key default uuid_generate_v4(),
  name               text not null unique,
  domain             text,
  apollo_org_id      text,                              -- provenance
  website            text,
  categories         text[] not null default '{}',      -- WorkCategory tokens; join key vs signal.work_categories
  geo                text,                              -- nyc | south_florida | europe | middle_east | other
  icp_notes          text,                              -- one line: why this firm is in the pool
  -- active   = enriched + touchable now
  -- parked   = enriched, waiting for a matching signal
  -- candidate= LLM example-firm hint from a signal, unverified (see from-signal)
  -- excluded = client / engaged account / warm thread / mismatched mailbox (with reason)
  -- converted= became a real lead/opportunity
  pool_status        text not null default 'active',
  exclusion_reason   text,                              -- populated when pool_status='excluded'
  linked_company_id  text,                              -- Sheets company_id, when the firm also exists in companies
  signal_ref         text,                              -- provenance for candidates (the from-signal source)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_firm_pool_status     on firm_pool(pool_status);
create index if not exists idx_firm_pool_geo        on firm_pool(geo);
create index if not exists idx_firm_pool_categories on firm_pool using gin(categories);

-- ── firm_pool_contacts — one primary contact per firm is enough for now ──────
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

-- ── value_touches — the outreach ledger ─────────────────────────────────────
create table if not exists value_touches (
  touch_id        uuid primary key default uuid_generate_v4(),
  firm_id         uuid not null references firm_pool(firm_id) on delete cascade,
  contact_id      uuid references firm_pool_contacts(contact_id) on delete set null,
  signal_ref      text not null,                        -- discovery id OR free-text signal name
  batch_date      date,
  sent_at         timestamptz,                          -- null until confirmed in Gmail Sent
  gmail_thread_id text,                                 -- required before sent_at can be set
  bump_due        date,                                 -- +7d from send
  reply_status    text not null default 'none',         -- none | replied | call | brief
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Same-signal dedup (rule 1): one touch per (firm, signal_ref).
create unique index if not exists idx_value_touches_firm_signal on value_touches(firm_id, signal_ref);
create index if not exists idx_value_touches_firm on value_touches(firm_id);
create index if not exists idx_value_touches_sent on value_touches(sent_at desc nulls last);

-- ============================================================================
-- SEED — the July 10 pilot pool. Firm rows are deterministic; CONTACTS + verified
-- emails are NOT seeded here (they were in the pilot's Apollo enrichment / Gmail
-- drafts and need re-deriving from Apollo in an interactive session — Apollo is
-- MCP-only, not reachable from a headless deploy). Categories use the canonical
-- WorkCategory tokens so category ∩ geo matches a signal's work_categories.
-- ============================================================================

-- Parked, South Florida (16) — the superseded Nobu batch, enriched, waiting.
insert into firm_pool (name, categories, geo, pool_status, icp_notes) values
  ('PTM Partners',            '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('Crescent Heights',        '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('Dacra',                   '{development}',                       'south_florida', 'parked', 'Miami developer (Design District) — pilot pool'),
  ('Integra Investments',     '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('Newgard Group',           '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('Rilea Group',             '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('LD&D',                    '{development,architecture}',          'south_florida', 'parked', 'Miami design-developer — pilot pool'),
  ('Royal Palm Companies',    '{development}',                       'south_florida', 'parked', 'Miami developer — pilot pool'),
  ('Shulman + Associates',    '{architecture}',                      'south_florida', 'parked', 'Miami architecture — pilot pool'),
  ('Studio Mc+G',             '{interior_design}',                   'south_florida', 'parked', 'Miami interiors — pilot pool'),
  ('Saladino Design Studios', '{interior_design}',                   'south_florida', 'parked', 'Miami interiors — pilot pool'),
  ('B+G Design',              '{interior_design}',                   'south_florida', 'parked', 'Miami interiors — pilot pool'),
  ('Adriana Hoyos Design Studio', '{interior_design}',               'south_florida', 'parked', 'Miami interiors — pilot pool'),
  ('Portuondo Perotti',       '{architecture}',                      'south_florida', 'parked', 'Miami architecture — pilot pool'),
  ('RAD Architecture',        '{architecture}',                      'south_florida', 'parked', 'Miami architecture — pilot pool'),
  ('GURRIMATUTE',             '{architecture,interior_design}',      'south_florida', 'parked', 'Miami design — pilot pool')
on conflict (name) do nothing;

-- Touched, NYC (12) — the casino-signal batch (send expected Jul 14). Active.
insert into firm_pool (name, categories, geo, pool_status, icp_notes) values
  ('Jeffrey Beers',           '{interior_design,hospitality_design}', 'nyc', 'active', 'NYC hospitality interiors — casino batch'),
  ('Tihany Design',           '{interior_design,hospitality_design}', 'nyc', 'active', 'NYC hospitality interiors — casino batch'),
  ('Roman and Williams',      '{interior_design,hospitality_design}', 'nyc', 'active', 'NYC hospitality interiors — casino batch'),
  ('INC Architecture & Design', '{architecture,interior_design}',     'nyc', 'active', 'NYC architecture + interiors — casino batch'),
  ('CRÈME',                   '{architecture,interior_design}',       'nyc', 'active', 'NYC design — casino batch'),
  ('Asthetíque',              '{interior_design}',                    'nyc', 'active', 'NYC interiors — casino batch'),
  ('Gabellini Sheppard',      '{architecture}',                       'nyc', 'active', 'NYC architecture — casino batch'),
  ('Charles & Co',            '{interior_design}',                    'nyc', 'active', 'NYC interiors — casino batch'),
  ('TORREY',                  '{interior_design}',                    'nyc', 'active', 'NYC interiors — casino batch'),
  ('Legeard Studio',          '{interior_design}',                    'nyc', 'active', 'NYC interiors — casino batch'),
  ('Mancini Duffy',           '{architecture}',                       'nyc', 'active', 'NYC architecture — casino batch'),
  ('Slade Architecture',      '{architecture}',                       'nyc', 'active', 'NYC architecture — casino batch')
on conflict (name) do nothing;

-- Excluded — never value-touch cold (engaged / warm / mismatch / own developer).
insert into firm_pool (name, categories, geo, pool_status, exclusion_reason) values
  ('AvroKO',            '{interior_design,hospitality_design}', 'nyc',           'excluded', 'CRM bump live'),
  ('EDG',               '{interior_design}',                    'other',         'excluded', 'mailbox mismatch'),
  ('KODA',              '{architecture}',                       'south_florida', 'excluded', 'engaged CRM account'),
  ('OKO Group',         '{development}',                        'south_florida', 'excluded', 'engaged CRM account'),
  ('PMG',               '{development}',                        'south_florida', 'excluded', 'engaged CRM account'),
  ('Fort Partners',     '{development}',                        'south_florida', 'excluded', 'engaged CRM account'),
  ('Arquitectonica',    '{architecture}',                       'south_florida', 'excluded', 'engaged CRM account'),
  ('Oppenheim',         '{architecture}',                       'south_florida', 'excluded', 'warm thread'),
  ('Zyscovich',         '{architecture}',                       'south_florida', 'excluded', 'warm thread'),
  ('13th Floor',        '{development}',                        'south_florida', 'excluded', 'signal''s own developer'),
  ('Key International',  '{development}',                        'south_florida', 'excluded', 'signal''s own developer')
on conflict (name) do nothing;

-- The casino-signal touches for the NY batch (sent_at null — the Tue block
-- confirms). Joined to firm rows by name; deduped by (firm_id, signal_ref).
insert into value_touches (firm_id, signal_ref, batch_date, reply_status)
select firm_id, 'NY downstate casino licenses dic-2025', date '2026-07-14', 'none'
from firm_pool
where name in (
  'Jeffrey Beers', 'Tihany Design', 'Roman and Williams', 'INC Architecture & Design',
  'CRÈME', 'Asthetíque', 'Gabellini Sheppard', 'Charles & Co',
  'TORREY', 'Legeard Studio', 'Mancini Duffy', 'Slade Architecture'
)
on conflict (firm_id, signal_ref) do nothing;
