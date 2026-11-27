# Source Viability Report, Round 2 — Sources That Follow the Firms

**Date:** 2026-11-26 (same day as round 1; the firm-geography change is live at `c97dbb9`)
**Trigger:** "turn those off and look for other sources that feed the CRM better." Scope is
decided by where the firm is based, so the best source is one that says what those firms are
working on, wherever the project is.
**Method:** as round 1 — every query and feed fetched with the headers of
`lib/discoveries/rss.ts`, titles read by hand. New this round: a single-firm query for the
pool firms in `pool-focus-firms.txt` (111 of 114 fetched), a controlled test of Google News
query length, and old-versus-new runs of the seeded queries on the same day.
**Inputs I did not measure:** the 90-day yield table (raw / disc / used / nonUS) and the count
of 22 active launch sources came from the coordinator's read of the live database. I did not
touch the database.
**Status:** Awaiting Demi's approval. **No existing file changed, nothing inserted, the app
not run.**

---

## 0. Verdict

> **Google News uses the first 200 characters of a query and nothing after. Seven seeded
> queries have their geography group past character 200, including all six upstream queries
> that name one. That is why the upstream lane has been returning small-town libraries and
> zoning explainers: it has been running without its geography since it was written.**

That finding decides most of this round:

1. **Six seeded queries are rewritten** (§4): four because they run past the limit, two
   because they name Europe and carry no recency term. On the same day, old versus new:
   Entitlements went from 3 items in 30 days, none usable, to 19 with 6 clear luxury
   hotel/condo approvals. Cultural went from none to 7 planned museum projects in 28 titles.
   The round-1 luxury query, which I wrote 9 characters too long, returns 64 items when fixed
   instead of 27.
2. **Firm-name queries work, but only for New York hospitality designers and New York
   development-marketing firms** (§2). A query holds five to seven firm names, not thirty.
   Two are worth a slot each, a third is borderline. South Florida firm queries return real
   projects that the seeded Florida feeds already carry. The ten California pool firms
   produced no project news in 30 days.
3. **No brand newsroom names the designer** (§3). Hilton and Hyatt have working feeds; none of
   20 items names a design firm in title or summary. The source that does name designers is
   Hospitality Design, reachable only as headlines through Google News.
4. **Five sources off, five on, six rewritten** (§5, §7). Launch lane ends at 24 active
   sources, 48 of 50 slots.

---

## 1. Three mechanics measured this round

### 1.1 The cutoff is exactly 200 characters

Round 1 saw long queries lose their tail and guessed at a word limit. This round tested it
with a canary: a query made of nonsense names that match nothing, with one real firm
(`"Fortune International Group"`, 25 items on its own) placed last. If the canary's items come
back, the end of the query was read.

| Filler names | Query length | Words | Canary found |
|---|---|---|---|
| 10 one-word names | 190 | 24 | yes |
| 6 two-word names | 190 | 22 | yes |
| 4 long one-word names | **200** | 12 | **yes** |
| 11 one-word names | **206** | 26 | **no** |
| 5 three-word names | 215 | 24 | no |
| 7 two-word names | 215 | 25 | no |
| 6 long one-word names | 280 | 16 | no |

Twenty-seven test queries in all. The six at 200 characters or under found the canary; the
twenty-one at 206 or over did not. Word count does not predict it (16 words fails at 280
characters, 24 words passes at 190). With the canary placed **first** and twelve fillers after it (344
characters) it was found, so it is the tail that goes.

Real queries then confirmed the edge to the character: two firm queries at exactly 200
returned results; four at 201 (twice), 204 and 207 characters with a single OR-group returned
**zero items**, because the closing parenthesis fell outside the window.

Length is of the decoded query text (`when:30d ("A" OR "B") …`), not the URL.

What I could not pin down is what Google does with the cut edge. A seeded query truncated by
hand at 200 characters did not return the same items as the full seeded query (0–34%
overlap), so the rule is not a plain substring. The consequence is measurable anyway: move the
last group to the front and see whether the results change.

| Seeded query | Length | What sits past 200 | Reordered, last group first |
|---|---|---|---|
| Upstream · Cultural Capital Projects | 244 | the whole geography group | 1% overlap; results become Bass Museum, New Museum, The Broad |
| Upstream · Entitlements & Rezoning | 293 | `mixed-use` and the whole geography group | 0% overlap; results become Lower East Side, Atlantic Avenue, Sheepshead Bay |
| Upstream · Competitions & RFPs | 225 | `waterfront OR district` | 58% overlap (only two terms lost) |
| GNews Hospitality Rollouts | 195 | nothing | geography present in both orders |

As seeded, the 22 newest Cultural items were a university debate prize in Pakistan, a praise
poetry competition in South Africa, a Lego contest in an Ontario library and a Nepalese
university dispute. The 22 newest Entitlements items were land-use rules in Airdrie, an
Indonesian oilfield and City of Bellevue code amendments. Neither showed a New York or Miami
item, though both queries name those cities.

**Every seeded Google News query, against the limit:**

| Query | Active | Length | Lost |
|---|---|---|---|
| GNews Real Estate NY / MIA | yes | 32 / 29 | — |
| GNews Airport Lounges | yes | 139 | — |
| GNews Luxury Resi | yes | 119 | — |
| GNews Hospitality Rollouts | yes | 195 | — |
| GNews Branded Residences | yes | 131 | — |
| GNews Airport Lounges US | yes | 175 | — |
| GNews Capital · Redev Acquisitions | yes | 207 | `Europe)` |
| **GNews Hospitality US · Luxury Dev** | yes | **209** | `elopment)` — the end of its last group. Mine, from round 1 |
| GNews Capital · Dev Funds | yes | 270 | entire geography group |
| Upstream · Competitions & RFPs | yes | 225 | `R waterfront OR district)` |
| Upstream · Cultural Capital Projects | yes | 244 | geography group |
| Upstream · Capital for Pipeline | yes | 253 | most of the geography group |
| Upstream · Hospitality Pipelines | yes | 259 | geography group |
| Upstream · Entitlements & Rezoning | yes | 293 | `mixed-use` + geography group |
| Upstream · Licenses & Approvals | yes | 293 | half the subject group + geography group |
| Upstream · Aviation Programs | yes | 318 | half the programme group + all eight places |

