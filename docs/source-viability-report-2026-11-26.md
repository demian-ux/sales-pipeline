# Source Viability Report — National US + California Feed Expansion

**Date:** 2026-11-26
**Trigger:** the 2027 targeting ruling — firms based in New York, Miami / South Florida,
California and Seattle; their projects can be anywhere in the US, plus the Caribbean and the
Middle East. Europe is out for 2027. National US projects have to start entering the feed.
**Method:** the §2.2 probe protocol of `source-viability-report-2026-07-14.md`, adapted to feeds.
Every candidate was fetched with `curl` using the exact headers of `lib/discoveries/rss.ts`
(the Chrome 126 User-Agent and the same `Accept`), then parsed. Survivors were parsed a second
time with the repo's own `rss-parser`, and one article page per survivor was fetched with the
User-Agent that `enrichArticleForAnalysis` sends. In-scope share is a title read of the most
recent items against the brief's test (new luxury / upper-upscale hotel, resort, branded
residence, luxury condo, airport lounge, cultural project — not select-service, leasing,
roundups, completions).
**Window:** whatever each feed exposes on 2026-11-26. That is 1 to 58 days depending on the
feed, **not** a 60-day window — see §6.
**Status:** Awaiting Demi's source approval. **No existing file was changed, nothing was
inserted, the app was not run.**

---

## 0. Verdict

About seventy candidates probed: some sixty direct feed URLs and eleven Google News query
designs (22 query fetches, counting rewrites). **Six are worth adding. Ten are marginal. The
rest are dead, blocked, or off-scope.**

The headline is where the six came from.

> **Three of the six viable sources are Google News queries, two are hotel trade feeds, one is
> a Florida development feed. None is a California feed. Every California and Seattle metro
> source that is reachable is general real-estate press. The four best run 12 to 23 items a
> week each, of which zero or one is a luxury or hospitality launch.**

The brief asked for three things. What the measurements say about each:

| Ask | Result |
|---|---|
| National US hotel / hospitality-development feeds | **Met.** Two trade feeds (Hotel Dive, Boutique Hotel News) and two shaped queries (luxury hotel development, branded residences). |
| California metro / state feeds | **Not met on yield.** Four feeds are reachable and clean (Urbanize LA, SF YIMBY, The Real Deal LA and SF). None showed more than one clear in-scope item in its window. Marginal — a trial, not a recommendation. |
| Seattle, Caribbean, Middle East (optional) | **Seattle: nothing viable.** Caribbean and Middle East arrive through the two national queries; the dedicated ones mostly duplicate them. |

Two things found on the way matter more than any single feed:

1. **The feeds only help once the 2027 geo change is live.** At `HEAD` (`cd01c4b`) a Dallas or
   Nashville project is rejected at gate-0 and capped at 55. The rewrite that fixes this is in
   the working tree today, uncommitted (§1.1).
2. **A Google News query silently ignores its last terms when it is long.** Measured, twice
   (§1.3). It decides how the new queries are written, and it probably affects queries already
   seeded.

---

## 1. Three corrections to the brief's premises

### 1.1 The geography gate is the dependency, not the feeds

When this probe started, the committed code rejected exactly the articles these feeds would
bring in:

- `gate0.ts` — "everything outside NYC metro / South Florida / Europe / Middle East /
  Caribbean-luxury rejects, **including US off-geo (Dallas, Ohio)**".
- `target-geo.ts` — `TARGET_REGIONS = ['New York', 'Miami', 'France', 'Europe']`, everything
  else capped at `OUT_OF_GEO_SCORE_CAP = 55`.

During the probe the working tree changed under it: `target-geo.ts`, `gate0.ts`, both analyzer
prompts, `classify.ts` and a new `supabase/migrations/2026-11-26_firm_geo_targeting.sql` now
carry the 2027 ruling (`geoFit`: a US project never rejects on geography; Caribbean and Middle
East allow-lists pass). **That work is uncommitted and I did not touch it.** The in-scope
counts in §3 are judged against the new rule.

**Action:** do not activate any row from §7 before that change is deployed. Under `HEAD` the
national sources would only add rows that land `rejected` with reason `off-geo`.

Two edges of the new allow-lists showed up repeatedly in the sampled items:

- **Puerto Rico** — *Aman Unveils Amantaru on Puerto Rico's Southwest Coast* appeared in three
  sources. `CARIBBEAN_ALLOW` does not list Puerto Rico, and `US_COUNTRY` does not match it. If
  the analyzer returns country "Puerto Rico" with region "Caribbean", `geoFit` returns `none`.
  Not verified by running it — read from the code.
- **Mexico** — *Mandarin Oriental Kanai, Riviera Maya breaks ground + launches residential
  sales* was the single most-syndicated story of the fortnight (5 of 25 items in the branded
  residences query). Mexico is on neither list, so it passes only when a focus-geo firm is
  named. That may be intended; it is worth a conscious decision.

### 1.2 "California feeds" answers a different question than the ruling asks

The ruling is *"se busca por dónde está la firma, no por dónde está el proyecto"*. California
and Seattle are **firm** geographies. A metro development feed finds **projects** in that
metro, which is mostly apartments, affordable housing, office leases and mansion listings:

| Feed | Items read | Window | Clear in-scope |
|---|---|---|---|
| The Real Deal LA | 40 | 12 days | 0 |
| The Real Deal SF | 40 | 16 days | 1 |
| SF YIMBY | 30 | 17 days | 1 |
| LA YIMBY | 30 | 58 days | 1 |
| Urbanize LA | 10 | 3 days | 0 |
| The Registry SF | 25 | 1 day | 0 |
| Urbanize Seattle | 10 | 167 days | 0 |

