# Round 3 — Abroad and resort markets (Caribbean, Middle East)

Scout notes, 2026-11-26. Everything below was fetched today with curl and a Chrome User-Agent
(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) … Chrome/126.0 Safari/537.36`) from a
residential connection. Counts are from the responses I read. Where I could not verify
something, I say so. Nothing in the repo was changed except this file.

## Bottom line

- **The Caribbean has one good way in: Caribbean Journal's paid investment desk, CJ Invest.**
  Its feeds are public and separate from the consumer feed that round 1 dropped. The
  *Projects* sub-feed is about 0.8 items a week, and 11 of 20 items are clear new luxury
  projects. The bodies are paywalled. The teaser (~480 characters) names the developer in
  about 6 of 20 items. It never names an architect or designer.
- **A tighter Caribbean Google News query works far better than round 1's.** It needs
  development verbs and no consumer terms. In 34 items I counted 16 clear and ~5 arguable,
  covering 7 distinct stories. The results are unstable: the same URL returned 34 items on
  the first fetch and 61 an hour later. The headlines never name a firm. Of the 24 bodies I
  could fetch, 4 name a designer. Only one Caribbean item names a firm that may be in the
  focus geos: Pendry Barbados, by Robert Glazier. I assume that means Hill Glazier, but I did
  not verify its base.
- **The Middle East is a dead end on every route I tried.** The giga-project and developer
  newsrooms return 403/404 or have no feed. The Gulf trade feeds that do read (CBNME, Big
  Project ME, Arabian Business, The National, identity) name contractors, not US designers:
  0 focus-geo firms in 340 items. Two Gulf queries pairing a US-designer phrase with Gulf
  places found 0 focus-geo designers in their project bodies.
- **The honest answer to "does it name a NY / Miami / CA / Seattle firm":** almost never, from
  any Caribbean or Gulf source, at the announcement stage. The named firms are Phoenix
  (MASASTUDIO), Dallas (HKS), Toronto (Studio Munge), Brazil (Isay Weinfeld) or local. The
  focus-geo names that appear are developers and brands: Miami-based Yntegra (Rosewood Exuma),
  Faena (Miami), JTRE (Kempinski Grace Bay). JTRE's base is not verified: its domain lookup
  hit an unrelated site.

---

## 1. What I read first

- `sources-live.txt`: 55 rows. None is Caribbean- or Gulf-specific. The 19 active Google
  News rows were used for the overlap test in §3.3.
- Round 1 dropped GNews · Caribbean luxury (0 clear of 22), Caribbean Journal (main feed,
  0 of 10), Hotelier Middle East and Construction Week (article pages 403). It rated
  GNews · Middle East luxury MARGINAL as a duplicate. It also recorded Hotel News Resource
  `/rss/news.xml` as a guessed 404.
- Round 2: brand newsrooms never name the designer. Firm-name queries worked only for NY
  hospitality designers and NY development marketers. It did not test the resort-practice
  firms (Arquitectonica, Kobi Karp, Oppenheim, SB Architects, Hart Howerton, WATG, HBA, EDSA).
  I tested those in §5.
- `rss.ts` reads plain RSS/Atom with rss-parser and a Chrome UA. It takes `content:encoded`,
  then `content`, then `contentSnippet` / `description`. `processor.ts` enriches by fetching
  the article page when content is under 600 characters. `googleNewsResolver.ts` decodes
  Google News redirect links. I re-implemented the same protocol in a scratch script to read
  the bodies in §3.2.

---

## 2. Caribbean Journal · CJ Invest (new URLs, not the round-1 feed)

Categories found through `caribjournal.com/wp-json/wp/v2/categories`: CJ Invest (id 33877,
1,130 posts), Projects (34213, 378), Hotels and Development (34172, 260). The obvious
`/category/real-estate/feed/` and `/category/hotels/feed/` return 404. The working feeds sit
under the CJ Invest path.

### 2.1 Projects — `https://www.caribjournal.com/cj-invest-news/projects/feed/`

