-- ============================================================================
-- Discovery event-type gate + project dedup + CRM cross-reference — 2026-06-25
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every column uses `add column if not exists`, every index
-- `if not exists`, and the source edits are idempotent.
--
-- Adds:
--   • signal_type — the event behind the article (new_development / approval_filing
--     / … KEEP; transaction / financing / completion / policy / … DROP). DROP rows
--     are analyzed then auto-archived (status='archived') and ICP-disqualified.
--   • project_name / project_key — app-level project-level dedup so the same
--     development surfacing via two outlets doesn't appear twice.
--   • already_engaged / engaged_company_* — set at ingestion when the developer
--     matches a Company already in the CRM roster, so worked firms are badged
--     rather than re-surfaced as "new".
--
-- Going-forward only: legacy rows keep these NULL/false until the backfill
-- (scripts/backfill-discovery-gate.ts) runs. No data is dropped by this migration.
-- ============================================================================

alter table discoveries add column if not exists signal_type          text;
alter table discoveries add column if not exists project_name         text;
alter table discoveries add column if not exists project_key          text;
alter table discoveries add column if not exists already_engaged      boolean not null default false;
alter table discoveries add column if not exists engaged_company_id   text;
alter table discoveries add column if not exists engaged_company_name text;

create index if not exists idx_discoveries_signal_type on discoveries(signal_type);
create index if not exists idx_discoveries_project_key on discoveries(project_key);
create index if not exists idx_discoveries_engaged    on discoveries(already_engaged);

-- ── Source rebalance (idempotent — keyed on the unique url, not name) ────────
-- Retire the old terminal/runway airport feed; it's replaced by the lounge feed
-- below. Matched by its (unique) url so re-runs and fresh installs both no-op
-- safely rather than depending on the row's name.
update sources set active = false
where url = 'https://news.google.com/rss/search?q=airport+modernization+design+architecture+(%22New+York%22+OR+%22JFK%22+OR+%22LaGuardia%22+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en';

-- Add the airport LOUNGES feed (oaki's actual aviation work) + NY project-filing
-- and cultural/civic sources. Upsert on the unique url so this is re-runnable.
insert into sources (name, url, source_type, region, sector, active, sort_order) values
  ('GNews Airport Lounges',     'https://news.google.com/rss/search?q=(airport+OR+terminal)+(lounge+OR+%22business+class%22+OR+%22first+class%22+OR+VIP)+design+(%22New+York%22+OR+JFK+OR+Miami+OR+Paris+OR+London+OR+Europe)&hl=en&gl=US&ceid=US:en', 'rss', 'global',   'aviation_hospitality', true, 30),
  ('NY YIMBY',                  'https://newyorkyimby.com/feed',   'rss', 'new_york', 'general',  true, 85),
  ('6sqft',                     'https://www.6sqft.com/feed/',     'rss', 'new_york', 'general',  true, 86),
  ('The Architect''s Newspaper','https://www.archpaper.com/feed/', 'rss', 'global',   'cultural', true, 125)
on conflict (url) do update set
  name = excluded.name, region = excluded.region, sector = excluded.sector,
  active = excluded.active, sort_order = excluded.sort_order;