What a California firm designs shows up in the **national hospitality** sources instead: the
St. Regis signing at Kapalua Bay, the Four Seasons hotel-condo in Charleston, the Raffles
residences in Houston all surfaced there, not in any metro feed. So the lever for California
and Seattle is the national lane plus the firm-pool join, not a metro feed per city.

### 1.3 Google News drops the tail of a long query

Every query in this probe was built in the repo's style: parenthesised OR-groups, geography
last. Two of them were given a recency operator at the end and returned items from 2014 and
2018:

```
(…7 brand terms…) (…5 verbs…) (developer OR development) -Dubai -India -Saudi when:14d
   → 35 items, 2 in the last 30 days, oldest 2018-03-21
(…7 brand terms…) (…5 verbs…) (developer OR development) when:14d
   → 46 items, 4 in the last 30 days, oldest 2014-10-14
```

The same query with `when:14d` moved to the **front** returned 27 items, all 27 inside the
window. A short two-group query honours a trailing `when:` fine (66 of 66 inside 14 days).

**What was measured:** trailing terms of a long query are ignored. **What was not:** the exact
limit. A cap of about 32 words is the common explanation and fits these two cases; I did not
bisect it.

Consequences:

- **New queries put `when:Nd` first and stay short.** All of §7 is written that way, and each
  URL in §7 is the exact string that was fetched.
- **Existing seeded queries put the geography group last and several are far longer than
  these.** `Upstream · Aviation Programs` ends in an eight-city group after three long
  OR-groups. If the tail is being dropped, that query is running without its geography.
  **Not verified** — worth a ten-minute check per seeded query (does removing the last group
  change the result set?).
- Baseline for comparison, fetched the same way: the seeded `GNews Hospitality Rollouts`
  returns 100 items spanning 2026-03-10 → 2026-11-26, 12 in the last 7 days. Its six newest
  were a cosmetics pop-up, two generic "Travel & Tourism News" rows, a hotel's seasonal
  offerings, a 2027 openings roundup and a holiday display. No `when:`, so the pipeline's two
  slots per run are drawn from a nine-month pool.

---

## 2. What the fetcher can and cannot read

Four findings from fetching with the pipeline's own headers. Each one moved a verdict.

### 2.1 Questex feeds parse, but into garbage

`hotelmanagement.net/rss/xml` and `luxurytraveladvisor.com/rss/xml` return HTTP 200 and valid
RSS. Parsed with the repo's `rss-parser`:

```
titleType=object   title={"a":[{"_":"The Global Consultant: How hotel design decisions …
pubDate="Nov 13, 2026 3:37pm"   isoDate=undefined
```

The publisher wraps each `<title>` in an unescaped `<a>` element, so the title arrives as an
object, and the date format is one `rss-parser` cannot convert. `rss.ts` would pass a
non-string title downstream. **Hotel Management is not ingestible without a fetcher change**,
and its article pages return 403 to both User-Agents anyway. Dropped on that basis, not on
content.

### 2.2 Article enrichment uses a different User-Agent than the feed fetch

`rss.ts` fetches feeds as Chrome 126 (the 2026-08-25 fix). `enrichArticleForAnalysis` in
`processor.ts` still fetches article pages as `OakiDiscoveries/1.0 (research reader)` — the
identity the August fix found The Real Deal blocking. Measured today, one article per source:

| Publisher | Feed dek (median chars) | Article page, enrichment UA | Article page, browser UA |
|---|---|---|---|
| The Real Deal (LA, SF) | ~700 | **403** | 200 |
| Hospitality Net | 188 | 403 | 403 |
| Hotelier Middle East | 133 | 403 | 403 |
| Construction Week | 147 | 403 | 403 |
| Hotel Management | 133 | 403 | 403 |
| Hotel Dive | 180 | 200 (8,552 chars) | — |
| LA YIMBY / SF YIMBY / Florida YIMBY | 284 / 343 / 346 | 200 (~3,000–3,400) | — |
| Urbanize LA | 2,486 | 200 | — |
| Bisnow | 115–130 | 200 (~5,000) | — |

Enrichment only runs when the feed content is under 600 characters, so The Real Deal mostly
escapes (its dek is ~700). But any TRD item with a short dek is analysed on the dek alone,
and that applies to the two TRD feeds **already seeded**, not only the new ones. Three trade
publishers are closed to both identities: their feeds are readable and their articles are not,
so the analyzer would work from ~130 characters.

### 2.3 Cloudflare and plain 403s

Blocked with the pipeline's feed headers, from a residential connection: Hotel Business,
Hospitality Design, Hotel Investment Today, San Diego Business Journal, Connect CRE, GlobeSt,
The Registry (Puget Sound), every `feeds.bizjournals.com` feed tried, CoStar, the San Diego
Union-Tribune business feed, the Seattle Times real-estate feed (405, human-verification page).

**The Architect's Newspaper also returned 403 here.** The July report recorded it as 200 from
a residential IP with this same User-Agent. Either its block widened or this connection is
treated differently; I cannot tell which. It stays inactive either way.

### 2.4 One robots.txt note

