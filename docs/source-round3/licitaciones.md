# Round 3 scout: procurement and competition sources (airports, cultural, experiential)

Fetched 2026-11-26 from a residential connection with a browser User-Agent. Every count below
is from a response I fetched and read. Google News counts are one fetch each, Thanksgiving week.

## Verdict

**Procurement and agenda sources do not work for this angle.** Airport authorities publish
no RSS for solicitations or board items. The one stable listing I could read (Port Authority
NY/NJ) holds 953 table rows and none is a lounge or interiors solicitation. Board-agenda data
that is reachable as an API (Legistar) shows only food and retail concession agreements.
Lounges are leased by airlines and card issuers, so they reach a public agenda as a lease
approval that names the tenant, never the designer. They already reach the pipeline as news
through the two existing lounge queries.

**One thing is worth a trial:** a Google News query for cultural projects that have just
picked an architect (section 1). Two things go to the backlog: the Airport Improvement feed,
whose full-text articles name the design firm, and a query on California themed-design
studios. Everything else is a drop.

## 1. GNews: cultural architect selections — TRIAL

Query (176 characters decoded, `when:` first):

`when:60d (museum OR "performing arts" OR "arts center" OR "concert hall" OR theater) (selects OR selected OR taps OR chosen OR hires) (architect OR architects OR "design team")`

URL: `https://news.google.com/rss/search?q=when:60d+(museum+OR+%22performing+arts%22+OR+%22arts+center%22+OR+%22concert+hall%22+OR+theater)+(selects+OR+selected+OR+taps+OR+chosen+OR+hires)+(architect+OR+architects+OR+%22design+team%22)&hl=en&gl=US&ceid=US:en`

- HTTP 200. 31 items, 2026-09-28 to 2026-11-26 (59 days), about 3.7 a week. All 31 read.
- In scope (US or Middle East, cultural, still in design): **8 items, 7 stories**. ICA Miami
  names Gensler for its new wing (two outlets), Carnegie Museum taps AD—WO for the Heinz
  Architectural Center, RAMSA's design for the Museum of Science and Industry Welcome Hall,
  Elie Khouri Art Foundation picks an architect in Dubai, Clear Space Theatre names a design
  team for a new theater, Hilliard Art Museum prepares an expansion, Kennedy Center overhaul
  architect (politically charged).
- **The firm is in the title for 4 of those 8** (3 stories: Gensler, AD—WO, RAMSA).
- Noise: UK projects (Royal Armouries, three rows), completed buildings on ArchDaily, Europe,
  a payment-tech press release, a Britannica entry.
- Overlap with the live `Upstream · Cultural Capital Projects`: I fetched it the same
  minute (29 items, 10-29 to 11-25). Inside the shared window only ICA Miami is in both. The
  live query brings expansions (Bass / Johnston Marklee, Brandywine, Perot); this one brings
  architect *selections*. They complement each other.
- Samples, verbatim:
  - ICA Miami Names Gensler As Architect For New Wing - Artforum
  - Pittsburgh’s Carnegie Museum Taps Design Studio AD—WO to Renovate the Heinz Architectural Center - Bloomberg.com
  - A Closer Look at RAMSA's Design for MSI Welcome Hall - - World-Architects
  - Elie Khouri Art Foundation selects architect to design its permanent space in Dubai - Australasian Leisure Management Magazine
  - Clear Space announces design team for new theater - Cape Gazette
- Ingestible as a plain RSS row. Lane choice: upstream has no classifier, so all 31 items
  would get a full analysis. At about 4 a week that is a small cost. 60 days was the
  measurement window; `when:30d` would roughly halve the volume, but I did not measure it.
- Not verified: whether article bodies name the firm when the title does not. That AD—WO and
  RAMSA are New York firms is my own knowledge; I did not check it in this probe.

## 2. Airport Improvement magazine feed — BACKLOG

`https://airportimprovement.com/feed` (WordPress RSS, `?paged=N` works)

- HTTP 200, 20 items per page, full text in `content:encoded` (often 3,000 to 25,000
  characters). Six pages read: **120 items, 2026-10-19 to 2026-11-24 (36 days), about 3.3 a
  day.**
- Titles read: all 120. US-centred: airport press releases, vendor news, appointments.
- **11 of 120 name a design firm in the body** (Gensler, Corgan, Arup, Stantec, AECOM,
  Mead & Hunt, Jacobs).
