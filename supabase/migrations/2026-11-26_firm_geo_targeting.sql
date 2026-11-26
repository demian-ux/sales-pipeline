-- Firm-geography targeting (2026-11-26).
--
-- 2027 ruling: "se busca por dónde está la firma, no por dónde está el
-- proyecto." Scope is decided by where the design/development firms are based,
-- not by where the project is. See src/lib/discoveries/target-geo.ts.
--
--   • discoveries.named_firms — JSONB [{firm, role, hq_city, hq_geo}]: every
--     firm the article names as attached to the work, with its headquarters
--     normalized to a geo bucket. gate-0, the score cap and the geography
--     points read hq_geo from here (in code) instead of parsing prose.
--   • geo vocabulary widens (plain text columns, no check constraint to alter):
--       firm_pool.geo    — where the FIRM is based. New: california, seattle,
--                          chicago, dc. chicago and dc hold hand-picked firms only.
--       discoveries.geo  — the PROJECT's geo. It now only ORDERS the firm join
--                          (same-geo firms first); it no longer gates it.
--     `europe` stays valid on both: Europe is out as a 2027 focus, but existing
--     European leads and firms are kept.
--
-- Apply BEFORE deploying the matching code. (The ingest tolerates the column
-- being absent — it retries the insert without named_firms and logs a warning —
-- but the stored HQ detail is lost for rows ingested in that window.)
--
-- Idempotent — safe to re-run.

alter table discoveries add column if not exists named_firms jsonb;

comment on column discoveries.named_firms is
  '[{firm, role, hq_city, hq_geo}] — firms the article names as attached to the work. hq_geo: nyc | south_florida | california | seattle | chicago | dc | europe | middle_east | other | unknown. Scope is decided by where these firms are based (target-geo.ts geoFit).';

comment on column discoveries.geo is
  'The PROJECT''s geo: nyc | south_florida | california | seattle | chicago | dc | europe | middle_east | other. Orders the firm-pool join (same-geo firms first); never gates it.';

comment on column firm_pool.geo is
  'Where the FIRM is based: nyc | south_florida | california | seattle | chicago | dc | europe | middle_east | other. Focus geos: nyc, south_florida, california, seattle; chicago and dc hold hand-picked firms only.';