- HTTP 200, `application/rss+xml`, 10 items per page. I read pages 1 and 2 (`?paged=2`): 20
  items, 2026-11-24 back to 2026-06-04, **173 days**. Page 1 alone covers 89 days.
- **Clear (11 of 20):** Mandarin Oriental's new Caribbean resort with 49 residences; $1B
  Ritz-Carlton project broke ground (548 keys); Nikki Beach Antigua ($400M) toward vertical
  construction; Nobu's second Caribbean hotel (2028); new luxury residential resort (Shamoon +
  Orange Limited); Pendry Residences Barbados first look (pre-sales); Puerto Rico approves the
  $2B Esencia (Mandarin Oriental + Rosewood); Port Nimara, Anguilla (Equinox resort, branded
  residences, marina); Faena's 147-residence Caribbean district; Equinox entering the
  Caribbean (Anguilla); Kempinski Grace Bay villa collection.
- **Arguable (6):** Wyndham Grand DR residential resort (tier); Luxury capital in TCI (trend
  piece naming Corinthia); Marriott-branded hotel in a Punta Cana mixed-use (City Express,
  wrong tier); Kempinski Grace Bay vertical construction; Mandarin Oriental launched
  construction; $55M USVI resort redevelopment.
- **No (3):** a US investment summit, Argyle airport master plan (a consultant search, which
  is upstream but not our client type), a Grand Bahama land listing.
- **Content:** `content:encoded` holds ~700–950 characters: a teaser followed by "To access
  this content, subscribe now". The article page returns the same teaser to curl, so
  enrichment adds nothing. The analyzer gets headline plus about three sentences.
- **Names firms:** 0 of 20 teasers name an architect or designer. About 6 of 20 name a
  developer or partner: IDILIQ Group, Reuben Brothers and Three Rules Capital (Esencia),
  hotelier Daniel Shamoon with Orange Limited, JTRE (Kempinski Grace Bay), Grupo Nivel, Faena.
- **Ingestible:** yes, as a plain RSS row.

### 2.2 CJ Invest (all) — `https://www.caribjournal.com/cj-invest-news/feed/`

- HTTP 200. I read 3 pages: 30 items, 2026-11-24 back to 2026-09-25 (**60 days**, ~3.5 a
  week).
