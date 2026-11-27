-- Firm pool: research details live in the CRM (2026-11-26).
--
-- The pool is the most important list in the CRM, and until now a pool row held
-- only name, domain, categories, geo and a free-text note. Everything learned
-- when a firm was verified (where it is based, what it builds, how well it
-- fits, who makes its renders, how it was checked) lived in spreadsheets in a
-- research folder. These columns bring that into the pool, and add the firm's
-- relationship with oaki so CRM companies and researched firms sit in ONE list.
--
--   Where the firm is
--     hq_city, hq_state      headquarters as the firm's own site states it
--     hq_evidence            where on the site that was seen (address / phrase)
--     other_offices          other offices the site lists
--   What it does and how well it fits
--     fit_level              A | B | C | X   (X = researched, does not fit)
--     fit_reason             one line: why that level, or why it does not fit
--     work_types             the kind of work that matters (hotels, condos…)
--     recent_project         one or two projects, with city and year if known
--     works_outside_city     yes / no / unknown, with an example
--     visualization          own team / external studio: <name> / sells it (competitor) / unknown
--     size_note              people or offices, as the site says
--     employees              Apollo's estimate
--   How we know
--     verification_status    verified | unopened | no_site | discarded_by_name | unverified
--     verified_at            when the firm's own site was last read
--     source_url             the page that was read
--     research_source        which list or pass the firm came from
--   Relationship with oaki (snapshot taken when the row is loaded or refreshed)
--     crm_relationship       none | new_lead | contacted | replied | nurture | won | lost | dormant | held
--     crm_leads              how many leads the CRM has at this firm
--
-- All nullable, no defaults that change behaviour: existing rows and the
-- value-outreach join are untouched. Idempotent — safe to re-run.

alter table firm_pool add column if not exists hq_city             text;
alter table firm_pool add column if not exists hq_state            text;
alter table firm_pool add column if not exists hq_evidence         text;
alter table firm_pool add column if not exists other_offices       text;
alter table firm_pool add column if not exists fit_level           text;
alter table firm_pool add column if not exists fit_reason          text;
alter table firm_pool add column if not exists work_types          text;
alter table firm_pool add column if not exists recent_project      text;
alter table firm_pool add column if not exists works_outside_city  text;
alter table firm_pool add column if not exists visualization       text;
alter table firm_pool add column if not exists size_note           text;
alter table firm_pool add column if not exists employees           integer;
alter table firm_pool add column if not exists verification_status text;
alter table firm_pool add column if not exists verified_at         date;
alter table firm_pool add column if not exists source_url          text;
alter table firm_pool add column if not exists research_source     text;
alter table firm_pool add column if not exists crm_relationship    text;
alter table firm_pool add column if not exists crm_leads           integer;

create index if not exists idx_firm_pool_fit_level on firm_pool(fit_level);
create index if not exists idx_firm_pool_hq_city   on firm_pool(hq_city);

comment on column firm_pool.fit_level is
  'A = clear luxury work of the kind oaki sells into, firm active; B = fits with a reservation; C = marginal (includes studios that only do private luxury homes); X = researched and does not fit (see fit_reason).';
comment on column firm_pool.verification_status is
  'verified = the firm''s own site was read and showed where it is based; unopened = site blocked, failed, or shows no location; no_site = no website found; discarded_by_name = ruled out without opening the site; unverified = never checked.';
comment on column firm_pool.crm_relationship is
  'Best stage among the CRM leads at this firm when the row was loaded: none | new_lead | contacted | replied | nurture | won | lost | dormant | held. A snapshot — the Sheets leads remain the source of truth.';
