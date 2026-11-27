# Round 3, angle: the firms' own channels (firm news feeds)

**Date:** 2026-11-26. **Scout:** firm-channels angle. **Question:** if scope is decided by the
firm, does the firm's own news page give an earlier, firm-named signal, and is it worth a
"firm feeds" lane?

**Short answer: no.** About one pool firm in six has a feed with anything in the last 90
days. Those 32 feeds together posted 116 items in 90 days. 8 of them announce a project at an
early stage, and **one** is an in-profile US project at an early stage (Auberge Dallas hotel and
residences, from King & Partners). The firms that do make project news in the round-2
single-firm Google News runs (Fortune International, Mast Capital, Yabu Pushelberg, Tihany,
Studio Gang, Elliman Development Marketing, Nichols, Behar Font, Handel) have **no usable feed**.
Most firm posts repost press coverage after it ran, so they come later than the news feeds the
CRM already reads.

---

## 1. Method

- Input: `scratchpad/fuentes3/pool-focus-firms.txt`, 243 rows. 52 rows have no domain, and
  `serhant.com` appears twice, which leaves **191 distinct domains**. All 191 were probed, not
  a sample. I also probed a second set of **24 pool firms with no domain in the file**, using
  domains I guessed (marked "guessed"; Studio Gang, Snøhetta, Roman and Williams, Tihany,
  Jeffrey Beers, SO-IL, Fogarty Finger, Gabellini Sheppard, SCAPE, GLUCK+, Alloy, Mancini Duffy,
  LeFrak, Ironstate, Hartz, Slade, INC, Fortune, Royal Palm, Integra, Crescent Heights, Behar
  Font, Bermello Ajamil, Shulman), plus **12 well-known firms outside the pool as controls**
  (Arquitectonica, Related Group, Related Companies, Gensler, SOM, KPF, Rockwell, RAMSA,
  Selldorf, BIG, WATG, HKS).
- Each domain: home page fetched with curl and a browser User-Agent (the desktop Chrome
  string). Then: `<link rel="alternate" type=rss|atom>` from the home HTML; `/feed`, `/rss`,
  `/news/feed`, `/blog/feed`, `/atom.xml`, `/index.xml`, `/feed.xml`, `/rss.xml`,
  `/press/feed`, `/journal/feed`; and for Squarespace sites, `?format=rss` on `/news`,
  `/journal`, `/press`, `/blog`, `/stories`, `/updates`. A response counted as a feed only if it
  parsed as `<rss>`, `<feed>` or `<rdf:RDF>`. Duplicate feeds (same first five titles) were
  collapsed. Items were counted by `pubDate` / `published` / `updated`, with today taken as
  2026-11-26.
- Then I read the titles of every feed that had anything in the last 90 days, and opened the
  article page where the title was ambiguous.
- Scripts and raw responses: `scratchpad/firmfeeds/` (`bin/probe.py`, `out/results.json`,
  `out_supp/results.json`).

## 2. Aggregate: what share of pool firms have a usable feed

Over the 191 pool domains in the file:

| Outcome | Firms | Share |
|---|---|---|
| Home page not 200 (403 ×4, timeout/DNS ×3, 503 ×1) | 8 | 4% |
| No feed at any path | 82 | 43% |
| A feed exists, but nothing in the last 365 days (WordPress "Hello world!" ×9, empty Squarespace collections, feeds dormant since 2016–2025) | 56 | 29% |
| Something in 365 days but nothing in 90 days | 15 | 8% |
| Something in 90 days (raw) | 38 | 20% |
| **…of which a real news feed** | **32** | **17%** |

Not counted as news: 6 of the 38. Compass `rss/coming-soon.xml` is 3,786 resale listings. The
Craft/Drupal `rss.xml` feeds of Michael Maltzan, Monument Realty and Murdock Solon are page-edit
feeds ("MMA Team", "Our Team", "Contact Us"). Antunovich's `feed/rss2` lists project pages
re-saved on a single day. SCM Architecture's only live feed is its comments feed.

The 24 guessed-domain pool firms add 2 live news feeds (GLUCK+, Shulman + Associates). So it is
**34 of 215 pool firms probed (16%)**, or **14% of the 243-firm pool**.

