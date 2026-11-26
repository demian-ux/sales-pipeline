-- National US hospitality + branded-residence sources (2026-11-26).
--
-- The existing feeds are city-bound (New York, Miami, some Europe), so national
-- projects never entered the pipeline. With scope now decided by where the firm
-- is based (migrations/2026-11-26_firm_geo_targeting.sql + target-geo.ts), US
-- projects anywhere are in scope and need feeds that carry them.
--
-- These six are the sources judged viable in
-- docs/source-viability-report-2026-11-26.md (about seventy candidates probed).
-- All six were re-fetched on 2026-11-26 and returned HTTP 200 with dated items.
-- No California or Seattle feed passed: the four California candidates measured
-- 0-1 clear in-scope item each and are listed in the report as an optional trial.
--
-- APPLY ONLY AFTER the firm-geography code is deployed. Under the previous
-- gate-0 every US project outside New York / Miami these bring in is rejected
-- as off-geo, and the classifier skips most of them before that.
--
-- Capacity: the launch lane takes 2 articles per source up to 50 per run. The
-- seed has 18 active launch RSS rows (36 slots); these make 48. Check the live
-- `sources` table before adding anything further.
--
-- Not verified: reachability of the three direct feeds from Vercel (all probes
-- ran from a residential connection). Watch `health` after the first run:
--
--   select name, active, health, consecutive_failures, last_error
--     from sources where sort_order between 170 and 180 order by sort_order;
--
-- Idempotent. `do nothing` (not `do update`) so a row edited by hand is never
-- overwritten.

insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('GNews Hospitality US · Luxury Dev', 'https://news.google.com/rss/search?q=when:14d+(%22luxury+hotel%22+OR+%22luxury+resort%22+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+Rosewood+OR+Auberge+OR+%22St.+Regis%22)+(%22breaks+ground%22+OR+proposed+OR+planned+OR+approved+OR+unveils)+(developer+OR+development)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality',          true, 170, 'project_launch'),
  ('GNews Branded Residences',          'https://news.google.com/rss/search?q=(%22branded+residences%22+OR+%22branded+residence%22)+(announces+OR+unveils+OR+launches+OR+%22breaks+ground%22+OR+planned+OR+proposed)+when:14d&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential',   true, 172, 'project_launch'),
  ('GNews Airport Lounges US',          'https://news.google.com/rss/search?q=when:30d+(airport+OR+terminal)+lounge+(new+OR+design+OR+%22to+open%22+OR+unveils+OR+opens)+(LAX+OR+SFO+OR+%22Sea-Tac%22+OR+Dallas+OR+Atlanta+OR+Chicago+OR+Boston+OR+Denver+OR+Houston)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'aviation_hospitality', true, 174, 'project_launch'),
  ('Hotel Dive',                        'https://www.hoteldive.com/feeds/news/',   'rss', 'global', 'hospitality', true, 176, 'project_launch'),
  ('Boutique Hotel News',               'https://boutiquehotelnews.com/feed/',     'rss', 'global', 'hospitality', true, 178, 'project_launch'),
  ('Florida YIMBY',                     'https://floridayimby.com/feed',           'rss', 'miami',  'general',     true, 180, 'project_launch')
on conflict (url) do nothing;
