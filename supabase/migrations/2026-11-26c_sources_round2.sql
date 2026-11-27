-- Sources, round 2 (2026-11-26): firm-centric queries, repaired queries, swaps.
--
-- Measured in docs/source-viability-report-2026-11-26-round2.md.
--
-- The finding behind most of this: Google News reads only the first ~200
-- characters of a query and ignores the rest. Re-checked independently: a
-- nonsense required term inside the first 197 characters returns 0 items; the
-- same term placed past character 208 is ignored and the query returns 72-100.
-- Seven seeded queries had their geography group past that point, so it was
-- never applied. Every query below is at or under 200 characters.
--
-- Scope is decided by where the firm is based, so the new launch sources are
-- built from the names of pool firms (what THEY are working on, wherever the
-- project is) plus the one trade source that names the designer.
--
-- Launch lane after this: 22 - 3 + 4 = 23 active RSS sources (46 of 50 slots).
-- Upstream lane: 8 - 2 = 6. Each lane has its own 50-candidate cap.
--
-- Two recommendations from the report are NOT applied here and sit commented
-- out at the end: replacing `GNews Hospitality Rollouts` (it is a change of
-- subject, and the current query produced 56 used rows in 90 days) and the
-- bizjournals trial (headline-only, paywalled).
--
-- Idempotent.

-- ── 1. Switch off ────────────────────────────────────────────────────────────
update sources set active = false where name in (
  'ArchDaily',                      -- 1000 articles / 33 discoveries / 7 used in 90 days; none of today's 24 items a US project
  'Urbanize Miami',                 -- 2 articles in 90 days
  'GNews Capital · Dev Funds',      -- 172 / 5 / 1; 270-char query, geography never read
  'Upstream · Skift',               -- 429 / 8 / 6; no classifier in this lane, so each article is a full analysis
  'Upstream · Licenses & Approvals' -- 103 / 2 / 2; 293-char query, half the subject and all geography lost
);

-- ── 2. New launch sources ────────────────────────────────────────────────────
insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('GNews Firms · NY Hospitality Designers', 'https://news.google.com/rss/search?q=when:30d+(%22Yabu+Pushelberg%22+OR+%22Tihany+Design%22+OR+%22Jeffrey+Beers%22+OR+%22Roman+and+Williams%22+OR+%22Post+Company%22+OR+%22Islyn+Studio%22+OR+%22dash+design%22)+(hotel+OR+resort+OR+residences+OR+restaurant)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 182, 'project_launch'),
  ('GNews Firms · NY Dev Marketing', 'https://news.google.com/rss/search?q=when:30d+(%22Corcoran+Sunshine%22+OR+%22Elliman+Development+Marketing%22+OR+%22Stevens+Development+Marketing%22+OR+%22Compass+Development+Marketing%22+OR+%22SERHANT+New+Development%22)+(condo+OR+residences+OR+tower)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential', true, 184, 'project_launch'),
  ('GNews Firms · NY Architects', 'https://news.google.com/rss/search?q=when:30d+(%22Handel+Architects%22+OR+%22Fogarty+Finger%22+OR+%22Studio+Gang%22+OR+%22Rafael+Vi%C3%B1oly+Architects%22+OR+%22INC+Architecture%22+OR+%22SO-IL%22+OR+%22Pei+Cobb+Freed%22)+(tower+OR+hotel+OR+condo+OR+museum)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use', true, 186, 'project_launch'),
  ('GNews · Hospitality Design', 'https://news.google.com/rss/search?q=when:30d+site:hospitalitydesign.com+(unveils+OR+%22to+open%22+OR+%22set+to+open%22+OR+debut+OR+coming+OR+revives+OR+%22breaks+ground%22+OR+residences)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 188, 'project_launch')
on conflict (url) do nothing;

-- ── 3. Repaired queries (an in-place url change starts a new yield history) ──
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(rezoning+OR+%22special+permit%22+OR+%22planning+commission%22+OR+council)+(approves+OR+approved)+(%22luxury+hotel%22+OR+%22boutique+hotel%22+OR+%22luxury+condo%22+OR+%22condo+tower%22+OR+%22branded+residences%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Entitlements & Rezoning';
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(museum+OR+%22performing+arts+center%22+OR+%22concert+hall%22+OR+%22opera+house%22)+(expansion+OR+%22new+building%22+OR+%22new+wing%22+OR+%22capital+campaign%22)+(architect+OR+architects+OR+%22designed+by%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Cultural Capital Projects';
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(%22design+competition%22+OR+%22architecture+competition%22+OR+%22invited+competition%22+OR+%22selected+to+design%22+OR+RFP)+(hotel+OR+resort+OR+museum+OR+%22performing+arts%22+OR+%22concert+hall%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Competitions & RFPs';
update sources set url = 'https://news.google.com/rss/search?q=when:14d+(%22luxury+hotel%22+OR+%22luxury+resort%22+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+Rosewood+OR+Auberge+OR+%22St.+Regis%22)+(%22breaks+ground%22+OR+proposed+OR+planned+OR+unveils)+(developer+OR+development)&hl=en&gl=US&ceid=US:en'
 where name = 'GNews Hospitality US · Luxury Dev';
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(airport+OR+terminal)+(lounge+OR+%22first+class%22+OR+VIP)+(design+OR+designed+OR+%22to+open%22+OR+unveils)+(%22New+York%22+OR+JFK+OR+LaGuardia+OR+Newark+OR+Miami+OR+%22Fort+Lauderdale%22)&hl=en&gl=US&ceid=US:en'
 where name = 'GNews Airport Lounges';

-- ── Held for a decision — not applied ────────────────────────────────────────
-- update sources set url = 'https://news.google.com/rss/search?q=when:14d+(hotel+OR+resort+OR+residences)+(%22interiors+by%22+OR+%22interior+design+by%22+OR+%22designed+by%22+OR+%22design+by%22)+(%22to+open%22+OR+announces+OR+unveils+OR+%22breaks+ground%22+OR+planned)&hl=en&gl=US&ceid=US:en'
--  where name = 'GNews Hospitality Rollouts';
-- insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
--  ('GNews · Business Journals Dev', 'https://news.google.com/rss/search?q=when:7d+site:bizjournals.com+(hotel+OR+resort+OR+condo)+(luxury+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+boutique)+(proposed+OR+planned+OR+%22breaks+ground%22+OR+developer)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'general', true, 190, 'project_launch')
-- on conflict (url) do nothing;