**The big names have no feed.** Yabu Pushelberg (Webflow), Handel Architects, Peter Marino,
Post Company, Commune, Proper Hospitality, Elliman DM, SERHANT, Durst and garciastromberg have
none. HBA, SCB, KTGY, BHS and SB Architects return 403 or don't connect. Corcoran Sunshine,
TWBTA, Vulcan and Selldorf serve empty feeds. Studio Libeskind's is dead since 2025-01-29, Menin
since 2024-04, Tihany since 2023, Jeffrey Beers' press feed since 2024-07. Roman and Williams,
Snøhetta, Studio Gang, Fogarty Finger, SO-IL, Gabellini, Royal Palm, Crescent Heights, Behar
Font and Bermello Ajamil all have none or a dead one. Of the 12 controls, only Related Companies
and RAMSA have live feeds. RAMSA's is project pages, not news.

**Platform.** WordPress 82 sites, Squarespace 38, Wix 6, Webflow 6. The detection is a substring
heuristic and over-counts "craft". Squarespace `?format=rss` worked on 9 of 38 Squarespace sites
and had anything in 90 days on 4.

## 3. Aggregate: what the 32 live feeds produce

**116 items in 90 days**, about **39 a month** across 32 feeds. My hand classification of
titles (and pages where needed):

| Kind | Items (90 d) | Notes |
|---|---|---|
| Early project announcement: commission, design unveiled, filing, approval, groundbreaking, sales launch | **8** | Burdge (Palisades beachfront CDP approval, single-family); JWDA (High Street Village, San Diego, planning); Cavagnero (Tallinn renderings, Europe); HPA ×2 (North Union density bump; Foundry Park breaks ground); SJP (former Century 21 site in Morristown slated for redevelopment); Weber Thompson (Holland 185-unit Fremont groundwork, rental); King & Partners (Auberge Dallas hotel + residences, "early 2027" launch) |
| Construction progress / topping out / opening / sale | ~25 | Of these, 10 are one SJP topping-out (The Lucy, Jersey City, rental) syndicated ten times |
| Awards, press features, magazine covers | ~25 | |
| Hires, promotions, talks, podcasts, culture, opinion | ~45 | Walker Warner: 10 of 10. Gettys: 3 of 3 opinion. Storyland: 4 of 4 |
| Re-posted third-party news | ~13 | Borges: 10 items all dated 2026-11-03 (a bulk repost of old press); Swedroe links to realtor.com and SRQ |