- Clear 6 (Mandarin Oriental 49 residences; TCI pipeline reaches 18 projects with Corinthia
  Grace Bay; $1B Ritz-Carlton; Nikki Beach $400M; "A New Kind of Luxury Project Is Taking
  Shape on Grace Bay Beach"; Nobu 2028). Arguable ~4. The rest is villa listings, auctions,
  brokerage openings, occupancy and IMF data.
- Same paywall teaser. It is a superset of §2.1 plus listings noise. **Take one of the two.
  Projects is the denser.**

### 2.3 Hotels and Development — `/cj-invest-news/hotelsdevelopment/feed/`

- HTTP 200. 20 items across 2 pages, 2026-10-19 back to 2025-04-11 (~18 months). Mostly
  executive appointments and occupancy notes; in scope: Corinthia's first Caribbean hotel,
  Setai residential resort, Hard Rock $850M. Too slow and mixed. Not proposed.

---

## 3. Google News — a Caribbean query that selects development, not travel

### 3.1 The query

```
when:30d (Bahamas OR "Turks and Caicos" OR Cayman OR Antigua OR Anguilla OR "Puerto Rico" OR "St. Kitts" OR Barbados) (resort OR residences) (developer OR "breaks ground" OR "to open in" OR planned)
```

198 characters decoded, `when:` first. URL:
`https://news.google.com/rss/search?q=when%3A30d+%28Bahamas+OR+%22Turks+and+Caicos%22+OR+Cayman+OR+Antigua+OR+Anguilla+OR+%22Puerto+Rico%22+OR+%22St.+Kitts%22+OR+Barbados%29+%28resort+OR+residences%29+%28developer+OR+%22breaks+ground%22+OR+%22to+open+in%22+OR+planned%29&hl=en&gl=US&ceid=US:en`

- **First fetch:** HTTP 200, 34 items, 2026-11-25 back to 2026-10-29 (27 days). I read all 34.
  - Clear 16: Montage TCI ×4 outlets (2031, 84 rooms, with Windward); Pendry Barbados ×4
    (yacht club, fall-2027 hotel); Amantaru ×6; Waldorf Astoria TCI private island (2030);
    Mandarin Oriental "adjusts plans for luxury Beach Bay hotel" (Cayman Compass); Nobu Hotel
    and Residences, Reef Island, Bahrain.
  - Arguable ~5: Grand Hyatt Grand Cayman plans; St. Regis TCI tennis centre; Hilton's 100
    Caribbean hotels; Waldorf Astoria residences portfolio; Bahamas resort approval (Climate
    Watch).
  - No ~13: all-inclusive openings, Curaçao, GM news, listicles, a Colorado item.
  - **7 distinct in-scope stories.**
- **Second fetch, about an hour later, same URL:** 61 items, 2026-11-26 back to 2026-10-28.
  New in-scope rows include *Qatar Talks Put 300-Room Expansion on Table for Antigua's W Hotel*
  and *How The Residences at Nikki Beach Resort & Spa Antigua are catering to…* (Spear's).
  More travel noise came with them: pink-sand-beach listicles, a St. Kitts train ride, cruise
  items. **The result set is not stable between fetches.**
- Compare round 1's Caribbean query: 0 clear of 22.

### 3.2 Do the bodies name a firm?

From the first fetch, I resolved all 34 Google News links and fetched the publisher pages.
24 returned 200. Nine returned 403: hotelmanagement.net ×2, travelweekly.com ×3,
hotelbusiness.com, luxurytravelreport.com, caymancompass.com and ftnnews.com. Firm mentions
found:

| Item | Firm in body | Focus geo? |
|---|---|---|
| Amantaru (Open Jaw, RESIDENT, Caribbean Journal, Rus Tourism) | Marwan Al-Sayed, MASASTUDIO | No (Phoenix) |
| Pendry Barbados (deeparrival; La Revue des Hôtels) | "Architects Robert Glazier, HKS and Studio Munge" | Glazier probably yes (Hill Glazier; base not verified this run); HKS Dallas, Munge Toronto: no |
| Waldorf Astoria Residences portfolio (Stories From Hilton) | Gensler, Rockwell Group, EDSA | Yes, but in a global roundup, not tied to a Caribbean project in the text I read |
| Four Seasons Cherry Creek (Mile High CRE) | Tihany Design, Douglas Elliman Development Marketing | Yes, but a US project the live feeds already carry (one of the 4 title duplicates in §3.3) |
| Bahamas resort approval (Climate Watch) | "Miami-based Yntegra Group", Rosewood Exuma at Sampson Cay | Yes: a Miami developer, in environmental approval |
| Montage TCI (deeparrival) | "We could not confirm … the architect" | — |

So: **4 of 24 readable bodies name a designer, and 1 of those (Pendry/Glazier) is a Caribbean
project with a probable focus-geo firm.** One more body names a Miami developer (Yntegra).

### 3.3 Overlap with the live table

I fetched all 19 ACTIVE Google News rows in `sources-live.txt` (970 titles) and compared
normalized titles against the second fetch of this query: **4 of 61 titles duplicate**. The
duplicates are Four Seasons Cherry Creek, Preferred Hotels' 2027 openings, the Bahamas
approval and Moon Palace TCI. The overlap is by title only, so the same story can still
arrive through another outlet. Amantaru, for one, already reaches the pipeline through
Hospitality Design.

### 3.4 Other Caribbean phrasings tested (all weaker)

| Query (decoded) | Chars | Items | Verdict |
|---|---|---|---|
| `when:60d ("Miami-based" OR "New York-based" OR "Los Angeles-based" OR "California-based") (resort OR residences) (Bahamas OR Caribbean OR "Turks and Caicos" OR Cayman OR "Puerto Rico")` | 184 | 6 in 52 d | 2 real (Yntegra/Exuma ×2). Too thin |
| `when:30d (Bahamas OR "Turks and Caicos" OR Cayman OR Anguilla OR Barbados OR "St. Barth" OR "Puerto Rico") (resort OR residences) ("designed by" OR architect OR "interiors by")` | 176 | 13 in 18 d | 10 of 13 are Amantaru |
| `when:60d (Caribbean OR Bahamas OR … ) (resort OR residences) ("design team" OR "designed by" OR architects) (planned OR "to open")` | 196 | 14 in 42 d | ~6 Amantaru, a few others; weaker than §3.1 |
| `when:30d (Bahamas OR … OR Barbados) ("Four Seasons" OR Rosewood OR Aman OR "Ritz-Carlton" OR "Six Senses" OR "St. Regis" OR Auberge)` | **212** — over the limit | 66 in 28 d | Consumer travel and yacht cruises dominate |
| `when:90d ("Heads of Agreement" OR "development agreement" OR "Central Planning Authority" OR "Hotels Encouragement") (resort OR hotel OR residences) (Bahamas OR …)` | **202** — over the limit | 2 | 1 Georgia item, 1 Bahamas item |
| `when:30d (site:tribune242.com OR site:ewnews.com OR site:thenassauguardian.com) (resort OR …)` | 140 | 91 | General Bahamas news; `site:` OR plus loose terms do not filter |
| `when:60d (site:suntci.com OR site:tcweeklynews.com OR site:magneticmediatv.com) (resort OR …)` | 130 | 49 | ~3 of 30 real (Janu at North West Point, Moon Palace staff housing) |
| `when:60d site:newsismybusiness.com (hotel OR resort OR …)` | 100 | 40 | 0 in scope (Hampton/Homewood, City Express, dining) |

---

## 4. Hotel News Resource — regional feeds (new URLs)

The round-1 guess `/rss/news.xml` was a 404. The real index is
`https://www.hotelnewsresource.com/Info-Newsfeeds.html`, which lists region and category feeds.

| Feed | HTTP | Items | Window | In scope |
|---|---|---|---|---|
| `/feeds/region/caribbean.xml` | 200 | 20 | 2026-11-24 → 2025-12-17 (342 d) | ~4 clear: Nikki Beach Antigua (2030), Four Seasons DR at Tropicalia (2027), Pearns Point Antigua, Covecastles Anguilla for sale (repositioning). Arguable: Hyatt Ziva Punta Cana 2029 |
| `/feeds/region/middle.xml` (Middle East + Africa) | 200 | 20 | 2026-11-18 → 2026-01-29 (292 d) | ~1–2 (PRE/Hilton Egypt branded residences; Four Seasons Tangier is Africa) |
| `/feeds/category/development.xml` | 200 | 20 | 8 d | Global, mostly Asia and Europe |

Article pages return 200, so enrichment works. Of 9 Caribbean articles I read, 3 name a
designer: HKS + ROAM Interior Design, Isay Weinfeld, and James Hamilton Architects. A fourth
names the late Myron Goldfinger, the original architect. **None is a focus-geo firm.** About
one Caribbean item every 2.5 weeks.

---

## 5. Resort-practice firms by name (not tested in round 2)

Single-firm runs, `when:30d`:

| Firm | Items | Caribbean / Gulf project news |
|---|---|---|
| "SB Architects" | 2 | 0 (Olana Naples, via Florida YIMBY) |
| Arquitectonica | 37 | 0 (West Palm Beach and Miami, all via Florida YIMBY / TRD; foreign noise) |
| "Kobi Karp" | 9 | 0 (Ritz-Carlton Residences South Beach, Shore Club) |
| "Oppenheim Architecture" | 8 | 0 (West Palm Beach rental tower, Gold Key) |
| "Hart Howerton" | 6 | 0 (APOGEE clubhouse with Meyer Davis, Kauaʻi Curio) |
| EDSA + qualifier | 44 | 0 — Manila's EDSA avenue takes the whole result |
| WATG | 4 | 0 (Four Seasons Las Vegas, Tanzania camp) |
| "Hirsch Bedner" | 3 | 0 |

In a 30-day window, these firms' news is domestic, mostly South Florida, which the live feeds
already carry. Firm-name queries are not a way into the Caribbean or the Gulf.

### Firm-owned feeds

I tried `https://<domain>/feed/` on all 192 pool domains, plus 13 resort firms that are not
in the pool. 58 returned items. The resort-relevant ones are slow press-clipping or blog
feeds:

- EDSA: 104 items going back to 2021, the newest a South Florida Business Journal profile.
- BAMO: 10 items over 189 days, awards and houses.
- Lifescapes: 10 items over 870 days.
- Gettys: thought-leadership posts.
- Kobi Karp: 659 items, the newest 2026-09-25.

None announces a new Caribbean or Gulf commission. Dropped.

---

## 6. Middle East — everything tried

| Source | URL | Result |
|---|---|---|
| Red Sea Global | `/en/rss`, `/feed` | 403 |
| Diriyah | `/en/rss` | 403 |
| ROSHN | `/en/rss` | 403 |
| NEOM newsroom | `/en-us/newsroom` | 200 HTML, no feed |
| Aldar | `/en/news-and-media/feed` | 404 |
| Emaar | `/en/rss` | 404 |
| WAM | `/en/rss` | 200 HTML, no items |
| Zawya press releases | `/en/rss/press-releases` | 200 HTML, no items |
| Arabian Business | `/feed` | 200, 200 items in 9 d, 138-char dek; section feeds 403. 0 of 200 name a focus firm |
| The National | Arc outbound RSS | 200, 100 items in 1 d, no dek. 0 project items naming a focus firm |
| CBNME (Construction Business News ME) | `/feed/` | 200, 10 items in ~1 d. Contractor awards (Nakheel villas, Six Senses Residences MEP). 0 focus firms |
| Big Project ME | `/feed/` | 200, 10 items in 2 d. 0 focus firms |
| identity (UAE design) | `/feed/` | 200, 10 items in 6 d. Furniture and lighting; 1 awards list names Gensler |
| Design Middle East (designmena) | `/rss`, `/feed` | No response (timed out) |
| Hotel News ME | `/feed/` | No response |
| Gulf Business | `/feed/` | 403 |
| Middle East Architect | `/rss` | 405 |
| MEED | `/rss` | 200 HTML, no items |
| Gulf News | `/rss` | 404 |
| Arab News | `/cat/3/rss.xml` | 200 HTML, no items |

Gulf Google News queries:

- `when:30d ("New York-based" OR "Miami-based" OR "Los Angeles-based" OR "San Francisco-based" OR "US-based") (architect OR "design firm" OR designer) (Dubai OR "Abu Dhabi" OR Riyadh OR "Saudi Arabia" OR Doha)`
  — 206 characters (over the limit). 1 item: Sumayya Vally for a Beirut-linked foundation.
- `when:30d ("Rockwell Group" OR "Yabu Pushelberg" OR "Meyer Davis" OR AvroKO OR "Kohn Pedersen Fox" OR Gensler OR "Hirsch Bedner") (Dubai OR "Abu Dhabi" OR Saudi OR Riyadh OR Qatar)`
  — 179 characters. 10 items. 0 Gulf projects naming those firms; JFK T1 and Gold Key noise.
- `when:60d ("Red Sea Global" OR Diriyah OR NEOM OR ROSHN OR Aldar OR "Qatari Diar" OR Modon) (architect OR "design contract" OR "designed by" OR "lead designer" OR "interior design")`
  — 180 characters. 13 items. Openings, stadium cancellations, e-architect roundups.
- `when:30d (Dubai OR "Abu Dhabi" OR Riyadh OR Doha OR "Red Sea" OR AlUla OR Bahrain) ("branded residences" OR "luxury resort" OR "luxury hotel") ("designed by" OR "interiors by" OR architect)`
  — 189 characters. 11 items. I fetched all bodies: 0 project items name a focus-geo firm.

This agrees with round 1 and the July report: at announcement, the Gulf names the developer
and the operator, and the design team is local or European.

---

## 7. Caribbean local press and government

- **General island news feeds read but useless.** Each has 0–1 development headlines:
  - Tribune 242: 20 items in a day.
  - Cayman Compass: 72 in 7 days.
  - CNS: 10 in a day.
  - Bernews: 50 in a day.
  - Magnetic Media TCI: 10.
  - Dominican Today: 10.
  - Barbados Today: 10.
  - Jamaica Gleaner business: 10.
  - The Anguillian: newest item 2026-09-04.
- **Blocked or no feed:**
  - 404: Nassau Guardian, TCWeekly, Sun TCI `/feed/`, VI Consortium.
  - 403: EWNews, St. Thomas Source, News is my Business, Nation News.
  - Royal Gazette: 200 with an empty body.
  - Cayman Compass business and property categories: 403.
  - The CHICOS site `caribbeanhotelinvestment.com`: no response.
  - The CHTA feed `caribbeanhotelandtourism.com/feed/`: 10 items over 670 days, all tech and
    vendor blogs.
  - CHRIS (`chrisevent.com/feed/`): 404.
- **Bahamas DEPP EIA register — an early public record, needs code.** `depp.gov.bs` is
  WordPress. Its RSS feed (`/feed/`) is stale: newest post 2026-09-14, all about
  regulations. The WP REST media API is clean and current:
  `https://depp.gov.bs/wp-json/wp/v2/media?per_page=40&orderby=date&order=desc&mime_type=application/pdf`
  returns 200 with `x-wp-total: 126`.
  - The EIA/EMP page (`/eia-emp/`, modified 2026-11-16) lists Sampson Cay (the proposed
    Rosewood Exuma by Miami-based Yntegra, per Climate Watch), Six Senses, Ki'ama Elizabeth
    Island, Lighthouse Point, Fowl Cay, Torch Cay, Baha Mar Parcel West Master Site EBA
    (uploaded 2026-04-24) and Seashells at Gilliam's Bay EBA-EMP (2026-08-21).
  - New project uploads in 2026: about 2 resort or residential ones. Most of the list was a
    bulk upload on 2025-10-14.
  - The titles never name a firm. **I did not open the PDFs**, so whether the EIAs list the
    architect is unverified.
  - The Cayman planning site (`planning.ky`) did not respond. TCI planning (`gov.tc/planning`)
    is Joomla with no feed. The Bahamas Investment Authority and `investbahamas.gov.bs` did
    not respond.

---

## 8. Recommendations

| # | Source | Kind | Verdict |
|---|---|---|---|
| 1 | CJ Invest · Projects feed | RSS row | **Add** — ~0.8/week, 11 of 20 clear, developer named in ~6 of 20. Headline + teaser only (paywall). |
| 2 | GNews · Caribbean development (198 chars) | RSS row | **Trial** — 16 clear of 34, 7 stories, low title overlap with live rows; unstable result set; bodies name a probable focus-geo designer once in 24. |
| 3 | CJ Invest (all) | RSS row | **Trial only instead of #1**, not alongside; more volume, more listing noise. |
| 4 | Hotel News Resource · Caribbean | RSS row | **Backlog** — readable bodies that name designers, but ~1 item every 2.5 weeks and none focus-geo. |
| 5 | Bahamas DEPP media API | needs new fetcher | **Backlog** — genuine early public record, ~2 resort filings a year; PDFs unread. |
| — | All Gulf sources and queries | — | **Drop** |

The 50-slot launch lane is at 46–48 slots. #1 and #4 are low-volume, so most runs would
dedupe to zero, but each active row still claims up to 2 slots. Adding #1 and #2 takes the
lane to 50 or one over, depending on which count is current.

## 9. Not verified

- Hill Glazier's base for Robert Glazier. JTRE's base: its domain resolved to an unrelated
  site.
- Whether the Bahamas EIA PDFs name architects. I did not download them.
- Reachability from Vercel. caribjournal.com and hotelnewsresource.com were tested only from
  here.
- Stability of the §3.1 query. Two fetches an hour apart gave 34 and 61 items.
- `rss-parser` behaviour on the CJ feeds. They are standard WordPress RSS 2.0, and I parsed
  them with a regex script, not rss-parser itself.