- Clearly in scope: **2**. *Alaska Airlines Selects PCL and Gensler for New Premium Lounge at
  Seattle-Tacoma Intl Airport* (Gensler is lead designer, 41,000 sq ft). *Airports Authority
  Moves Forward with New VIP Terminal at Dulles International* (daa International, renderings
  credited to Corgan). Arguable: 2 terminal programs at an early stage (Jackson with Gensler,
  Grand Rapids with Corgan).
- Samples, verbatim: the two above, plus *Ford International Airport Breaks Ground on $135
  Million Terminal Enhancement Project*, *SSP America Wins Master Concessions Contract at
  Northwest Florida Beaches International Airport*, *DFW Airport Ranked No. 1 in Nation for
  Fastest Public Wi-Fi Service*.
- Why only backlog: 2 clear hits in 120 items would take 2 of the 4 free launch-lane slots,
  and the Sea-Tac lounge already arrives through the live `GNews Airport Lounges US` (via DJC).
  It is the only aviation feed found whose articles name the designer.

## 3. GNews: California themed and experiential studios — BACKLOG

`when:60d ("Thinkwell Group" OR "BRC Imagination Arts" OR "Legacy Entertainment" OR "Super 78" OR "Mycotoo" OR "Storyland Studios" OR "THG Creative")` (148 characters)

- HTTP 200, 19 items, 09-28 to 11-22. All read. In scope: 3 rows on one story (*Muhammad Ali
  Center partners with BRC Imagination Arts for reimagining - InPark Magazine*). Also 2
  Legacy Entertainment project updates (Blooloop, ALM) and 1 Storyland profile. The other 12
  are noise from "Legacy Entertainment" as a phrase (Paramount, Netflix, Skydance).
- The same query on the pool's own experiential firms (Mycotoo, Storyland, THG, Hettema, The
  Design Minds, Belle & Wissell, MATTE Projects): 10 items in 56 days, 0 to 1 in scope (MATTE
  items are brand activations on LBB).

## 4. Drops with measurements

