-- ============================================================================
-- Source repair — 2026-07-14c
-- Run once against the Supabase project (Dashboard → SQL editor, paste + run).
-- Safe to re-run: every statement is keyed on the OLD url, so a second run is a
-- no-op once the repair has landed.
--
-- FIVE ACTIVE SOURCES WERE RETURNING NOTHING — on every single run, for weeks.
-- All five are `project_launch` feeds: the lane whose supply was reported at
-- 1-2/week while the upstream lane (zero failures) ran at ~14/week.
--
-- This is not inference. `ingestion_runs.errors` recorded the exact status of each
-- failure on every cron cycle since at least 2026-07-06:
--
--   Urbanize Miami             HTTP 404        publisher moved the feed to /rss.xml
--   Urbanize NYC               fetch failed    DNS: the subdomain is `nyc.`, not `ny.`
--   Curbed NY                  HTTP 410        Gone; folded into NY Mag
--   The Architect's Newspaper  HTTP 403        blocks the deploy IP (see below)
--   World Architecture         HTTP 403        blocks the deploy IP; RSS path also 404s
--
-- TWO DIFFERENT FAILURE CLASSES, and the distinction matters:
--
--   (a) WRONG / DEAD URL — Urbanize x2, Curbed. Repair the URL or retire.
--   (b) IP BLOCK — ArchPaper and World Architects return 403 to Vercel's datacenter
--       ranges but serve HTTP 200 with valid items to a residential IP, using the
--       pipeline's exact User-Agent. So it is the IP, not the crawler identity.
--       Their URLs are correct; the deploy environment simply cannot reach them.
--
-- Plus a sixth, and the worst: The Real Deal was `active = false` behind the
-- comment "bot-blocked / paywalled / feed discontinued". For TRD all three claims
-- are FALSE — the stored URL (therealdeal.com/feed/) 301-redirects to the homepage;
-- it was simply the wrong endpoint. The market feeds each return HTTP 200 with 10
-- items, unpaywalled, robots.txt `Allow: /`.
--
-- In fairness to that comment: bot-blocking IS real here — just not for the sources
-- it named. It is true of ArchPaper and World Architects, and false of The Real Deal
-- and Commercial Observer (which has been active and healthy the whole time). The
-- error was generalizing an observed 403 into a blanket policy, and then citing that
-- policy in schema.sql to justify reaching the trade press only via Google News.
--
-- ArchPaper is deactivated here NOT because it is dead — it is a good, live feed —
-- but because a source that fails on every run would keep the new feed-health banner
-- permanently lit, and an alarm that is always on is an alarm nobody reads. It is
-- recoverable: either fetch it through a proxy, or add a Google-News query scoped to
-- `site:archpaper.com` (Google's crawler is not blocked), which is the same
-- workaround pattern the existing GNews sources already use.
--
-- See docs/source-viability-report-2026-07-14.md §2.
-- ============================================================================

-- ── Repair: Urbanize (feeds moved to /rss.xml; NY subdomain is nyc.) ─────────
update sources set url = 'https://miami.urbanize.city/rss.xml'
  where url = 'https://miami.urbanize.city/feed';

update sources set url = 'https://nyc.urbanize.city/rss.xml'
  where url = 'https://ny.urbanize.city/feed';

-- ── Deactivate: unreachable from the deploy environment ─────────────────────
-- Curbed is genuinely gone. The other two are 403 IP-blocks (see the header): their
-- URLs are correct and they serve fine from a residential IP, but Vercel cannot reach
-- them, so they contribute nothing and would keep the health banner permanently lit.
update sources set active = false
  where url in (
    'https://ny.curbed.com/rss/index.xml',       -- 410 Gone: publication folded into NY Mag
    'https://www.archpaper.com/feed/',           -- 403 to Vercel; 200 + 10 items from residential. RECOVERABLE.
    'https://www.world-architects.com/en/rss'    -- 403 to Vercel; RSS path also 404s in a browser
  );

-- ── Repair: The Real Deal — never bot-blocked, just the wrong URL ────────────
-- Repoint the existing (inactive) row to the New York market feed and reactivate
-- it, then add Miami as a second row. Splitting by market matters: MAX_PER_SOURCE
-- caps each source at 2 articles per run, so one combined feed would throttle two
-- target markets into a single pair of slots.
update sources
  set url        = 'https://therealdeal.com/new-york/feed/',
      name       = 'The Real Deal NY',
      region     = 'new_york',
      active     = true,
      sort_order = 90
  where url = 'https://therealdeal.com/feed/';

insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('The Real Deal Miami', 'https://therealdeal.com/miami/feed/', 'rss', 'miami', 'general', true, 91, 'project_launch')
on conflict (url) do update set
  name           = excluded.name,
  region         = excluded.region,
  sector         = excluded.sector,
  active         = excluded.active,
  sort_order     = excluded.sort_order,
  discovery_kind = excluded.discovery_kind;

-- ── Verify (optional; run manually after the statements above) ───────────────
-- Expect: Urbanize ×2 on /rss.xml, The Real Deal ×2 active, Curbed + World
-- Architects inactive.
--
--   select name, url, active, sort_order
--     from sources
--    where discovery_kind = 'project_launch'
--      and url not like '%news.google.com%'
--    order by active desc, sort_order;