`la.urbanize.city/robots.txt` carries `User-agent: GPTBot` / `ChatGPT-User` → `Disallow: /`.
The same block is on `nyc.urbanize.city`, which is already seeded and active. The pipeline's
reader is neither of those agents and ClaudeBot is not named, so this is not the hard conflict
`competitions.archi` was in July. It is a publisher saying something about AI crawlers, and it
is Demi's call whether that reading extends to this pipeline. No AI-bot or feed disallow was
found on Hotel Dive, Boutique Hotel News, Florida YIMBY, TOPHOTELNEWS, SF YIMBY, LA YIMBY or
The Real Deal.

---

## 3. Probe results

Fetched 2026-11-26. **Items/week** is items ÷ the span between newest and oldest item, over as
many feed pages as were read. Where the span is under two days the feed's daily rate is given
instead, because a weekly figure from one day is not a measurement. **In-scope** counts are
from titles; "clear" means the title alone states a qualifying new project, "arguable" means it
depends on brand tier, stage, or an allow-list edge.

Verdicts: **AUTOMATE** (viable — add), **MARGINAL** (works, but yield or content access does
not justify it without a trial), **DROP**.

### 3.1 Summary — everything that returned a feed

| Source | HTTP / parse | Items read | Newest → oldest | Items/week | Content | In-scope | Verdict |
|---|---|---|---|---|---|---|---|
| **GNews · US luxury hotel development** | 200 RSS | 27 | 11-25 → 11-13 | 15.5 | title only | 10 clear + 4 arguable (5 distinct stories) | **AUTOMATE** |
| **GNews · Branded residences** | 200 RSS | 25 of 66 | 11-26 → 11-13 | 35 | title only | 6 clear + 5 off-allow-list | **AUTOMATE** |
| **GNews · Airport lounges US** | 200 RSS | 16 of 74 | 11-24 → 10-28 | 18.8 | title only | 3–4 of 16 | **AUTOMATE** |
| **Hotel Dive** | 200 RSS | 10 | 11-25 → 11-19 | 11.6 | 180-char dek; article 200 | 1 clear + 1 arguable of 10 | **AUTOMATE** |
| **Boutique Hotel News** | 200 RSS | 30 (3 pages) | 11-26 → 11-06 | 10.5 | full text (~3,000) | 4 clear + 1 arguable of 30 | **AUTOMATE** |
| **Florida YIMBY** | 200 RSS | 25 (5 pages) | 11-26 → 11-16 | 17.5 | 346-char dek; article 200 | 4 clear + 5 arguable of 25 | **AUTOMATE** |
| GNews · site:bizjournals.com | 200 RSS | 46 of 96 | 85 items in last 7 days | ≥ 85 | title only; site 403 | 7–8 clear + 4 arguable of 46 | MARGINAL |
| GNews · site:hospitalitydesign.com | 200 RSS | 17 of 26 | 17 items in last 30 days | ~4 | title only; site 403 | 3 clear + 2 arguable of 17 | MARGINAL |
| GNews · Middle East luxury | 200 RSS | 22 of 31 | 11-26 → 11-13 | 16.6 | title only | 9 of 22 (4 stories, 3 duplicated above) | MARGINAL |
| GNews · Upstream US luxury signings | 200 RSS | 22 of 38 | 11-26 → 11-12 | 19.9 | title only | 4 of 22 (2 stories) | MARGINAL |
| TOPHOTELNEWS | 200 RSS | 30 (3 pages) | 11-26 → 11-16 | 21 | full text (~3,150) | 1 clear + 2–3 arguable of 30 | MARGINAL |
| SF YIMBY | 200 RSS | 30 (6 pages) | 11-26 → 11-09 | 12.4 | 343-char dek; article 200 | 1 clear + 3 arguable of 30 | MARGINAL |
| Urbanize LA | 200 RSS | 10 | 11-26 → 11-23 | ~23 (3-day window) | full text (~2,500) | 0 clear + 2–3 arguable of 10 | MARGINAL |
| The Real Deal SF | 200 RSS | 40 (4 pages) | 11-25 → 11-10 | 18 | ~730-char dek | 1 clear + 1 arguable of 40 | MARGINAL |
| The Real Deal LA | 200 RSS | 40 (4 pages) | 11-25 → 11-13 | 22.6 | ~700-char dek | 0 clear + 2 arguable of 40 | MARGINAL |
| LA YIMBY | 200 RSS | 30 (6 pages) | 11-25 → 09-28 | 3.6 | 284-char dek; article 200 | 1 clear + 2 arguable of 30 | MARGINAL |
| Hotel Management | 200 RSS, **parser-incompatible** | 25 | 11-24 → 11-13 | 15.8 | 133-char dek; article 403 | 2 of 25 | DROP |
| Hotelier Middle East | 200 RSS | 40 of 100 | 11-26 → 10-18 | 17.9 | 133-char dek; article 403 | 2–3 of 40 | DROP |
| Construction Week (Middle East) | 200 RSS | 23 of 60 | 11-25 → 11-12 | 32.3 | 147-char dek; article 403 | 1 of 23 | DROP |
| GNews · Caribbean luxury | 200 RSS | 22 of 29 | 11-26 → 11-13 | 15.9 | title only | 0 clear + 1 arguable | DROP |
| GNews · California luxury (3 variants) | 200 RSS | 7 / 15 of 28 / 4 | — | 4 / 15 / 1 | title only | 0 in California | DROP |
| GNews · Seattle | 200 RSS | 20 of 31 | 11-26 → 10-30 | 8 | title only | 0–1 of 20 | DROP |
| GNews · site:archpaper.com | 200 RSS | 16 of 52 | 50 items in last 30 days | ~12 | title only | 0–1 of 16 | DROP |
| Hotel Designs (UK) | 200 RSS (1.4 MB) | 40 of 99 | 11-26 → 10-07 | 13.8 | full text | ~2 of 40 | DROP |
| Sleeper (UK) | 200 RSS | 30 | 11-24 → 11-03 | 10 | full text | 1 of 30 | DROP |
| Luxury Travel Advisor | 200 RSS, parser-incompatible | 8 of 25 | 11-25 → 10-16 | 4.4 | 133-char dek | 0 of 8 | DROP |
| Lodging Magazine | 200 RSS | 10 | 11-25 → 11-24 | ~9 a day | ~610-char dek | 0 of 10 | DROP |
| Hospitality Net | 200 RSS (301 to `/rss/news.xml`) | 20 | 11-26 → 11-25 | ~17 a day | 188-char dek; article 403 | 0–1 of 20 | DROP |
| Breaking Travel News | 200 RSS | 5 of 10 | all 11-26 | not measurable | 482-char dek | 0 of 5 | DROP |
| Caribbean Journal | 200 RSS | 10 | 11-26 → 11-25 | ~10 a day | full text | 0 of 10 | DROP |
| The Real Deal National | 200 RSS | 10 | 11-25 → 11-19 | 12 | ~730-char dek | 0 of 10 | DROP |
| The Registry SF | 200 RSS | 25 | 11-25 → 11-24 | ~25 a day | 488-char dek; article 200 | 0 of 25 | DROP |
| Bisnow Los Angeles | 200 RSS | 10 of 23 | 11-24 → 10-15 | 4.0 | 115-char dek; article 200 | 0 of 10 | DROP |
| Bisnow San Francisco | 200 RSS | 6 of 22 | 11-25 → 09-28 | 2.7 | 125-char dek | 0 of 6 | DROP |
| Bisnow National | 200 RSS | 22 | 11-25 → 11-19 | 25.5 | 130-char dek | 0 of 22 | DROP |
| Los Angeles Business Journal | 200 RSS | 10 | 11-24 → 11-23 | ~6 a day | full text | 0–1 of 10 | DROP |
| LA Times real estate | 200 RSS | 10 of 28 | 11-25 → 09-04 | 2.4 | 166-char dek; article 200 | 0 of 10 | DROP |
| Robb Report (shelter) | 200 RSS | 10 | 11-25 → 11-23 | ~35 (2-day window) | 115-char dek | 0 of 10 | DROP |
| Urbanize SF | 200 RSS | 5 of 10 | 11-25 → 10-21 | 2.0 | full text | 0 of 5 | DROP |
| Urbanize Seattle | 200 RSS | 10 | 11-25 → 06-10 | 0.4 | full text | 0 of 10 | DROP |
| Archinect | 200, served as `text/html`; parses with `rss-parser` | 16 of 30 | 11-25 → 11-14 | 19 | ~1,000 chars | 0 of 16 | DROP |
| Architectural Record | 200 RSS | 8 of 30 | 11-25 → 11-12 | 16.6 | 118-char dek | 0 of 8 | DROP |