| Source | URL fetched | HTTP / items | Window | Read | In scope | Names a firm | Why dropped |
|---|---|---|---|---|---|---|---|
| PANYNJ solicitations | `panynj.gov/content/port-authority/en/business-opportunities/solicitations-advertisements.model.json` | 200, 953 table rows (AEM page JSON; the HTML page is a JS shell) | mixed, 2019 to 2027 | keyword scan of all rows | 0 lounge or interiors; 1 concessions-management RFP (EWR Terminal B, due 2026-11-12) | no | Infrastructure and A/E task orders. Lounge leases are not PA solicitations |
| Legistar API, Denver (DEN) | `webapi.legistar.com/v1/denver/matters?$filter=substringof('concession',MatterTitle)…` | 200, 13 matters since 2026-05-01 | 05-22 to 11-24 | 13 | 0 | concessionaire only | KFC, empanadas, vending, advertising. "lounge": 0 |
| Legistar API, Broward (FLL) | same, `broward` | 200, 2 matters | 05-12 to 08-25 | 2 | 0 | no | Advertising concession, a festival |
| Legistar API, Miami-Dade, SF | `miamidade`, `sfgov` | 200 but newest matter 2018-06-15 / 2020-09-17 | — | — | — | — | Stale; both counties moved off this API |
| Legistar API, LA, Chicago, Atlanta, Dallas, Houston, Port of Seattle, MWAA, PANYNJ, San Diego airport | various client names | 500 "not set up" | — | — | — | — | Not on Legistar under the names tried (names guessed) |
| Port of Seattle | `portseattle.org/rss.xml` | 200, 10 items; `?page=N` returns the same 10 | newest 2026-05-28 | 10 | 0 | no | Stale since May |
| MWAA news | `mwaa.com/news` (HTML) | 200, 9 items | not dated in markup | 9 | 1 (Dulles VIP terminal) | rendering credit only | No feed; 1 hit; reaches news anyway |
| LAWA, SFO, San Diego, Miami-Dade Aviation, CDA, DFW, DEN, ATL, FLL procurement and news pages | various (URLs guessed) | 404, 403 (Cloudflare on DEN, ATL, FLL), timeouts (DFW) | — | — | — | — | No feed found. `lawa.org/news-releases` is 200 HTML without a feed |
| Passenger Terminal Today | `passengerterminaltoday.com/feed?paged=1..6` | 200, 60 items | 10-23 to 11-26 | 60 | 0 to 1 (O'Hare Concourse E construction) | no | Global ops and security news |
| GNews lounge + designer phrases | `when:60d (lounge OR "VIP terminal" OR "premium terminal") ("lead designer" OR …) (airline OR airport)` (163 chars) | 200, 31 | 09-28 to 11-23 | 31 | 3 US stories (Sea-Tac Alaska, Hawaiian HNL, Dulles VIP) | 2 titles (Perkins&Will São Paulo, COX Sydney) — both abroad | Covered by the live lounge queries |
| GNews lounge programmes | `when:60d ("Centurion Lounge" OR "Sapphire Lounge" OR … "Flagship Lounge") (new OR …)` (188 chars) | 200, 79 | 09-29 to 11-24 | 60 | about 7 planned US lounges (Amex EWR / PHL / BOS / IAH, Chase SEA, United DEN Polaris, AA PHL) | 0 of 60 titles | Early, but no designer is named, and the live queries already return DEN Polaris and Chase SEA |
| Bustler competitions + news | `bustler.net/feed/competitions`, `/feed/news` | 200, 10 + 10 (it was a 403 in July) | 11-15 to 11-26 | 20 | 0 | no | Ideas competitions, awards, Europe, sponsored posts |
| World Architecture Community | `worldarchitecture.org/rss` | 200, 50 | newest 2026-04-05 | 50 | — | — | Dormant since April |
| Archinect competitions | `archinect.com/feed/1/competitions` | 200 HTML | — | — | — | — | `robots.txt` now disallows ClaudeBot and anthropic-ai |
| competitions.archi | not fetched | — | — | — | — | — | `robots.txt` still disallows ClaudeBot (checked) |
| blooloop | `blooloop.com/feed/` | 200, 30 | 11-25 to 11-26 (15 a day) | 30 | 0 to 1 | 1 (Moment Factory, abroad) | Operations news, zoos, reviews |
| Park World | `parkworld-online.com/feed/` | 200, 10 | 11-23 to 11-26 | 10 | 0 | ride makers | Christmas events, IAAPA |
| Themed Attraction | `themedattraction.com/feed/` | 200, 48 | 2025-05 to 2026-11 | 48 | 0 | — | Podcasts, student showcase |
| InPark Magazine, TEA | `inparkmagazine.com/feed/`, `teaconnect.org/rss` | 403, 404 | — | — | — | — | Unreachable |
| The Art Newspaper | `theartnewspaper.com/rss.xml` | 200, 61 | 11-18 to 11-26 | 50 | 0 | 0 | Market, appointments, Europe |
| Artnet, ARTnews, AAM, Live Design | their `/feed` URLs | 200, 10 each | — | 40 | 0 | 0 | Art market, surveys; Live Design is dormant |
| Delta, Alaska newsrooms | `news.delta.com/rss.xml`, `news.alaskaair.com/feed/` | 200, 10 + 12 | November | 22 | 0 | 0 | Routes, loyalty, statements |
| Moodie Davitt, Airport World, ACI-NA, One Mile at a Time | their feeds | 200, 10 / 10 / 10 / 25 | — | 55 | 0 | 0 | Travel retail, ops, consumer |
| GNews NY exhibit designers | Appelbaum, Gallagher, Thinc, C&G, Studio Joseph, ESI, "Local Projects" (191 chars) | 200, 54 | 09-30 to 11-26 | 45 | 2 to 3 | 1 | "Local Projects" matches municipal grant news |
| GNews theater consultants | Fisher Dachs, Theatre Projects, Schuler Shook, … (180 chars) | 200, 13 | 10-08 to 11-26 | 13 | 1 (Clear Space) | 0 | Noise from "Theatre Projects" as a phrase |

## 5. Notes for the pipeline

- Google News answers a percent-encoded colon (`when%3A60d`) with a 302 to the decoded form.
  `fetch` follows redirects, so this is harmless; the live rows already use a bare `when:`.
- One 429 from Google News in about 12 query fetches this round.
- Nothing here was tested from Vercel.
