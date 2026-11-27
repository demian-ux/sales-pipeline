-- Sources, round 3 (2026-11-26): the one source the jury accepted.
--
-- Five scouts proposed 25 sources; three jurors re-tested each one on their own
-- (reproduce the measurement / can the CRM ingest it / client fit and
-- duplication). A source goes forward only with two jurors at accept or trial
-- and no reject. See docs/source-viability-report-2026-11-26-round3.md.
--
-- PROFILEmiami: the only unanimous accept (average 8.7 of 10). Full-text items
-- on early-stage Miami luxury projects that almost always name the architect,
-- the interior designer and the sales agency. Re-fetched before applying:
-- HTTP 200, 20 items, 30-Oct to 25-Nov-2026.
--
-- Launch lane after this: 24 active RSS sources (48 of 50 slots).
-- Idempotent.

insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('PROFILEmiami', 'https://profilemiami.com/miamirealestate?format=rss', 'rss', 'miami', 'luxury_residential', true, 192, 'project_launch')
on conflict (url) do nothing;