This matches the coordinator's reading of the database from the other side: the upstream
queries "carry no geography." They do carry it in the seed. Google never read it.

### 1.2 An OR of firm names returns a sample, not the union

`"Fortune International Group"` alone: 25 items in 30 days. The same name OR-ed with four to
ten names that match nothing: 7 to 9 items. `"Yabu Pushelberg"` alone: 10 items; inside a
seven-firm query, three or four of the 18 trace to it.

So a grouped firm query under-returns. Combined with the 200-character limit, a firm query
holds five to seven names and surfaces a subset of their news. It is a lead source, not
coverage of a firm.

### 1.3 The two lanes do not share slots

Checked in the code at `c97dbb9`. The cron in `api/discoveries/ingest/route.ts` runs
`permit_filing`, `project_launch`, `opportunity_signal` in sequence; each calls
`loadActiveSources(mode)` and its own `runIngestion`. `MAX_NEW_PER_RUN = 50` and
`MAX_PER_SOURCE = 2` in `processor.ts` apply per call. **Each lane has its own 50.**

- Launch lane: 22 active × 2 = 44 of 50.
- Upstream lane: 8 active RSS sources × 2 = 16 of 50. Slots are not its constraint.

What the upstream lane spends instead is analyzer calls. `processCandidate` runs the cheap
classifier only when `mode === 'project_launch'`; the comment says the upstream lane "analyzes
every prepared candidate." So a noisy upstream source costs a full analysis per article, where
a noisy launch source costs a classifier call. That changes how the yield table reads for
Skift and Licenses & Approvals (§5).

---

## 2. Firm-centric queries

### 2.1 What each firm produces alone

One query per pool firm, `when:90d "<name>"`. Of the 114, 111 were fetched: two hit an HTTP
429 from Google mid-run (The Astor Companies, V Starr), and "SERHANT." was run once, as
`"SERHANT" "new development"`. For names that are ordinary words a qualifier was added; those
are marked.

**Firms with real project news in the last 30 days** (title read; example in brackets):

| Geo | Firm | Items 30d | Example | Project outside the firm's city |
|---|---|---|---|---|
| nyc | Tihany Design | 4 | Four Seasons Private Residences, Cherry Creek, Denver | yes |
| nyc | Yabu Pushelberg | 5 | Banyan Tree Residences West Palm Beach | yes |
| nyc | Jeffrey Beers | 6 | Cactus Club Cafe, Miami Beach | yes |
| nyc | Handel Architects | 3 | 45-story tower, 325 Fremont St, San Francisco | yes |
| nyc | Fogarty Finger | 2 | 55-story tower, Edgewater, Miami | yes |
| nyc | Rafael Viñoly Architects | 1 | Faena Residences Miami breaks ground | yes |
| nyc | Studio Gang | 13 | Girls Inc. campus, Santa Fe; Austin debut | yes |
| nyc | dash design | 2 | Sheraton Tribeca; Sheraton Bradley (both completed) | one of two |
| nyc | Post Company *(+ hotel/design)* | 4 | Straker's NYC, SoHo (opened) | no |
| nyc | Douglas Elliman Development Marketing | 5 | The Darwyn, Wynwood; Mr. C Residences Boca Raton | yes |
| nyc | Brown Harris Stevens Development Marketing | 5 | ELIE SAAB Maison 171, Upper East Side | no |
| nyc | Compass Development Marketing Group | 4 | Avdoo's $145M Upper East Side loan (plus two lawsuit items) | no |
| nyc | Marvel *(as "Marvel Architects")* | 3 | Clear Space Theatre performing arts centre, Delaware | yes |
| nyc | Minno & Wasko, MHS Architecture | 7, 3 | New Jersey apartment approvals (mid-market rental) | — |
| s. florida | Fortune International Group | 24 | ORA by Casa Tua, Brickell; $220M Key Biscayne condo | no |
| s. florida | Mast Capital | 13 | Raffles Residences Coconut Grove | no |
| s. florida | Alta Developers | 8 | Alta New River, Fort Lauderdale (rental tower) | no |
| s. florida | Behar Font | 8 | 500-key Meliá resort, Lake Cecile, Kissimmee | one of eight |
| s. florida | Nichols Architects | 8 | W Pompano Beach; Waldorf Astoria Residences Pompano | no |
| s. florida | Bermello Ajamil | 7 | Olo Caye cruise port and resort, Belize | yes |
| s. florida | ODP, Corwil, garciastromberg | 4, 2, 3 | Alida Residences + Tribute hotel, West Palm Beach | no |

**Names that return something else.** Quoted, and still wrong:

