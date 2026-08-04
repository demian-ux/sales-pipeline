-- ============================================================================
-- NY-native signal sourcing + new_dev_marketing category — 2026-08-04
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: seeds upsert on url, the firm update is idempotent.
--
-- Handoff: ny-native-signal-sourcing-handoff-2026-08-04.md. NY doesn't announce
-- via press — it files papers. Two structured sources go live (DOB NB filings,
-- DCP ZAP/ULURP), the AG offering-plan lane is registered as manual (no API),
-- and the 5 new-dev-marketing firms seeded 4-ago under categories:{development}
-- migrate to the now-real 'new_dev_marketing' category.
--
-- discovery_kind gains two stored values (no enum/CHECK exists — text column):
--   'offering_plan'  NYS AG offering-plan submission/acceptance (manual entry
--                    via POST /api/discoveries; sales start in weeks)
--   'permit_filing'  DOB new-building filing (pre-design speculative hook)
-- ZAP/ULURP rows are stored as 'opportunity_signal' — they ARE upstream signals
-- and feed the existing value lane (work_categories development+architecture,
-- geo nyc).
-- ============================================================================

-- ── Part A: NY-native sources ───────────────────────────────────────────────
-- source_type drives the ingest dispatch (lib/discoveries/ny-native.ts):
-- 'socrata_dob' / 'socrata_zap' are structured JSON fetchers; 'ag_offering_plans'
-- is registered INACTIVE — activating it makes the run fail loudly with the
-- manual-entry instructions rather than silently pretending to scrape.
insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('NY · DOB NB Filings',            'https://data.cityofnewyork.us/resource/w9ak-ipjd.json', 'socrata_dob',       'new_york', 'mixed_use',          true,  400, 'permit_filing'),
  ('NY · DCP ZAP / ULURP',           'https://data.cityofnewyork.us/resource/hgx4-8ukb.json', 'socrata_zap',       'new_york', 'mixed_use',          true,  410, 'opportunity_signal'),
  ('NY · AG Offering Plans (manual)','https://offeringplandatasearch.ag.ny.gov/REF/welcome.jsp', 'ag_offering_plans', 'new_york', 'luxury_residential', false, 420, 'offering_plan')
on conflict (url) do update set
  name = excluded.name, source_type = excluded.source_type, region = excluded.region,
  sector = excluded.sector, active = excluded.active, sort_order = excluded.sort_order,
  discovery_kind = excluded.discovery_kind;

-- ── Part B: new_dev_marketing category ──────────────────────────────────────
-- firm_pool.categories is a plain text[] with no CHECK constraint (verified in
-- 2026-07-10_firm_pool.sql), so no DDL is needed — the vocabulary lives in
-- src/lib/vocab.ts (WORK_CATEGORIES) and /api/meta.
--
-- Migrate the 5 firms seeded 4-ago-2026 as new-dev marketing divisions under
-- the placeholder categories:{development} (the enum didn't exist yet). Their
-- icp_notes already say "new-dev marketing division".
update firm_pool
set categories = '{new_dev_marketing}', updated_at = now()
where signal_ref = 'nydevmktg-seed-2026-08'
  and categories <> '{new_dev_marketing}';