### 3.2 Dead, blocked or empty — nothing to measure

| Source | URL tried | Result |
|---|---|---|
| Hotel Business | `hotelbusiness.com/feed/` | 403, Cloudflare challenge |
| Hospitality Design | `hospitalitydesign.com/feed/` | 403 (homepage too, both User-Agents) |
| Hotel Management topic feeds | `/rss/hotel-design/xml`, `/rss/development/xml` | 403, Cloudflare challenge. URLs were guessed; they may not exist |
| Hotel Investment Today | `/rss.xml` | 403, Cloudflare challenge. URL guessed |
| Hotel Online | `/feed/` | 404 |
| Hotel News Resource | `/rss/news.xml` | 404. URL guessed |
| HOTELS Magazine | `hotelsmag.com/feed/` | 200, valid RSS, **zero items** |
| Urbanize San Diego | `sandiego.urbanize.city/rss.xml` | 301 to `urbanize.city/rss.xml`; no San Diego edition. That root feed's newest item is 2026-09-17 |
| SocketSite | `socketsite.com/feed` | 200, newest item **2024-07-15**. Dormant |
| San Diego Business Journal | `sdbj.com/feed/` | 403, Cloudflare challenge |
| San Diego Union-Tribune | `/business/feed/` | 403, empty body |
| Connect CRE | `connectcre.com/feed/` | 403, Cloudflare challenge |
| GlobeSt | `globest.com/feed/` | 403 |
| Business Journals (LA, Seattle) | `feeds.bizjournals.com/bizj_*` | 403 |
| The Registry (Puget Sound) | `news.theregistryps.com/feed/` | 403, "Checking your browser" |
| Seattle Times real estate | `/business/real-estate/feed/` | 405, human-verification page |
| Seattle Daily Journal of Commerce | `djc.com/rss/` | **Timed out twice at 20 s. Not verified either way** |
| Bisnow Seattle, Bisnow hotel | `/rss-feed/seattle`, `/rss/hotel` | 404. URLs guessed |
| Hospitality Net development feed | `/rss/development.xml` | 404. URL guessed |
| Mansion Global | `/rss` | 404. URL guessed |
| Hotel News ME | `hotelnewsme.com/feed/` | TLS certificate expired |
| Hospitality News ME | `/en/feed/` | 404. URL guessed |
| The Architect's Newspaper (seeded, inactive) | `archpaper.com/feed/` | 403 from this connection (§2.3) |
| CoStar News (seeded, inactive) | `costar.com/rss/news` | 403, Access Denied |
| Bisnow (seeded, inactive) | `bisnow.com/feed` | Now 301s to `/rss/all`: 200, valid, 10 items. Reachable again, still off-scope |