- **Early announcements: 8 in 90 days, about 2.7 a month for the whole set.**
- **In profile, in the US and early: 1** (Auberge Dallas). Two more are possible but unverified
  (HPA's Foundry Park and North Union, Chicago; residential type unclear). So **0.3 to 1 a
  month.**
- **The firm feeds are not earlier.** Every HPA, SJP, Riverside, King & Partners and Swedroe
  news item I read is a repost of a press article (YIMBY, Urbanize, TRD, Boutique Hotelier, Robb
  Report) that ran first. The feed's value is the **firm attribution**, and the round-2
  single-firm Google News queries already supply that.
- **Feed bodies are thin.** HPA, JWDA and Ziger|Snead ship an empty description. Electric
  Bowery and Pappageorge ship only "The post X appeared first on…". So `enrichArticleForAnalysis`
  would fetch the page every time. Two HPA press URLs I opened returned **404** and **500**
  (WordPress critical error).

## 4. Would a "firm feeds" lane be justified, and what code it would need

**Verdict: not justified.** One in-profile early item a quarter from 32 feeds does not pay for a
new source type. Better routes to the same firms already exist: round-2 single-firm Google News
runs found 24 items in 30 days for Fortune International alone.

If it were built anyway, here is what it would need, from reading `rss.ts` and `processor.ts`:

1. **A one-row, many-URL source type.** `fetchSourceArticles` (processor.ts:999) calls
   `fetchRSSFeed(source.url)` on a single URL. A `firm_feeds` source type would hold a list of
   `{company_id, feed_url}`, either a new table or a JSON column. It would fan out with bounded
   concurrency (`FETCH_TIMEOUT_MS` is 10 s per feed in rss.ts) and merge the results.
2. **Its own cap, outside the 50.** `prepareCandidateArticles` stops at `MAX_NEW_PER_RUN = 50`
   and `MAX_PER_SOURCE = 2` per source row (processor.ts:97–98, 345, 360). The lane needs its
   own run (like `opportunity_signal`) or its own per-feed and per-lane caps, or one row would
   be held to 2 items across 32 feeds.
3. **A shorter freshness window.** `ARTICLE_FRESHNESS_DAYS = 365`. On the first run that pulls a
   year of backlog (Riverside 12, SJP 63, Weber Thompson 20). The lane wants 30–45 days.
4. **Syndication dedup by title.** SJP posts the same topping-out under 10 headlines. Raw-article
   dedup is by link, and project dedup only happens after analysis, so this costs 10 analyzer
   calls.
5. **Feed-type hygiene.** Reject page-edit feeds (Craft/Drupal `rss.xml` whose links are
   `/team/`, `/contact/`), comments feeds, and "Hello world!" feeds at registration.
6. **Pass the known firm to the analyzer.** The firm is the feed owner, but processor.ts only
   cross-references the Sheets company roster by name. Attribution would need the
   `company_id` carried on the article.
7. **Per-feed health.** `recordSourceOutcomes` stamps health per source URL. With 32 URLs behind
   one row, a dead feed would be invisible unless health is tracked per feed.
8. Enrichment uses the `OakiDiscoveries/1.0` UA (processor.ts:1036). The feeds were fetched with
   a browser UA. I did not test whether the firm sites block the bot UA.

## 5. Developer and branded-residence microsites

No pattern. Eight microsites were probed: oneladybirdlake.com, 2200brickell.com,
thewaldorfmiami.com, ritzcarltonresidencesmiamibeach.com, theestatesatacqualina.com (home 200),
and edition-residences.com, aubergeresidencesdallas.com, casadelmar-residences.com (no
connection; the domains are guesses). None has a feed with items. One Lady Bird Lake advertises
`/feed/`, which returns 0 items. Sales microsites are brochures, not newsrooms.

## 6. The individual feeds worth naming (all fetched 2026-11-26, HTTP 200, valid RSS)

| Feed | Items / window | Early in-profile | Verdict |
|---|---|---|---|
| King & Partners `kingandpartners.com/feed` (NYC dev/hospitality marketing) | 10, 2026-01-20 → 10-12 | 3 of 10 (Auberge Dallas; Fouquet's Miami; Chipperfield Miami Design Residences) | trial at most: ~1/month |
| bKL Architecture `bklarchitecture.com/feed` (Chicago) | 10, 2026-04-28 → 11-04 | 4 early (zoning filed / approvals); 8 of 10 titles name bKL; rental vs condo unverified | backlog |
| HPA `hparchitecture.com/press/feed` (Chicago) | 6, 2026-10-22 → 11-19 | 2 early; empty bodies; pages 404/500 | backlog |
| Swedroe `swedroe.com/feed/` (S. Florida) | 10, 2024-11-20 → 2026-11-16 | 7 of 10 in-profile types (Rosewood, 1 Hotels, Bungalow East); 3 in 365 d | backlog |
| Riverside I&D `riversideid.com/news?format=rss` (Chicago dev) | 20, 2025-08-11 → 2026-11-06 | approvals/permits/groundbreaking, mostly rental and office repositioning | drop |
| Related Companies `related.com/rss.xml` (control, not pool) | 10, 2022-02-01 → 2026-10-29 | 2 in 365 d (One Lady Bird Lake sales launch) | backlog |
| SJP Properties `sjpproperties.com/feed` (NYC/NJ dev) | 99, 2021-12 → 2026-11-11 | 0 in-profile in 20 most recent; 10× syndication | drop |
| Pappageorge Haymes `pappageorgehaymes.com/feed/` (Chicago) | 10, 2026-03-02 → 10-30 | 6 of 10 about one project (Paseo, Austin) | drop |

Also live but with zero project news in 90 days: Walker Warner (10/10 talks and awards), LMN,
Storyland, Gettys, Hickok Cole (`/feed/`: hires, Q&As, "Shaping Raleigh's next chapter" is a
principal hire), Marvel, Ziger|Snead, Weber Thompson (rental/affordable), JWDA (rental, awards).

## 7. Dead ends

- Page-edit `rss.xml` feeds (Craft/Drupal) look live but list re-saved pages: Maltzan (14 in 90
  d, all team profiles), Hickok Cole `rss.xml` (44 in 90 d, project/team pages), Monument,
  Murdock Solon, RAMSA.
- Compass `rss/coming-soon.xml`: 3,786 resale listings, not new development.
- Borges Architects: 10 items all stamped 2026-11-03, re-posted old press. Dates unreliable.
- Squarespace `?format=rss` on `/home`, `/work`, `/projects`: valid RSS with 0 items (page
  collections, not blogs).