| Name | What came back |
|---|---|
| HWKN | Hawkins Inc. stock quotes (ticker HWKN), 11 of 11 |
| Alloy Development | aluminium alloy research |
| Bonetti Kozerski | Benetti yachts (Google's fuzzy match) |
| Nicole Fuller, Jessica Schuster, Oliver Cope, Michael Wolk, Pamela Burton | namesakes: crime briefs, county politics, school sports, a rabbi, an obituary |
| LeFrak | LeFrak Center skating events; rent-control politics |
| Peter Marino | fashion awards, collecting profiles (9 items, 0 projects) |
| Snøhetta | 8 items, 7 outside the US (Shanghai, Belfast, Hanoi) |
| Home Studios, The Seventh Art, The Brooklyn Studio, Crown Creative, MATTE Projects, Studio Collective, Walker Workshop, Method Design | Soho Home, film festivals, type juries, ad campaigns, IQOS, YouTube |
| Civica *(bare)* | a Nevada high school's sports schedule and a software company, 19 of 19 |
| PTM Partners | mining news alongside two real items |
| Crescent Heights, Urban-X Group, LD&D | a neighbourhood name; Florida's Amendment 3; a gym chain |

**Zero items in 90 days:** Asthetíque, Bade Stageberg Cox, Bill Rooney Studio, Kliment
Halsband, Ironstate, IF Studio, SCAPE (as "SCAPE Landscape Architecture" / "SCAPE Studio"),
B+G Design, Bilkey Llinas, Borges Architects, GurriMatute, Neology Life, Shulman + Associates,
Studio Mc+G.

**Skipped as search terms:** TORREY, SILVERMAN, McCartan, SERHANT. (bare), Marvel (bare),
Post Company (bare), Charles & Co (bare). Each needs a qualifier that costs more characters
than the name earns.

**California:** ten firms, 49 items in 90 days between them, **none in the last 30 days that
is project news**. The one clear project in 90 days was Surfacedesign's Robert Mondavi Winery
renovation. The California pool is residential architects and landscape studios; they are
published in Dwell and Wallpaper after completion, not announced.

### 2.2 The grouped queries

All `when:30d`, fetched 2026-11-26. "Real" means the title is project news and the per-firm
run in §2.1 ties it to a pool firm. "New" is announced, planned, approved, financed or under
way; "done" is opened or completed. "Outside" is a project outside the firm's home market.

| Query | Chars | Items | Real | New / done | Outside | Noise | Verdict |
|---|---|---|---|---|---|---|---|
| **NY hospitality designers** — Yabu Pushelberg, Tihany Design, Jeffrey Beers, Roman and Williams, Post Company, Islyn Studio, dash design + `(hotel OR resort OR residences OR restaurant)` | 189 | 18 | 12 | 6 / 6 | 9 of 12 | 6 | **AUTOMATE** |
| **NY development marketing** — Corcoran Sunshine, Elliman / Stevens / Compass Development Marketing, SERHANT New Development + `(condo OR residences OR tower)` | 195 | 7 | 6 | 4 / 2 (sales milestones) | 3 of 6 | 1 | **AUTOMATE** |
| NY architects — Handel, Fogarty Finger, Studio Gang, Rafael Viñoly, INC, SO-IL, Pei Cobb Freed + `(tower OR hotel OR condo OR museum)` | 187 | 12 | 8 | 5 / 3 | 4 of 5 new | 4 | AUTOMATE (weakest of the three) |
| South Florida architects — Behar Font, Nichols, Corwil, ODP, Bermello Ajamil, garciastromberg, Cohen Freedman Encinosa, Urban Robot, Spina O'Rourke | 200 | 8 | 8 | 8 / 0 | 3 of 8 | 0 | MARGINAL — 7 of 8 items are from Florida YIMBY or The Real Deal |
| South Florida developers — Fortune, Mast, Alta, PTM, Integra, Rilea, Newgard, Royal Palm, Astor | 199 | 28 | 23 (8 projects) | 22 / 1 | 0 | 5 | MARGINAL — at least 13 of 28 from outlets already seeded |
| NY luxury residential designers — Peter Marino, Gabellini Sheppard, Bonetti Kozerski, Ferguson & Shamamian, Sawyer Berson, Charles & Co | 186 | 9 | 4 | 0 / 4 | — | 5 | DROP |
| NY and NJ developers — Alloy, Ironstate, KRE, Newbond, BLT, Hartz Mountain, LeFrak | 184 | 9 | 2 | 2 / 0 | — | 7 | DROP |
| NY architects, second group — Marvel, Mancini Duffy, MHS, Minno & Wasko, HWKN Architecture, GLUCK+, Palette, Slade, Murdock Solon | 194 | 9 | 9 | 5 / 4 | — | 0 | DROP — all real, but New Jersey mid-market rentals and completed houses |
| NY cultural architects — Tod Williams Billie Tsien, Snøhetta, Kliment Halsband, PEI, Bade Stageberg Cox, The Brooklyn Studio | 192 | 17 | 0–1 in the US | — | — | 10 | DROP |
| California — nine firms (run at `when:90d`) | 200 | 15 in 90 d | 1–3 | — | — | 12 | DROP |
| South Florida interiors and marketing — nine names incl. bare `Civica` | 188 | 19 | 0 | — | — | 19 | DROP — one ambiguous name took the whole query |

What the two strong ones returned:

- **Hospitality designers:** Four Seasons Private Residences in Cherry Creek (two outlets);
  Banyan Tree Residences West Palm Beach; a 60-story Bugatti-branded tower in Miami; Cactus
  Club Cafe's South Beach restaurant; Jean-Georges Miami Tropic Residences; a restaurant at
  Fairmont Century Plaza; then completed work (Sheraton Tribeca, Sheraton Bradley, Straker's
  NYC) and six lifestyle or listicle rows. **Nine of twelve are outside New York.** This is the
  query that does what the ruling asks.
- **Development marketing:** ELIE SAAB's Maison 171 on the Upper East Side; The Darwyn in
  Wynwood; Mr. C Residences Boca Raton at 50% sold; a 52-unit condo site at Union Square;
  Raffles Residences Coconut Grove; 520 Fifth selling out. One lawsuit item. Every real item
  is a for-sale project in or approaching marketing, which is where renderings are bought. The
  version without the `(condo OR residences OR tower)` group returned 9 items with 3 noise;
  with it, 7 with 1.

Two things to know before relying on them:

- **Attribution is by inference.** A Google News item carries a headline and an outlet. Only
  about a third of the real items name the pool firm in the title (*"…OMA, Yabu Pushelberg,
  and a New Kind of Branded Living"*). For the rest the link to the firm comes from the
  single-firm runs. The analyzer will have to find the firm in the article body, and for
  outlets that block the enrichment fetch it will not.
- **Volume is small.** 7 to 18 items a month per query, so each uses a fraction of its two
  slots per run. That is the right shape for a precise source. It also means one month's
  reading is a handful of projects, not a rate.

---

## 3. Sources that name the designer

### 3.1 Brand and developer newsrooms

| Newsroom | Feed | Items/week | Names a design firm in title or summary | Verdict |
|---|---|---|---|---|
| Hilton Stories — `stories.hilton.com/feed` | works, full text (~9,600 chars) | 7.9 | 0 of 10, title, summary or body | DROP |
| Hyatt Newsroom — `newsroom.hyatt.com/news-releases?pagetemplate=rss` | works, 193-char summary | 3.7 | 0 of 10 | DROP |
| Four Seasons Press Room | no feed (three paths tried, all 404). Via Google News `site:`: 87 items in 30 days | ~20 | 0 of 100 titles. Festive dining and spa programmes. Filtered to announcement verbs: 9 items in 30 days, 1 project | DROP |
| Marriott News Center | `/feed/` and `/rss` return an HTML app shell. Via Google News `site:` with luxury brands: 0 items | — | — | DROP |
| Rosewood, Auberge, Aman, Montage | no feeds (HTML, 404, HTML, 403). Via Google News `site:`: job posts, "In Villa Pizza Class", gift guides | — | 0 of 12 | DROP |
| IHG (Kimpton) | `/en/rss/news` 404. URL guessed | — | — | not verified |
| Accor press | `press.accor.com/feed/` 403 | — | — | DROP |
| Ennismore | `ennismore.com/feed/` valid RSS, zero items | — | — | DROP |
| PR Newswire, hotels and resorts list | works, 289-char summary | ~65 (20 items in 2 days, each release in up to four languages) | 0 of 20 | DROP |

The Hilton and Hyatt items in the window: Hilton passing 60 hotels in Egypt, a Vietnam
partnership, a Tapestry opening in Hong Kong, LXR in Rome; Hyatt Regency Gold Coast, Park
Hyatt Brisbane, Thompson Seville, a loyalty programme. Brand-level, mostly abroad, and the
designer is not in the feed. This agrees with the July report's finding on brand newsrooms
(0–1 qualifying in 60 days).

The premise that press rooms name the designer may still be true of the release *body*. For
Hilton, the one feed that ships the body, a phrase search over ten full releases found none.

### 3.2 The source that does name designers

**Hospitality Design, through Google News.** Its own feed is 403. The query
`when:30d site:hospitalitydesign.com (unveils OR "to open" OR "set to open" OR debut OR coming
OR revives OR "breaks ground" OR residences)` returned 29 items inside 30 days, about 7 a
week. In the 26 newest:

- **8 are in-scope projects** under the new rule: Amantaru in Puerto Rico, Fouquet's first US
  residences in Miami, The StandardX in Times Square, La Fontaine in Century City, Corinthia's
  Grace Bay development, Royal Palm South Beach's $100M transformation, Lone Mountain Ranch's
  Bison Lodge, the Huntington Hotel in San Francisco. (Saverne's location is not in its
  headline, so it is not counted.)
- **4 name the designer in the headline:** *Ken Fulk Revives San Francisco's Huntington
  Hotel*; *Modellus Novus Channels the Golden Age of Rail at Saverne*; *ROMEO Taps Kengo Kuma
  for Massa Lubrense Retreat*; *Piotr Wiśniewski Crafts a Sense of Place With weStudio*.
- The rest is trade-show coverage, product, weekly round-ups, and three European openings.

Round 1 rated it marginal at 3 clear of 17. With US projects in scope it is 8 of 26, and it
is the only source found whose headlines carry the designer. The limit is unchanged:
`hospitalitydesign.com` answers 403 to both of the pipeline's User-Agents, so the analyzer
gets the headline and nothing else. **AUTOMATE, as a headline source.**

**A phrase query that selects for it.** `when:14d (hotel OR resort OR residences) ("interiors
by" OR "interior design by" OR "designed by" OR "design by") ("to open" OR announces OR
unveils OR "breaks ground" OR planned)` — 179 characters, 32 items in 13 days. US in scope,
about 10: a wellness hotel in Palm Springs, Proper Hospitality's Minneapolis hotel in a
Yamasaki landmark (two outlets), a Clearwater Beach condo, Ytech's 75 Broadway in Brickell,
Mandarin Oriental West Palm Beach, sbe's The Estate, Amantaru, ORA by Casa Tua, 70 Mulberry.
Outside the US or already open: 13. None of the 32 *titles* names a designer; whether the
bodies do is what the phrase is meant to select and what I could not check from a feed. It
is proposed in §4 as the replacement for `GNews Hospitality Rollouts`.

### 3.3 Awards and shortlists

None has a feed. `boutiquedesign.com/feed/` is 403, `aheadawards.com/feed/` is 404, and HD
Awards live on the blocked Hospitality Design site. What was observed about timing, all from
items in the feeds above:

| Programme | Observed | Source of the observation |
|---|---|---|
| Gold Key Awards | winners published **2026-11-10**, at BDNY (show ran roughly 8–11 November) | Hospitality Design, via Google News |
| HD Awards | 23rd edition: submissions opened **2026-11-24**. 22nd edition: "deadline extended" post **2026-06-09** | same |
| AHEAD | **MEA** winners announced 2026-11-03 | Sleeper feed, round 1 |
| AHEAD Americas | **not observed** | — |

A winners list is one page a year naming forty firms with their projects. That is a manual
pull for the Cowork sweep in the week of BDNY, not a source row. The Hospitality Design query
above will surface the announcement when it happens.

---

## 4. Rewriting the queries that do not fit

Old and new fetched minutes apart on 2026-11-26. "Keep-class" is the coordinator's list:
luxury hospitality, branded or luxury residential, airport lounges, flagship cultural, and
design competitions for those. Counts are from the newest titles of each.

| Query | Old: chars · items · in last 30 d · keep-class | New: chars · items · in last 30 d · keep-class |
|---|---|---|
| Upstream · Entitlements & Rezoning | 293 · 40 · **3** · 0 of 22 | 194 · 19 · 19 · **6 clear + 7 arguable of 19** |
| Upstream · Cultural Capital Projects | 244 · 78 · 26 · 0 of 22 | 189 · 59 · 59 · **7 planned + 4 completed of 28** |
| Upstream · Competitions & RFPs | 225 · 64 · 17 · 0–1 of 22 | 184 · 20 · 20 · **5–6 of 20 (2 in the US)** |
| GNews Hospitality Rollouts | 195 · 62 · 16 · ~3 of 16 | 179 · 32 · 32 (14-day window) · **~10 US + 1 Middle East of 30** |
| GNews Hospitality US · Luxury Dev | 209 · 27 · 27 · round 1: 10 clear of 27 | 197 · **64** · 64 · 5 clear + 3 arguable US in the 26 newest |
| GNews Airport Lounges | 139 · 34 · **1** · — | 181 · 72 · 72 · 7 of 16 |

**Entitlements & Rezoning.** New:
`when:30d (rezoning OR "special permit" OR "planning commission" OR council) (approves OR
approved) ("luxury hotel" OR "boutique hotel" OR "luxury condo" OR "condo tower" OR "branded
residences")`. Clear: a hotel-condo tower on Congress Avenue in Austin (two outlets); luxury
hotel and condos at Suni Sands, Jupiter; Bertani condo tower, Boca Raton; zoning approved for
Milwaukee's first condo tower in 20 years; an Old Fourth Ward condo tower denied in Atlanta.
Arguable: small-city boutique hotels (Franklin, Holland, Daphne, Livermore). Noise, 6 of 19:
an Irish office conversion, a Cheltenham restaurant, Vancouver rentals. The old query's
subject was any land-use decision anywhere; the new one is a hotel or condo approval. No
geography group — it would not fit, and a US project is in scope wherever it is.

An earlier draft with `"site plan"` and bare `resort` returned 69 items led by RV resorts and
a Microtel. `resort` is out of the final version for that reason.

**Cultural Capital Projects.** New:
`when:30d (museum OR "performing arts center" OR "concert hall" OR "opera house") (expansion
OR "new building" OR "new wing" OR "capital campaign") (architect OR architects OR "designed
by")`. Planned: Brandywine Museum of Art's $100M expansion; the Perot Museum's expansion
plans; Hilliard Art Museum; Florence Griswold Museum breaking ground; a performing arts centre
in a historic theatre; the Art Gallery of Ontario's new wing (two outlets, Canada). Dropped by
design: `university`, `library`, `civic`, `cultural`, `competition`, `RFP` — the words that
brought debate prizes and library jumper contests. Still noisy (17 of 28: directors stepping
down, exhibitions, a Britannica entry), because "museum" plus "expansion" is a common pair.

**Competitions & RFPs.** New:
`when:30d ("design competition" OR "architecture competition" OR "invited competition" OR
"selected to design" OR RFP) (hotel OR resort OR museum OR "performing arts" OR "concert
hall")`. This one improves least. Keep-class: an architect selected for the new Art Gallery
of Greater Victoria (Canada); Portland's Waterfront Park competition; a museum ideas
competition in Italy (three rows); Roswell Museum. The July report concluded competitions
reach the pipeline through the design press anyway and that what is unique to the genre
fails the test; nothing here contradicts that.

**Hospitality Rollouts.** Not truncated at 195 characters, so this is a change of subject,
not a repair: the seeded query names London, Paris and Europe (79 of its 159 discoveries were
outside the US) and has no recency term, so its 62 items reach back to 2016 and only 16 fall
in the last 30 days. The proposed replacement is the designer-phrase query of §3.2. I also
tried keeping the verbs and adding `-London -Paris -Europe -India`: 18 of 26 items were still
abroad (Kerry, Beijing, Manila, Glasgow, the Algarve). Exclusions do not make a query
American; `gl=US` and the gate do.

**Hospitality US · Luxury Dev.** My round-1 query was 209 characters. Dropping `OR approved`
brings it to 197 and it returns 64 items instead of 27, with 74% of the old set inside the
new one. New US items the truncated version was not returning: Ritz-Carlton Residences
planned for Brooklyn Heights; the Nashville Gulch Ritz-Carlton sales gallery; a 145-room
hotel for the Fort Worth Stockyards; the status of an Atlantis hotel at Ko Olina.

**Airport Lounges.** Fits the limit but names Paris, London and Europe and has no recency
term: 34 items, one from the last 30 days, the rest back to 2017. That is consistent with its
row in the yield table (104 raw, 32 discoveries, **0 used**). New, New York and South Florida
airports only, since `GNews Airport Lounges US` covers the rest:
`when:30d (airport OR terminal) (lounge OR "first class" OR VIP) (design OR designed OR "to
open" OR unveils) ("New York" OR JFK OR LaGuardia OR Newark OR Miami OR "Fort Lauderdale")`.
72 items; 7 of the 16 newest are Cathay Pacific's first New York lounge and the airline moves
into JFK Terminal 6. About a third is consumer lounge guides.

**Not rewritten, and over the limit:** `Upstream · Aviation Programs` (318), `Hospitality
Pipelines` (259), `Capital for Pipeline` (253), `GNews Capital · Redev Acquisitions` (207).
The first two are the upstream lane's best performers in the yield table (36 of 37 and 53 of
71 discoveries used), so they work as they are and I would not touch them without the same
old-versus-new test. Hospitality Pipelines' 51 non-US discoveries are the missing geography
group showing.

### A caution on replacing upstream queries in place

The yield table says the three noisy upstream queries are *used*: 39, 22 and 45 rows in 90
days. My title read of what they return today found almost nothing in the keep-class. Both
can be true — "used" includes a match to an engaged account, and the value lane joins on
category and geography, not on luxury tier. So I cannot say from here that the rewritten
queries will produce more *used* rows, only that they produce more keep-class titles.

`raw_articles` records `source_feed_url`, so an `update … set url` cuts a source's yield
history at the change. That is useful here: after 30 days the same table gives the new
query's raw / disc / used under the same name, with a clean break.

---

## 5. Swaps

Each candidate checked against today's feed and the query-length table, not only the yield
table.

| Source | 90-day yield (raw / disc / used) | What I found | Verdict |
|---|---|---|---|
| **ArchDaily** | 1000 / 33 / 7 | 24 items in 1.1 days; the 14 newest are houses, pavilions, essays and an open call. Always has two new items, so it takes two launch slots every run for 7 uses in 90 days | **OFF. Agree** |
| **Urbanize Miami** | 2 / 1 / 0 | Feed is alive and nearly silent: 10 items spanning a year, one in the last 30 days. Florida YIMBY covers the same ground at 17 a week | **OFF. Agree** |
| **GNews Capital · Dev Funds** | 172 / 5 / 1 | 270 characters; the whole geography group is past the cutoff, so it has been a worldwide fund-raising query | **OFF. Agree** |
| **Upstream · Skift** | 429 / 8 / 6 | 10 items a day of airline, OTA and tourism-policy news (*Norse Atlantic suspends flights*, *Expedia to buy Kiwi.com*). The upstream lane has no classifier, so up to 429 full analyses bought 6 uses | **OFF. Agree** — on analyzer cost, not slots |
| **Upstream · Licenses & Approvals** | 103 / 2 / 2 | 293 characters; half its subject group and all its geography are lost | **OFF. Agree** |
| Upstream · Capital for Pipeline | 206 / 11 / 9 | 253 characters, geography lost. 4% of raw used, against 9–18% for the other upstream queries | Next to go; left on, not tested this round |
| GNews Airport Lounges | 104 / 32 / 0 | One item in the last 30 days (§4) | Rewrite, not off |
| Dezeen | 524 / 43 / 14 | 55 items a week, global design; 28 of 43 discoveries outside the US | Keep. Weakest remaining direct feed; revisit if a slot is needed |

Where the coordinator's list and mine differ: nowhere on the five named. I would add the
rewrite of `GNews Airport Lounges` (zero used in 90 days is a stronger signal than any of the
five) and flag `Capital for Pipeline`.

The upstream sources do not free launch slots. Turning off Skift and Licenses & Approvals
saves analyzer calls and unworked rows; it does not make room for the firm queries. The three
launch-lane switch-offs do.

---

## 6. Leftovers from round 1

- **Seattle Daily Journal of Commerce.** Retried: `djc.com/rss/` and the homepage both timed
  out at 30 seconds. Three attempts across two rounds, never a response. Unreachable from this
  network; still unverified from any other.
- **`site:hospitalitydesign.com`.** Re-evaluated in §3.2: 8 of 26 in scope, up from 3 clear of
  17. Recommended.
- **`site:bizjournals.com`.** Not re-fetched; the round-1 capture is from the same day. Every
  one of its clear items was already a US project (Daytona Beach Shores, Charleston, Houston,
  West Palm Beach, Austin, Miami Beach), so the count stands at 7–8 clear and 4 arguable of 46
  article titles, at 85 items a week. What changed is that all of them now pass the gate. Its
  problems are the same: `bizjournals.com` is 403 and paywalled, so headline-only; 17 of 96
  rows are section index pages. Business Journals items also turned up unprompted in at least
  four other queries this round (Charleston, Austin, Milwaukee, Fort Lauderdale, Miami), which says
  it is where regional development news is published. **Recommended as a trial**, to be
  judged in 30 days on the same raw / disc / used table.

---

## 7. Recommended changes (for Demi's approval)

### Off (5)

Launch: **ArchDaily**, **Urbanize Miami**, **GNews Capital · Dev Funds**.
Upstream: **Upstream · Skift**, **Upstream · Licenses & Approvals**.

### On (5) — all `project_launch`

1. **GNews Firms · NY Hospitality Designers** — 18 items in 30 days, 12 real, 9 outside New York.
2. **GNews Firms · NY Dev Marketing** — 7 items, 6 real, all for-sale projects.
3. **GNews Firms · NY Architects** — 12 items, 8 real. The weakest of the three; first to cut.
4. **GNews · Hospitality Design** — 7 a week, 8 of 26 in scope, designers in headlines.
5. **GNews · Business Journals Dev** — trial; 85 a week, headline-only.

### Rewritten (6)

Entitlements & Rezoning · Cultural Capital Projects · Competitions & RFPs · Hospitality
Rollouts · Hospitality US Luxury Dev · Airport Lounges.

### Resulting roster

Launch lane: 22 − 3 + 5 = **24 active sources, 48 of 50 slots.** Upstream lane: 8 − 2 = 6
active RSS sources, 12 of 50.

If only three launch additions are wanted, take 1, 2 and 4.

### Not recommended

Firm queries for South Florida (duplicate the seeded Florida feeds), California (no news),
and four other New York groupings. Every brand newsroom. PR Newswire.

---

## 8. What was not verified

- **The yield table and the live source count.** Taken from the coordinator's message. I did
  not query the database.
- **What Google does at the cut.** The 200-character boundary held in 27 controlled queries
  and six real ones. How the fragment at the boundary is parsed is not known; a hand-cut
  query did not reproduce the full one.
- **That the rewritten upstream queries produce more *used* rows.** They produce more
  keep-class titles. "Used" depends on the value lane's joins, which I did not run (§4).
- **Firm attribution.** For about two-thirds of the "real" firm-query items the pool firm is
  not in the headline. The tie to the firm rests on the single-firm runs, not on reading the
  article.
- **Whether designer-phrase items name a designer.** No title of 32 does. Bodies were not
  fetched.
- **One month, one day.** Every firm-query count is a single 30-day window fetched once, in
  Thanksgiving week. Google's result sets also shift with term order: the same seeded query
  with its groups reordered shared only 39% of items, with nothing truncated.
- **Two pool firms were not queried** (The Astor Companies, V Starr): Google returned 429.
  Six 429s in about 200 requests this round; the per-source probe in `POST /api/sources`
  could meet the same.
- **Recall of grouped queries.** Measured as lower than the union (§1.2); not measured by how
  much for each firm.
- **IHG's feed path was guessed.** A 404 there does not prove there is no feed.
- **AHEAD Americas timing.** Not observed in any feed.
- **DJC.** No response in three attempts.
- **Reachability of anything new from Vercel.** All five additions are Google News URLs, the
  same host as sources that already run in production. Not tested from there.

---

## 9. SQL for review — not a migration, not run

Each URL is the exact string fetched on 2026-11-26, and each decoded query is 200 characters
or under. Three statements; run any subset.

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- REVIEW ONLY. docs/source-viability-report-2026-11-26-round2.md
-- Google News reads the first 200 characters of a query (report §1.1).
-- Every query below was measured at or under that length.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Switch off ────────────────────────────────────────────────────────────
update sources set active = false where name in (
  'ArchDaily',                      -- 1000 raw / 33 disc / 7 used in 90 d. 24 items in 1.1 days today, none a US project
  'Urbanize Miami',                 -- 2 raw / 1 disc / 0 used. Feed alive, 1 item in the last 30 days
  'GNews Capital · Dev Funds',      -- 172 / 5 / 1. Query is 270 chars: its whole geography group is never read
  'Upstream · Skift',               -- 429 / 8 / 6. No classifier in this lane: up to 429 full analyses for 6 uses
  'Upstream · Licenses & Approvals' -- 103 / 2 / 2. Query is 293 chars: half the subject group and all geography lost
);

-- ── 2. New sources (launch lane: 22 - 3 + 5 = 24 active, 48 of 50 slots) ─────
insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  -- 189 chars. 18 items / 30 d: 12 real project items about a pool firm (6 new, 6 completed), 9 outside New York, 6 noise
  ('GNews Firms · NY Hospitality Designers', 'https://news.google.com/rss/search?q=when:30d+(%22Yabu+Pushelberg%22+OR+%22Tihany+Design%22+OR+%22Jeffrey+Beers%22+OR+%22Roman+and+Williams%22+OR+%22Post+Company%22+OR+%22Islyn+Studio%22+OR+%22dash+design%22)+(hotel+OR+resort+OR+residences+OR+restaurant)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 182, 'project_launch'),
  -- 195 chars. 7 items / 30 d: 6 real, all for-sale projects (ELIE SAAB Maison 171, The Darwyn, Raffles Coconut Grove), 3 outside New York, 1 noise
  ('GNews Firms · NY Dev Marketing',         'https://news.google.com/rss/search?q=when:30d+(%22Corcoran+Sunshine%22+OR+%22Elliman+Development+Marketing%22+OR+%22Stevens+Development+Marketing%22+OR+%22Compass+Development+Marketing%22+OR+%22SERHANT+New+Development%22)+(condo+OR+residences+OR+tower)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'luxury_residential', true, 184, 'project_launch'),
  -- 187 chars. 12 items / 30 d: 8 real (5 new, 3 completed), 4 of the 5 new outside New York, 4 noise. Weakest of the three firm queries
  ('GNews Firms · NY Architects',            'https://news.google.com/rss/search?q=when:30d+(%22Handel+Architects%22+OR+%22Fogarty+Finger%22+OR+%22Studio+Gang%22+OR+%22Rafael+Vi%C3%B1oly+Architects%22+OR+%22INC+Architecture%22+OR+%22SO-IL%22+OR+%22Pei+Cobb+Freed%22)+(tower+OR+hotel+OR+condo+OR+museum)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'mixed_use', true, 186, 'project_launch'),
  -- 138 chars. 29 items / 30 d (~7 a week): 8 of 26 in scope, 4 of 26 name the designer in the headline. Headline-only: the site is 403 to enrichment
  ('GNews · Hospitality Design',             'https://news.google.com/rss/search?q=when:30d+site:hospitalitydesign.com+(unveils+OR+%22to+open%22+OR+%22set+to+open%22+OR+debut+OR+coming+OR+revives+OR+%22breaks+ground%22+OR+residences)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'hospitality', true, 188, 'project_launch'),
  -- TRIAL. 85 items / 7 d: 7-8 clear + 4 arguable of 46 article titles, all US. Headline-only and paywalled; 17 of 96 rows are index pages. Judge on raw/disc/used after 30 days
  ('GNews · Business Journals Dev',          'https://news.google.com/rss/search?q=when:7d+site:bizjournals.com+(hotel+OR+resort+OR+condo)+(luxury+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+boutique)+(proposed+OR+planned+OR+%22breaks+ground%22+OR+developer)&hl=en&gl=US&ceid=US:en', 'rss', 'global', 'general', true, 190, 'project_launch')
on conflict (url) do nothing;

-- ── 3. Rewritten queries ─────────────────────────────────────────────────────
-- An in-place url change starts a new yield history for the source (raw_articles.source_feed_url).

-- Old: 293 chars, geography never read; 3 items in the last 30 days, 0 keep-class of 22.
-- New: 194 chars; 19 items in 30 days, 6 clear + 7 arguable luxury hotel/condo approvals.
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(rezoning+OR+%22special+permit%22+OR+%22planning+commission%22+OR+council)+(approves+OR+approved)+(%22luxury+hotel%22+OR+%22boutique+hotel%22+OR+%22luxury+condo%22+OR+%22condo+tower%22+OR+%22branded+residences%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Entitlements & Rezoning';

-- Old: 244 chars, geography never read; 0 keep-class of 22 (debate prizes, library contests).
-- New: 189 chars; 59 items in 30 days, 7 planned + 4 completed museum projects of 28.
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(museum+OR+%22performing+arts+center%22+OR+%22concert+hall%22+OR+%22opera+house%22)+(expansion+OR+%22new+building%22+OR+%22new+wing%22+OR+%22capital+campaign%22)+(architect+OR+architects+OR+%22designed+by%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Cultural Capital Projects';

-- Old: 225 chars; 17 items in the last 30 days, 0-1 keep-class of 22.
-- New: 184 chars; 20 items in 30 days, 5-6 keep-class of 20 (2 in the US). The smallest gain of the six.
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(%22design+competition%22+OR+%22architecture+competition%22+OR+%22invited+competition%22+OR+%22selected+to+design%22+OR+RFP)+(hotel+OR+resort+OR+museum+OR+%22performing+arts%22+OR+%22concert+hall%22)&hl=en&gl=US&ceid=US:en'
 where name = 'Upstream · Competitions & RFPs';

-- Old: 195 chars (fits); names London/Paris/Europe, no recency: 16 items in the last 30 days, ~3 in scope; 79 of 159 discoveries non-US.
-- New: 179 chars; 32 items in 14 days, ~10 US + 1 Middle East in scope of 30. A change of subject, not a repair.
update sources set url = 'https://news.google.com/rss/search?q=when:14d+(hotel+OR+resort+OR+residences)+(%22interiors+by%22+OR+%22interior+design+by%22+OR+%22designed+by%22+OR+%22design+by%22)+(%22to+open%22+OR+announces+OR+unveils+OR+%22breaks+ground%22+OR+planned)&hl=en&gl=US&ceid=US:en'
 where name = 'GNews Hospitality Rollouts';

-- Old (round 1): 209 chars, last group cut; 27 items in 14 days.
-- New: 197 chars ("OR approved" removed); 64 items in 14 days, 74% of the old set retained.
update sources set url = 'https://news.google.com/rss/search?q=when:14d+(%22luxury+hotel%22+OR+%22luxury+resort%22+OR+%22Four+Seasons%22+OR+%22Ritz-Carlton%22+OR+Rosewood+OR+Auberge+OR+%22St.+Regis%22)+(%22breaks+ground%22+OR+proposed+OR+planned+OR+unveils)+(developer+OR+development)&hl=en&gl=US&ceid=US:en'
 where name = 'GNews Hospitality US · Luxury Dev';

-- Old: 139 chars (fits); names Paris/London/Europe, no recency: 1 item in the last 30 days; 104 raw / 32 disc / 0 used.
-- New: 181 chars; 72 items in 30 days, 7 of the 16 newest are new New York lounges.
update sources set url = 'https://news.google.com/rss/search?q=when:30d+(airport+OR+terminal)+(lounge+OR+%22first+class%22+OR+VIP)+(design+OR+designed+OR+%22to+open%22+OR+unveils)+(%22New+York%22+OR+JFK+OR+LaGuardia+OR+Newark+OR+Miami+OR+%22Fort+Lauderdale%22)&hl=en&gl=US&ceid=US:en'
 where name = 'GNews Airport Lounges';

-- ── Verify (optional) ────────────────────────────────────────────────────────
--   select discovery_kind, count(*) filter (where active) as active
--     from sources where source_type = 'rss' group by 1;
--   -- expect project_launch = 24, opportunity_signal = 6
```

`supabase/schema.sql` is idempotent and re-seeds URLs with `on conflict (url) do update`. If
these rewrites are applied to the live table only, the next `schema.sql` run re-inserts the
old URLs as new active rows beside them. The seed has to change with the table.

---

## 10. Diff summary

**Added:** this report. Nothing else.

**Touched:** nothing. No existing file edited, no migration written, no row changed, the app
not run, nothing committed.

**Observed, not caused:** `supabase/schema.sql` was modified and uncommitted in the working
tree during the probe (the two Europe feeds set inactive). Read, not modified.

**Scratch:** captures and scripts for this round are under
`/private/tmp/claude-501/-Users-demian-claude-oaki-sales-pipeline/b5b4069b-d5d8-402a-9548-5cd5494649cb/scratchpad/r2/`
(`feeds/`, `scripts/`, `urls.txt`). Session-scoped; may be cleared.

**Deliberately left alone:**
- The four over-length queries not in the brief (Aviation Programs, Hospitality Pipelines,
  Capital for Pipeline, Redev Acquisitions). Two of them are the upstream lane's best
  performers as they stand.
- Dezeen, and `Upstream · Capital for Pipeline`.
- The round-1 report. Its §1.3 guessed at a word limit of about 32; §1.1 here supersedes it.