### 3.3 GNews · US luxury hotel development — **automate**

```
when:14d ("luxury hotel" OR "luxury resort" OR "Four Seasons" OR "Ritz-Carlton" OR Rosewood
OR Auberge OR "St. Regis") ("breaks ground" OR proposed OR planned OR approved OR unveils)
(developer OR development)
```

- 27 items, all inside the 14-day window; 15.5 a week.
- **US, clear:** *Water Street developer breaks ground on Charleston hotel-condo* (the Four
  Seasons project); *Luxury Hotel Operator Unveiled for 20 Washington Building* (Minneapolis).
- **US, arguable:** a 33-story tower breaking ground in Charlotte (two outlets; hotel tier not
  in the title); a resort proposed on the St. Charles riverfront, Missouri (two outlets;
  probably not luxury tier).
- **Middle East, clear:** AVENEW's St. Regis Residences, Dubai Islands (six outlets); W
  Residences JLT phase three; Nobu Bahrain.
- **Noise:** four Haute Living buyer guides, a data-centre piece, a Longboat Key lawsuit,
  Bangkok, Bengaluru, Curaçao, Australia, Egypt (off the allow-list).
- No geography group, on purpose: listing states pushes the query past the length where terms
  stop being honoured (§1.3), and `gl=US` plus the brand list already biases it. Geography is
  the analyzer's and gate-0's job.

Six outlets carrying one press release is the norm here. `dedup.ts` handles it across runs,
but with two slots per source per run, one syndicated story can occupy several runs.

### 3.4 GNews · Branded residences — **automate**

```
("branded residences" OR "branded residence") (announces OR unveils OR launches OR
"breaks ground" OR planned OR proposed) when:14d
```

- 66 items in 13 days; 35 a week. The highest-volume query of the probe and the one closest
  to oaki's product.
- **Clear (25 newest read):** Aman's Amantaru, Puerto Rico; The Hoxton's first Abu Dhabi hotel
  with ~100 branded residences (three outlets); St. Regis Residences Dubai Islands; Aldar's
  NOMA district.
- **Off the allow-list:** Mandarin Oriental Kanai, Riviera Maya (five outlets); Armani Egypt.
- **Noise:** three Indian developer items, a Dubai transit item, an awards item.
- A simpler 30-day variant of the same query, run earlier, also returned *Raffles announces
  first Texas property with River Oaks Residences*, *Aman unveils 1,049-foot ATMA Miami
  supertall by SHoP*, Raffles' standalone residences in Coconut Grove and sbe's $1B "The
  Estate" pipeline. Those are the US stories this query exists for; they had aged out of the
  14-day window by the time of the final run.
- Short enough that the trailing `when:` is honoured (66 of 66 in window).

### 3.5 GNews · Airport lounges US — **automate**

```
when:30d (airport OR terminal) lounge (new OR design OR "to open" OR unveils OR opens)
(LAX OR SFO OR "Sea-Tac" OR Dallas OR Atlanta OR Chicago OR Boston OR Denver OR Houston)
```

- 74 items in 28 days; 18.8 a week. Extends the seeded `GNews Airport Lounges`, which names
  only JFK, Miami, Paris, London and Europe.
- **In scope (16 newest):** a new, larger United Club at SFO; Alaska Airlines' premium lounge
  project at Sea-Tac (via DJC); Cathay Pacific's first New York lounge at JFK T6; United's new
  lounge at Dulles (arguable — already open).
- **Noise, about half:** consumer lounge guides ("Full list of lounges at LAX", "How to get
  into Delta Sky Clubs"), airport dining guides. The classifier should discard these on title.

### 3.6 Hotel Dive — **automate**

- `https://www.hoteldive.com/feeds/news/` — 10 items, 6 days, 11.6 a week. US-national by
  editorial focus, which no seeded source is.
- **In scope:** *Colorado's Gaylord Rockies Resort to undergo $305M expansion* (clear);
  *Trailborn Hotels & Resorts expands to Yosemite with 3 properties* (arguable — lifestyle
  tier).
- Rest: transactions, forecasts, people moves, loyalty programmes.
- The dek is 180 characters, so every item triggers enrichment; the article page returned 200
  and 8,552 characters to the enrichment User-Agent.
- The feed does not paginate (`?page=2` returns the same ten items), so ten items is the whole
  sample. **One clear item in six days is a thin basis** for a verdict; it is "automate"
  because access is clean, volume is low and it is the only US-national hotel trade feed that
  is both reachable and parseable.

### 3.7 Boutique Hotel News — **automate**

- `https://boutiquehotelnews.com/feed/` (the `www.` form 301s here) — 30 items over 20 days
  across three pages, 10.5 a week. Full article text in `content:encoded` (median ~3,000
  characters), so no enrichment fetch is needed.
- **Clear:** *Raffles and Sade reveal 114-home Raffles Residences River Oaks* (Houston); *The
  Estate by sbe reveals $1 billion branded residence pipeline*; *The Hoxton to debut branded
  residences in masterplan NOMA* (Abu Dhabi); *Aman launches ultra-luxury "performance living"
  brand ATMA*.
- **Arguable:** *Elysée New York to reopen as flagship of Wunderkind Hotels & Resorts*.
- UK-edited: roughly half the feed is London and continental Europe, which is out for 2027
  and will be rejected at gate-0 unless a focus-geo firm is named. That is a cost in
  classifier calls, not in feed quality.

### 3.8 Florida YIMBY — **automate** (not in the brief; found while probing)

- `https://floridayimby.com/feed` — 25 items over 10 days across five pages, 17.5 a week.
  South Florida is a core market and this outlet is not in the source table, though New York
  YIMBY is. It was the origin outlet for two of the branded-residence stories in §3.4.
- **Clear:** *12-story "The Stanton Residences" planned for 161 Ocean Dr, Miami Beach*;
  *Fortune International announces $43M joint venture for ORA by Casa Tua*; *construction set
  to start on "Roche Bobois St. Pete Tower"*; *final approval secured for 55-story tower in
  Edgewater*.
- **Arguable:** a 43-story Edgewater tower in review; a $345M construction loan for a 42-story
  Brickell tower (capital event); a 13-story Coral Gables mixed-use; an 18-story Orlando
  tower; a 25-story West Palm Beach tower.
- **Will be rejected at gate-0 by design:** "tops out", "completes construction", "general
  contractor selected", workforce and affordable housing — about a third of the feed.

### 3.9 The marginal ten

**GNews · site:bizjournals.com** — the richest US-national development signal found, and the
one with the worst access. 85 items in seven days; of 46 article titles read, 7–8 are clear:
a luxury condo in Daytona Beach Shores, the Charleston hotel-condo, Raffles converting a River
Oaks tower to condos, Terra and BH Group filing a 30-story West Palm Beach condo, a "massive
luxury development northwest of Austin", an oceanfront Miami Beach hotel to be replaced by a
luxury condo, Terra's Miami Seaquarium plans. But `bizjournals.com` returns 403 to both
User-Agents and is paywalled, so every item would be analysed from an ~85-character headline.
Seventeen of the 96 rows are section index pages ("Phoenix Business Journal - The Business
Journals"). At 85+ a week it would also be the one source where the two-per-run cap binds.
**Trial for a week and look at what the analyzer makes of headline-only rows** before
committing — I did not run the app, so that is unmeasured.

**GNews · site:hospitalitydesign.com** — the workaround the July report suggested for
blocked trade press. It works as a headline source: Amantaru, *Fouquet's to unveil first U.S.
residences in Miami in 2030*, *The StandardX is coming to Times Square*, *Ken Fulk revives San
Francisco's Huntington Hotel*, *Montana's Lone Mountain Ranch unveils Bison Lodge*. About four
items a week, and the site is 403 to enrichment. `when:14d` was only partly honoured (9 of 26
items older than 30 days, back to 2021).

**GNews · Middle East luxury** — 16.6 a week and a high hit rate, but three of its four
distinct stories (Hoxton Abu Dhabi, AVENEW St. Regis, Aldar NOMA) already arrive through §3.3
and §3.4. Its one unique item was *Nakheel launches 216 waterfront homes on Palm Jebel Ali*.
The July report's finding on Gulf sources still stands: by announcement, the design team is
usually locked.

**GNews · Upstream US luxury signings** — built for the `opportunity_signal` lane (a brand
signing is pre-award for the interiors). The version without an India exclusion surfaced
exactly the target event, *Marriott signs St. Regis resort deal for Kapalua Bay, Hawai'i*,
among five St. Regis Bengaluru rows and four general-manager appointments. The version with
`-India` lost the Bengaluru rows and, in the 22 newest, the Kapalua row too. Two real stories
in a fortnight, both duplicated elsewhere. Needs another round of query work before it earns
a slot.

**TOPHOTELNEWS** — full text, clean access, 21 a week, but global and mid-market: Scandic in
Stockholm, Holiday Inn Express in Spain, NH in Uzbekistan, sponsored bathroom-fixture posts.
In scope: *Hyatt takes StandardX to Times Square*; *Apartment Collection by Hilton signs first
deals in Dubai, Turks and Caicos*; *Rixos comes to Bahrain*.

**SF YIMBY** — the best of the California feeds on signal: *New luxury development at Mallard
Pointe in Belvedere* is clear; a 42-story tower at 329 Bryant Street, a 36-story tower at 1301
Van Ness and the Marina Safeway towers are arguable (tenure and tier not in the title). The
other 26 of 30 are permits, Berkeley mid-rises, townhomes and offices.

**Urbanize LA** — full text in the feed and the same publisher as the two seeded Urbanize
rows. The 10-item window (the feed does not paginate) held *Exterior takes shape for $300m
Kali Hotel in Inglewood* (construction progress — gate-0 rejects), *Burbank City Council
approves Marriott hotel* (brand tier not in the title) and a Torrance monument. **Three days
is too short a window to judge**; the verdict is marginal because nothing clear appeared, not
because the feed is weak. See §2.4 on its robots.txt.

**The Real Deal SF / LA** — same publisher and format as the two seeded TRD rows, so no new
risk. Yield is the problem: in 80 titles, one clear item (*Strada pitches apartments, for-sale
townhomes facing Presidio after $52M purchase*). The LA feed is mansion listings, office
distress and affordable housing.

**LA YIMBY** — 3.6 items a week, mostly affordable and small-lot. One clear item in 58 days
(*Park Elm Residences*, Century City, which reads as sponsored). Lowest priority of the ten.

### 3.10 Why the rest were dropped

- **Hotel Management** — §2.1. Content is reasonable (Gaylord Rockies, VAI Resort); the feed
  is not ingestible as the fetcher stands.
- **Hotelier Middle East, Construction Week** — the feeds read; the articles do not (403 to
  both User-Agents), so analysis would rest on ~130 characters. Their real stories reach the
  two national queries through outlets that are fetchable.
- **Hospitality Net** — about 17 items a day, almost all vendor PR and opinion. Its
  press-release items surface in §3.4 anyway.
- **Lodging Magazine** — select-service sales and vendor news: *Sale of Quality Inn & Suites*,
  *Drury Hotels announces new property*. The wrong tier.
- **Hotel Designs, Sleeper** — UK design titles, Europe-first and heavy on product launches.
  Good publications for the 2026 geography, not the 2027 one.
- **GNews · Caribbean** — consumer travel dominates: Black Friday resort deals, cruise
  seasons, "best all-inclusive" lists. Caribbean development surfaced through §3.3 and §3.4
  instead.
- **Caribbean Journal** — a consumer travel site at ten posts a day.
- **GNews · California** — three phrasings tried. The tightest returned four items in 30 days,
  none a California project; the loosest returned Skid Row landlords and tariff news.
- **GNews · Seattle** — "Bellevue" matches Bellevue, Kentucky. In scope: nothing.
- **The Registry SF** — 25 items a day of leases, industrial sales and data centres.
- **Bisnow, LA Business Journal, LA Times, Robb Report, The Real Deal National** — markets,
  policy, listings. None is a development-launch feed.
- **Archinect, Architectural Record** — jobs, awards, house features, podcasts.
- **Urbanize SF / Seattle** — two items a week and 0.4 a week, nearly all affordable housing.

---

## 4. Recommended source list (for Demi's approval)

### Add (6) — all `discovery_kind = 'project_launch'`

1. **GNews · US luxury hotel development** — sector `hospitality`.
2. **GNews · Branded residences** — sector `luxury_residential`.
3. **GNews · Airport lounges US** — sector `aviation_hospitality`.
4. **Hotel Dive** — sector `hospitality`.
5. **Boutique Hotel News** — sector `hospitality`.
6. **Florida YIMBY** — sector `general`.

Expected yield, from the windows measured and counting distinct stories rather than
syndicated copies: roughly **6–10 in-scope launch signals a week** across the six. That is a
single-week reading, not a 60-day average.

### Trial first (4) — if California coverage is wanted regardless of yield

7. **SF YIMBY**, 8. **Urbanize LA**, 9. **The Real Deal SF**, 10. **The Real Deal LA**.
Together about 75 items a week for an expected one or two in-scope. They are in §7 as a
separate, commented-out block.

### Hold (6)

GNews · site:bizjournals.com (trial separately — see §3.9) · GNews · site:hospitalitydesign.com
· GNews · Middle East luxury · GNews · Upstream US luxury signings · TOPHOTELNEWS · LA YIMBY.

### One capacity constraint before adding anything

`processor.ts` takes at most 2 candidates per source and **50 per run**, walking sources in
`sort_order`. The seed block holds 18 active `project_launch` RSS rows, so up to 36 slots.
The six additions make 48. **Any further row can push the lane past 50, and the sources that
lose are the ones at the end of `sort_order`.** I read the seed, not the live table, so the
real count may differ.

Europe being out for 2027, two seeded rows now feed a geography gate-0 rejects: `GNews
Hospitality EU` and `GNews France RE`. Deactivating them would free four slots. That is a
decision for Demi and is not in §7.

---

## 5. Leads for the source-scout backlog

- **Business Journals, properly.** The national development coverage that matters most sits
  behind `bizjournals.com`, which blocks feeds and pages alike. The Google News route gives
  headlines only. Worth a decision on whether headline-only rows are useful to Demi at all.
- **Seattle Daily Journal of Commerce.** Two Seattle items in this probe traced back to DJC
  (the Sea-Tac Alaska lounge project; modular apartments in Belltown). Its feed timed out
  twice. Retry from another network before writing Seattle off.
- **Hawaii and mountain-resort press.** The Kapalua Bay St. Regis and Lone Mountain Ranch
  items came from generalist outlets. Not probed.
- **Fetcher fix for Questex titles.** A few lines in `rss.ts` (coerce a non-string title, parse
  `"Nov 13, 2026 3:37pm"`) would make Hotel Management's feed readable. Its articles would
  still be 403, so the gain is headlines and deks only.
- **Enrichment User-Agent.** §2.2. Aligning it with the feed User-Agent would recover article
  text for The Real Deal on all four of its feeds. Not a source question, but it surfaced here.

---

## 6. What was not verified

- **Reachability from Vercel.** Every fetch was made from a residential connection. The July
  report showed two publishers that answer 200 to a residential IP and 403 to Vercel's ranges.
  The three Google News rows are the same host as sources that already run clean in
  production; the three direct feeds (Hotel Dive, Boutique Hotel News, Florida YIMBY) are
  **untested from the deploy environment**. The `consecutive_failures` / `health` columns will
  show it within a day of activation.
- **Yield over 60 days.** The July report used a 60-day window. Feeds expose between 5 and 100
  items, so the windows here run from one day to 58. Every "items/week" is a short reading,
  and Thanksgiving week may be unrepresentative.
- **In-scope judgement.** Titles only, read once, by one reader. No article bodies were
  fetched for classification. Brand tier and development stage are often not in a title;
  those items are counted as "arguable", not as hits.
- **How the analyzer treats headline-only rows.** The app was not run. `analyze.ts` tells the
  model to classify thin or title-only articles as watchlist when the title carries a
  development keyword; what score and tier that produces for a bizjournals or Hospitality
  Design row is unmeasured.
- **The Google News length limit.** Tail truncation was observed twice; the threshold was not
  bisected, and no seeded query was tested for it.
- **Google News stability.** Each query was fetched once. Result sets shift between requests.
- **Guessed feed URLs.** Marked in §3.2. A 404 or 403 on a guessed path does not prove the
  publisher has no feed.
- **DJC.** Timed out twice; neither confirmed dead nor alive.
- **The Puerto Rico and Mexico allow-list edges** (§1.1) were read from uncommitted code, not
  exercised.
- **The live `sources` table.** Duplicates were checked against `supabase/schema.sql` and the
  migrations, not against Supabase. None of the URLs in §7 appears in either.

---

## 7. SQL for review — not a migration, not run

Columns and conventions follow the seed block in `supabase/schema.sql`. Two deliberate
differences from it:

- **`on conflict (url) do nothing`**, where the seed uses `do update`. A review block should
  never overwrite a row someone has edited.
- **`when:` sits at the front of each query** (§1.3). The seeded queries carry no recency
  operator.

`region` and `sector` are descriptive: no code path reads them from `sources`
(`loadActiveSources` selects `name, url, source_type`). `'global'` is the seed's value for
multi-region sources. `'california'` in the trial block is a new value for that column.
`sort_order` 170–180 sits after the last active launch row (160) and before the inactive
block (200).

```sql
-- ── National US hospitality + branded-residence feeds (2026-11-26) ───────────
-- REVIEW ONLY. Do not run before the 2027 geo change (target-geo.ts geoFit,
-- gate0.ts, migrations/2026-11-26_firm_geo_targeting.sql) is deployed: under
-- the previous gate every US-off-geo row these bring in lands rejected.
-- Each URL is the exact string fetched on 2026-11-26.
-- See docs/source-viability-report-2026-11-26.md.
insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  ('GNews Hospitality US · Luxury Dev', 'https://news.google.com/rss/search?q=when:14d+(%22luxury+hotel%22+OR+%22luxury+resort%22+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+Rosewood+OR+Auberge+OR+%22St.+Regis%22)+(%22breaks+ground%22+OR+proposed+OR+planned+OR+approved+OR+unveils)+(developer+OR+development)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality',          true, 170, 'project_launch'),
  ('GNews Branded Residences',          'https://news.google.com/rss/search?q=(%22branded+residences%22+OR+%22branded+residence%22)+(announces+OR+unveils+OR+launches+OR+%22breaks+ground%22+OR+planned+OR+proposed)+when:14d&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential',   true, 172, 'project_launch'),
  ('GNews Airport Lounges US',          'https://news.google.com/rss/search?q=when:30d+(airport+OR+terminal)+lounge+(new+OR+design+OR+%22to+open%22+OR+unveils+OR+opens)+(LAX+OR+SFO+OR+%22Sea-Tac%22+OR+Dallas+OR+Atlanta+OR+Chicago+OR+Boston+OR+Denver+OR+Houston)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'aviation_hospitality', true, 174, 'project_launch'),
  ('Hotel Dive',                        'https://www.hoteldive.com/feeds/news/',   'rss', 'global', 'hospitality', true, 176, 'project_launch'),
  ('Boutique Hotel News',               'https://boutiquehotelnews.com/feed/',     'rss', 'global', 'hospitality', true, 178, 'project_launch'),
  ('Florida YIMBY',                     'https://floridayimby.com/feed',           'rss', 'miami',  'general',     true, 180, 'project_launch')
on conflict (url) do nothing;

-- ── California trial (MARGINAL — measured yield 0-1 clear item per feed) ─────
-- Uncomment only as a deliberate trial. With these four the launch lane exceeds
-- the 50-candidates-per-run cap in the worst case (see report §4).
-- insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
--   ('SF YIMBY',         'https://sfyimby.com/feed',                    'rss', 'california', 'general', true, 182, 'project_launch'),
--   ('Urbanize LA',      'https://la.urbanize.city/rss.xml',            'rss', 'california', 'general', true, 184, 'project_launch'),
--   ('The Real Deal SF', 'https://therealdeal.com/san-francisco/feed/', 'rss', 'california', 'general', true, 186, 'project_launch'),
--   ('The Real Deal LA', 'https://therealdeal.com/la/feed/',            'rss', 'california', 'general', true, 188, 'project_launch')
-- on conflict (url) do nothing;

-- ── Verify (optional; run manually after the insert) ─────────────────────────
--   select name, active, health, consecutive_failures, last_error
--     from sources
--    where sort_order between 170 and 188
--    order by sort_order;
```

---

## 8. Diff summary

**Added:** this report. Nothing else.

**Touched:** nothing. No existing file edited, no migration written, no row inserted, the app
not run, nothing committed.

**Observed, not caused:** the working tree held uncommitted changes to 23 tracked files, plus
a new migration and two untracked paths, during the probe (the 2027 geo rewrite — §1.1). They were read, not modified.

**Scratch:** raw feed captures and the probe scripts are under
`/private/tmp/claude-501/-Users-demian-claude-oaki-sales-pipeline/b5b4069b-d5d8-402a-9548-5cd5494649cb/scratchpad/`
(`feeds/`, `scripts/`). That directory is session-scoped and may be cleared.

**Deliberately left alone:**
- `rss.ts` and the enrichment User-Agent in `processor.ts`, despite §2.1 and §2.2.
- The seeded Google News queries, despite §1.3.
- `GNews Hospitality EU` and `GNews France RE`, despite Europe being out for 2027.
- The allow-lists in `target-geo.ts`.
