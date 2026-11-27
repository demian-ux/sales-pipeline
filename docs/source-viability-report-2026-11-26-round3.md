# Source Viability Report, Round 3: Scouts and a Jury

**Date:** 2026-11-26. Same day as rounds 1 and 2. The firm-geography rule is live at `c97dbb9`.
**Trigger:** "send out several Opus agents to look for better sources, and have some of them
judge what the others find."
**Method:** five scouts searched from different angles. Three jurors then re-tested every
finding on their own (§1). This report collects the result. It adds no sources of its own.
Where a juror's measurement differs from a scout's, the juror's number is the one used.
**Scout notes:** `docs/source-round3/{registros,firmas,pipeline,licitaciones,exterior}.md`.
**Status:** waiting for Demi's approval. **No existing file was changed, nothing was
inserted, the app was not run and nothing was committed.**

---

## 0. Verdict

> **The scouts brought 25 findings. The jury accepted one and put four on trial. Eight are
> pending and twelve were rejected. Only one source clearly feeds the CRM better than what is
> live: PROFILEmiami's Squarespace RSS. It is full text, early stage, and it names the
> architect, the interior designer and the sales agency.**

1. **Accepted (1):** PROFILEmiami. All three jurors voted accept (average 8.7).
2. **On trial (4):** CJ Invest Projects (6.7), King & Partners (6.0), GNews Sales launches
   (5.3) and GNews Caribbean development (5.0). The fourth went through with one juror at backlog.
3. **The launch lane has room for one more source**, so only PROFILEmiami goes into the SQL
   (§8). CJ Invest Projects is next in line. It would replace Dezeen. The other three trials wait.
4. **Google News counts did not hold up.** On the same URLs, one query went from 63 to 29
   items, another from 31 to 65 and a third from 19 to 8. Treat a Google News count as a
   snapshot of one moment, not a steady yield.
5. **Firm-owned feeds do not justify a new lane.** 32 of 191 pool domains have a live feed,
   and together they produce 0.3 to 1 early, in-profile item a month.
6. **Public records:** the best idea that needs code is the SF Planning Socrata reader. It is
   about 50 lines, costs no Claude calls and comes in at about 0.5 records a week (§6).
   Everything else in public records was too late, never named a firm, was stale, or was blocked.

---

## 1. Method

### Scouts (5 angles)

| Scout | Angle | Probed | Findings |
|---|---|---|---|
| registros | Public records and agendas (Socrata, ArcGIS, Legistar) | ~25 endpoints, ~50 Legistar slugs | 3 |
| firmas | The firms' own feeds | all 191 pool domains + 24 guessed + 12 controls | 7 |
| pipeline | Project trackers and local development press | ~70 URLs + 4 Google News queries | 3 |
| licitaciones | Airports, culture and competitions | ~45 sources + 8 Google News designs | 7 |
| exterior | Caribbean, Middle East and resort markets | ~70 URLs + 20 Google News queries | 5 |

### Jurors (3 lenses, each refetching every finding on its own)

- **medicion** reproduced each measurement. It refetched the exact URL, recounted items, date
  windows, in-scope items and firm-named items, and checked that the scout's samples appeared.
- **ingesta** checked whether the CRM can ingest the source and at what cost. It ran every
  feed through the repo's own `rss-parser`, using `fetchRSSFeed`'s exact UA and Accept header.
  It fetched article pages with the enrichment UA `OakiDiscoveries/1.0 (research reader)`, and
  it decoded every Google News `q=`. Its cost model comes from the code: 4 runs a day, a cap
  of `MAX_PER_SOURCE = 2` new items, a 365-day freshness window (so a new feed drains its
  back-catalogue at 2 per run), and enrichment only below 600 characters of content.
- **encaje** judged client fit, duplication and noise. Would a salesperson get a reason to
  write to a named firm in the focus geos? Does a live source already carry the story? How many
  of 10 items get thrown away?

### Decision rule

- **aceptada / a_prueba (goes forward):** at least two jurors at accept or trial, and no
  juror at reject. A source is `aceptada` when the jurors are at accept, and `a_prueba` when
  they are at trial.
- **rechazada:** two or more jurors at reject. Every rejected finding meets this.
- **pendiente:** everything else. Some jurors are at backlog, or a single reject sits against
  two backlogs.

All 25 findings were refetched by all three jurors (75 votes, `refetched: true` on each).

---

## 2. Outcome table

Verdicts: A = accept, T = trial, B = backlog, R = reject. Score out of 10.

| # | Finding | Scout | Outcome | Avg | medicion | ingesta | encaje |
|---|---|---|---|---|---|---|---|
| pipeline-1 | PROFILEmiami (Squarespace RSS) | pipeline | **aceptada** | 8.7 | A 9: every claim reproduced, full text in the feed, team credits on ~10 early items | A 9: 20 items, median 2,358 chars, no enrichment needed, ~0.8/day | A 8: the only finding that names architect, interior designer and sales agency; ~2/10 overlap with FY/TRD |
| exterior-1 | Caribbean Journal · CJ Invest Projects | exterior | **a_prueba** | 6.7 | T 7: page 1 is ~50% in scope; developers named, 0 designers | A 8: rss-parser reads it (the scout had only regex-parsed it); teasers clear 600 chars | T 5: real early luxury projects, no duplication; never names designers |
| firmas-1 | King & Partners news feed | firmas | **a_prueba** | 6.0 | T 6: ~1 item a month, reposts; the agency itself is a target | T 7: ~10 one-off classifier calls, then ~1 a month | T 5: every item is a reason to write to a pool agency; ~6/10 thrown away |
| pipeline-2 | GNews · Sales launches | pipeline | **a_prueba** | 5.3 | T 6: 29 items, not 63; in-scope share ~50%; titles only | T 5: unstable count; every item needs resolve + fetch + classify | T 5: ~1/3 duplicates PROFILEmiami/live, ~1/3 foreign or listicle |
| exterior-2 | GNews · Caribbean development (198 chars) | exterior | **a_prueba** | 5.0 | T 6: 34 items, 7 distinct stories, 0 firms in titles | T 5: at 198 chars, any edit breaks it; ~1/3 degrade to title-only | **B 4**: ~5/10 noise or duplicate; competes with CJ Projects, which is cleaner |
| registros-1 | SF Planning Records · Projects (Socrata) | registros | pendiente | 6.0 | T 7: every number reproduced; ~3 for-sale projects in 5.5 months | B 7: ~50-line ny-native case, 2–3 h, 0 Claude calls | B 4: early and in geo, but ~7/10 rentals or bad data |
| firmas-2 | bKL Architecture feed | firmas | pendiente | 5.0 | B 5: the early items are 5+ months old | T 7: valid and very cheap | B 3: 0 of the last 5 items is a reason to write |
| exterior-4 | Hotel News Resource · Caribbean | exterior | pendiente | 5.0 | B 4: ~1 in-scope item every 2–3 months | T 8: enrichment works with the repo UA, 7–8k-char bodies | B 3: ~7/10 noise; designers named are not in the focus geos |
| licitaciones-1 | GNews · Cultural architect selections | licitaciones | pendiente | 4.3 | B 4: 65 items, not 31; 3 of 5 samples gone; ~11% in scope | T 6: valid upstream row, but ~1.6 full analyses a day | B 3: 6 overlap the live Cultural query; ~8–9/10 thrown away |
| firmas-4 | Swedroe Architecture feed | firmas | pendiente | 4.0 | B 5: ~3 items a year | B 4: `#new_tab` on links defeats dedup | B 3: recent output is completions only |
| registros-2 | Hollywood FL Legistar (PDB) | registros | pendiente | 3.7 | B 5: window is 113 days, not 63; 1 in-scope item | B 4: generic Legistar fetcher 4–6 h | **R 2**: small local architects on 4-story rentals |
| licitaciones-2 | Airport Improvement magazine | licitaciones | pendiente | 3.3 | B 4: 1 of 20 names a firm; that hit is already live | B 5: ~8 classifier calls a day for ~2 hits in 36 days | **R 1**: ~19/20 noise |
| exterior-5 | Bahamas DEPP EIA register (WP API) | exterior | pendiente | 2.7 | B 3: 2 new resort filings in 2026; PDFs not opened | **R 2**: fetcher 2–3 h + PDF 4–8 h for ~2 a year | B 3: worth it only if the PDFs credit Miami/NY teams |
| exterior-3 | Caribbean Journal · CJ Invest (all) | exterior | rechazada | 4.3 | R 4: a superset of exterior-1 plus listings | B 7: ~3× the classifier calls of exterior-1 | R 2: adds ~1 project per 10 items |
| pipeline-3 | Urbanize Chicago | pipeline | rechazada | 4.0 | R 3: small rentals and institutional work | B 7: ingests with no work, ~2 calls a day at near-zero fit | R 2: ~9/10 thrown away |
| licitaciones-3 | GNews · California themed studios | licitaciones | rechazada | 3.3 | R 3: 8 items, not 19; one commission | R 5: unstable and tiny | R 2: one Louisville commission in 60 days |
| firmas-6 | Riverside Investment & Development | firmas | rechazada | 3.0 | R 2: rental, office, a steakhouse | R 5: ~12 initial calls on off-profile content | R 2: 0 condo or hotel items |
| licitaciones-4 | GNews · Lounge programme announcements | licitaciones | rechazada | 3.0 | R 4: no designer, already covered; one 429 | R 4: ~1 consumer-guide item a day | R 1: 34 of 79 titles already live |
| firmas-5 | Related Companies newsroom | firmas | rechazada | 2.7 | R 2: effectively dormant | R 4: 2 items a year, the same story twice | R 2: one Austin launch a year |
| firmas-3 | HPA press feed | firmas | rechazada | 2.3 | R 3: tiny batch reposts | R 2: content empty, pages return 500, title-only | R 2: ~5 of 6 not a reason to write |
| registros-3 | Coral Gables FL Legistar (DRC) | registros | rechazada | 2.0 | R 3: 2 ambiguous items, no firm | R 2: no planning type; would need 1–2 days of PDF parsing | R 1: ~9.5/10 housekeeping |
| firmas-7 | SJP Properties feed | firmas | rechazada | 1.7 | R 1: one topping-out under 10 headlines | R 3: ~63-call initial drain, off profile | R 1: rental and office, self-duplicated |
| licitaciones-7 | Bustler competitions | licitaciones | rechazada | 1.7 | R 1: wrong content | R 4: every item passes the keyword gate | R 0: 10 of 10 thrown away |
| licitaciones-6 | Legistar (Denver, Broward) concessions | licitaciones | rechazada | 1.0 | R 1: 13 matters, not 15; concessions only | R 2: 4–6 h fetcher for concessionaires | R 0: no designer, no fit |
| licitaciones-5 | PANYNJ solicitations (AEM model.json) | licitaciones | rechazada | 0.7 | R 1: 0 lounge/interior/hotel hits | R 1: 4–6 h parser for 0 rows | R 0: infrastructure procurement |

**Totals:** 25 findings. 1 aceptada, 4 a_prueba, 8 pendiente, 12 rechazada.

---

## 3. Accepted and on-trial sources

### 3.1 PROFILEmiami — aceptada (8.7)

`https://profilemiami.com/miamirealestate?format=rss`. The site's `/feed` returns 404, and
only the Squarespace collection URL works. That is probably why earlier rounds missed it.

- **medicion:** HTTP 200, 20 items from 2026-10-30 to 2026-11-25 (26 days). The credits are
  in the body: Arquitectonica + Meyer Davis + Fortune (Midtown Park), Fogarty Finger
  (SB/Hazelton), Meyer Davis (THE WELL), ODP + SWA + Fortune (LILLI), Arquitectonica + Studio
  Munge (EDITION), KPF + ACPV + Cervera (75 Broadway), Douglas Elliman Development Marketing
  (Raffles) and Gensler (ICA). That comes to about 10 early in-scope items. The 7 out-of-scope
  items are listings, a café and an insurance ad. The ATMA item has no firm credit in its body,
  which corrects the scout's "all 10".
- **ingesta:** 200 `application/rss+xml` with the fetcher's exact headers. All 20 items have
  title, link and date, and all 20 fall in the last 30 days. Median content is 2,358
  characters and every item is at 600 or more, so no enrichment fetch happens. The article page
  also returns 200 to the `OakiDiscoveries` UA (~8.7k chars). At ~0.8 items a day it is under
  the 2-per-run cap, which is at most about 3 classifier calls a day.
- **encaje:** team credits in 11 of 20 bodies, and an exclusive sales agency on 3. Title
  overlap with Florida YIMBY pages 1–3 and TRD Miami is 2 stories (Midtown Park, Hazelton).
  About 6 of 20 are noise. Where it overlaps the sales-launch and cultural queries (Raffles,
  LILLI, ICA Miami), PROFILEmiami should be the copy that survives, because only it carries
  the credits.
- **Known cost:** post-analysis dedup against Florida YIMBY and TRD Miami. All three jurors
  flag this, and none treats it as a blocker.

### 3.2 CJ Invest Projects — a_prueba (6.7)

`https://www.caribjournal.com/cj-invest-news/projects/feed/`. This is the paid desk's own
feed, not the consumer feed round 1 dropped.

- **medicion:** 200, 10 items on page 1, from 2026-08-27 to 2026-11-24 (89 days). The teasers
  name IDILIQ, Grupo Nivel and Orange Limited/Daniel Shamoon. 5 items are clearly in scope:
  the Mandarin Oriental launch, the $1B Ritz-Carlton, Nikki Beach Antigua, Nobu and the Shamoon
  resort. Wyndham Grand is arguable. **0 designers.** The scout's Puerto Rico, Faena and
  Anguilla samples are on page 2, which this juror did not refetch.
- **ingesta:** this is the first run through the real `rss-parser`. The scout had used a
  regex. 10 items, all fields present, 3 in the last 30 days. Median content is 770 characters
  and all 10 are at 600 or more, so enrichment is skipped. That matters, because the page is
  only the teaser plus boilerplate. Cost is about 0.1 items a day, with about 10 one-off
  classifier calls.
- **encaje:** about 6 of 10 are at project stage. None of the 10 titles appears in the
  Caribbean Google News result or in the live feeds. The teasers name brands and sometimes
  developers, and those developers are mostly not focus-geo firms (Faena is Miami-based).
- **Unanimous:** keep this one over CJ Invest (all) and over GNews Caribbean.

### 3.3 King & Partners — a_prueba (6.0)

`https://www.kingandpartners.com/feed`. A New York new-development and hospitality
marketing agency in the pool (parked).

- **medicion:** 200, 10 items from 2026-01-20 to 2026-10-12 (265 days). In scope: Auberge
  Dallas (pre-launch), Fouquet's Miami (upcoming), Chipperfield Miami Design Residences, and
  arguably the Naples resort (already open). One Boca Raton awards story takes up 4 rows.
- **ingesta:** all 10 items fall inside 365 days, 0 inside 30 days and 1 inside 90. Median
  content is 592 characters, and 6 of 10 are under 600, so most items trigger enrichment. The
  pages are thin reposts of ~1.1k characters including the nav, so enrichment adds little.
  Cost is about 10 one-off calls, then about 1 a month.
- **encaje:** 3 to 4 usable items, each one a reason to write to King & Partners about a named
  client project. The items are late reposts.
- **Judge on yield.** All three jurors call it cheap.

### 3.4 GNews · Sales launches — a_prueba (5.3)

The decoded `q` is 170 characters, with `when:30d` first.

- **The scout's count did not reproduce.** All three jurors got **29 items, not 63**, from
  2026-10-29 to 2026-11-26. Four of the five samples are present. Four Seasons Colorado is not.
- **medicion:** about 15 rows (13 distinct stories) are clear US/Florida for-sale launches. The
  in-scope share is higher than the scout claimed (about 50% against 35%).
- **ingesta:** median content is 98 characters, so every item needs the Google News resolver
  plus a publisher fetch. One sample is from The Business Journals, which is known to return
  403. That is about 8 classifier calls a day at the cap.
- **encaje:** 10 of 29 overlap by title with live sources or PROFILEmiami: Raffles, LILLI and
  Ytech are in PROFILEmiami; Kadima and 2200 Brickell are in Florida YIMBY; ELIE SAAB is in NY
  Dev Marketing; Mandarin Kanai is in Branded Residences. About 7 are non-US and 3 are Haute
  Living guides. **0 titles name an architect.** Trial it only if a slot remains after
  PROFILEmiami.

### 3.5 GNews · Caribbean development — a_prueba (5.0), contested

The decoded `q` is 198 characters, at the edge, with `when:30d` first.

- **medicion (T):** 34 items from 2026-10-29 to 2026-11-25, and all 5 samples present. About 17
  rows in 7 distinct stories: Amantaru ×6, Pendry ×4, Montage ×3, Waldorf, MO Cayman, Nobu
  Bahrain and FS Cherry Creek. 0 firms in titles.
- **ingesta (T):** valid today, but any edit pushes it past 200 characters. About 99
  characters of content per item. The scout reported 9 of 24 bodies returning 403, so about a
  third degrade to title-only.
- **encaje (B):** 7 overlap live sources (Amantaru ×3 and Nobu Bahrain in Branded Residences;
  two items in Hospitality US · Luxury Dev). About 14 are consumer or travel noise. About 10 are
  distinct early projects.
- **Where the jurors disagree.** medicion and ingesta judge it as a working row whose numbers
  reproduce. encaje judges what it adds next to CJ Invest Projects, which covers the same
  region with cleaner items and no duplication, and finds that it adds little. The rule puts it
  on trial (two trials, no reject). But all three jurors' remarks say CJ Projects should go in
  first. So this is the last candidate in the queue, not a parallel trial.

---

## 4. Pending — what would settle each one

| Finding | Votes | What would settle it |
|---|---|---|
| **registros-1** SF Planning Socrata | T / B / B | Agreement that the code is worth it (§6). The record is clean and early, but needs filters: drop records with `record_status` cancelled (the top row, 984 Dolores, is "Closed - Cancelled" with 611 units on an ADU), add a units sanity cap, and exclude law-firm `applicant_org` (7 of 12 are Reuben Junius & Rose or J. Abrams Law). It would be built together with other Socrata work. After that it becomes a trial. |
| **firmas-2** bKL Architecture | B / T / B | An early-stage post (filing or approval) in the next 90 days, and confirmation that 201 E Walton and 1415 N Dayton are condo, not rental. Neither is verified. Cost is not the issue (ingesta: ~1.5 a month). |
| **exterior-4** Hotel News Resource Caribbean | B / T / B | A check of whether the enriched bodies ever name a focus-geo designer. So far they name HKS + ROAM, Isay Weinfeld and James Hamilton, none of them in the focus geos. Enrichment works (ingesta), but the yield is about 1 in-scope item every 2–3 months and it overlaps CJ. |
| **licitaciones-1** GNews Cultural selections | B / T / B | A tighter query: `when:30d` (ingesta: 48 items, not 65) plus US-only terms. The fit of the `when:30d` version was not scored, and it must be measured before a trial. In the upstream lane every item gets a full analysis: about 1.6 a day, not the scout's "4 a week". |
| **firmas-4** Swedroe | B / B / B | Strip `#new_tab` from links, or link-based dedup will fail and overlapping stories get analysed twice. And it needs early-stage output, not completions. At about 3 items a year it hardly matters. |
| **registros-2** Hollywood FL Legistar | B / B / R | A generic Legistar fetcher built for some other reason. On its own, 1 plausible hit in about 4 months (PRH 1301 S Ocean) does not justify 4–6 h. Nobody opened the 1301 S Ocean item to see what the project is (encaje's keywords missed it). |
| **licitaciones-2** Airport Improvement | B / B / R | Nothing near term. Every item passes the keyword gate, which costs about 8 classifier calls a day, and its one clear hit (Gensler at Sea-Tac) already arrives through GNews Airport Lounges US. |
| **exterior-5** Bahamas DEPP | B / R / B | Open a few EIA PDFs and check whether they credit Miami or New York design teams. If they do not, drop it. Real new filings come in at about 2 a year. |

---

## 5. Rejected, grouped

**Duplicates of a better finding**
- **exterior-3 CJ Invest (all)** is a noisier superset of CJ Invest Projects: auctions,
  listings and brokerage news. 9 items in 30 days, about 3× the classifier calls, for about 1
  extra project per 10 items.

**Off-profile content (rental, office, institutional)**
- **pipeline-3 Urbanize Chicago** names the architect in every item. But the firms are local
  Chicago practices working on small rentals and institutional buildings, and Chicago is a
  hand-picked geo only. Ingesta would accept it on cost alone. Two jurors reject it on fit.
- **firmas-6 Riverside**: 0 condo or hotel items in 20.
- **firmas-7 SJP Properties**: 99 items, with one rental topping-out under 10 headlines. Each
  copy costs a full analysis, because syndicated duplicates only collapse after analysis.

**Dormant or too small**
- **firmas-5 Related Companies**: 2 items in 365 days, both the same One Lady Bird Lake launch.
- **firmas-3 HPA**: 6 items with empty content, and article pages that return 500. Only the
  title would reach the analyzer.
- **licitaciones-3 California themed studios**: 8 items now, not 19. One real commission
  (BRC / Muhammad Ali Center).

**Never names a design firm**
- **licitaciones-4 Lounge programmes**: 0 designers. 34 of 79 titles already come in through
  the live lounge queries, and the rest are mostly consumer guides.
- **registros-3 Coral Gables Legistar**: 363 matters with no planning type and 0 firm names.
  Names would need Board of Architects PDF parsing (1–2 days).
- **licitaciones-6 Legistar Denver/Broward**: concession operators only. 13 Denver matters,
  not 15. Broward was not refetched.
- **licitaciones-5 PANYNJ**: 0 lounge, interior or hotel hits in a 614 KB model.json.

**Wrong content**
- **licitaciones-7 Bustler**: ideas competitions and European calls. 0 of 10 in scope.

The scouts' tried-and-dropped lists (in their notes) are not repeated here. Main patterns:
issued-permit datasets come too late and name contractors or individuals. Resort-market local
press had 0 in scope across about 70 items. Gulf trade feeds named 0 focus-geo firms across
about 340 items. Giga-project newsrooms returned 403 or 404. Squarespace `?format=rss` is live
on only 4 of 38 Squarespace pool sites.

---

## 6. Ideas that need code (proposals, not changes)

The size estimates are the ingestion juror's. Structured sources insert without a Claude call.

| Idea | Size (ingesta) | Yield measured | Assessment |
|---|---|---|---|
| **`socrata_sfplanning` case in `ny-native.ts`**, modeled on `fetchZapProjects` (45 lines). 120-day lookback, the scout's filter, plus: drop cancelled `record_status`, a units sanity cap, and law-firm exclusion on `applicant_org`. `pim_link` as the URL, dedup on address. Note `data.sfgov.org` now 301s to `data.sf.gov`. | **~50 lines, 2–3 h with testing; 0 Claude calls** | 12 large filings in ~5.5 months (~0.5/week); ~3 clear for-sale/hotel fits; architect named on 3 of 12 (one, Stanton Architecture, is a pool firm) | **The cheapest and most valuable of the code items.** It is the only early, in-geo, unduplicated public record found. Volume is low. |
| **Generic Legistar matters fetcher**: OData filter, `MatterTypeName` whitelist, APPLICANT/REQUEST regex, dedup on `MatterFile`. | **4–6 h** | Hollywood: 1 plausible hit in ~4 months. Coral Gables: 0 names without PDF parsing (+1–2 days). Denver/Broward: concessions only. | Not justified by any single city measured. |
| **Bahamas DEPP media-endpoint fetcher** | **2–3 h, + 4–8 h for PDF text extraction** | ~2 new resort filings a year | Only after a manual PDF check shows design-team credits. |
| **PANYNJ model.json walker + HTML-table parser** | **4–6 h** | 0 in-scope rows | Do not build. |
| **"Firm feeds" lane**. Per the firmas scout it would need: a one-row, many-URL source type; its own cap outside `MAX_NEW_PER_RUN`/`MAX_PER_SOURCE`; a 30–45 day freshness window; title-level dedup for syndicated posts; rejection of page-edit and "Hello world!" feeds; `company_id` passed to the analyzer; and health tracked per feed. | No juror estimate | 32 live feeds, ~39 items a month, 0.3–1 early in-profile item a month | **Not justified** (scout and jurors agree). Single-firm Google News queries remain the better route to these firms. |
| **Small fetcher hygiene** that the ingestion juror's tests turned up: normalise links (strip fragments like `#new_tab`) before link dedup, and collapse syndicated copies by title before analysis rather than after. | No juror estimate | Swedroe (fragments), SJP (one story under 10 headlines) | Cheap guards. Neither is needed for the sources going forward now. |

Not attempted, and could become code later: Miami Beach DRB/HPB on NovusAgenda, which needs an
ASP.NET postback (a form submission, not made); and City of Miami iqm2, which timed out twice.

---

## 7. What was not verified

- **Reachability from Vercel.** Nothing new was fetched from production. That includes
  PROFILEmiami and CJ Invest Projects.
- **Google News stability.** Three of the five Google News findings changed size between the
  scout's fetch and the jurors' (63→29, 31→65, 19→8). The Caribbean query moved from 34 to 61
  in the scout's own fetches an hour apart, then came back at 34 for medicion. Every Google News
  number here is one snapshot from Thanksgiving week.
- **CJ Invest page 2** (the Puerto Rico, Faena and Anguilla samples) was not refetched by
  medicion. The fetcher reads only page 1 anyway.
- **Hotel News Resource bodies** were not read by medicion. The designer credits come from the
  scout's read of 9 bodies.
- **Bahamas DEPP PDFs** were not opened by anyone.
- **Firm bases:** Hill Glazier (Pendry Barbados), JTRE, and whether "PRH 1301 S Ocean Drive LLC"
  is Related Group. None verified.
- **Tenure:** whether the bKL and HPA Chicago projects are condo or rental. Not verified.
- **Hollywood 1301 S Ocean item:** not opened by the fit juror.
- **PANYNJ row count** (953) not reproduced. The keyword scan was reproduced (0 hits).
- **Broward Legistar** not refetched. **Airport Improvement pages 2–6** not refetched.
- **The cultural query at `when:30d`:** volume measured (48 items), fit not scored.
- **Sales-launch overlap with live queries** is measured by title only. Bodies were not compared.
- **Lane arithmetic.** ingesta counted 7 active `opportunity_signal` sources. `sources-live.txt`
  lists 6 upstream RSS rows plus `NY · DCP ZAP / ULURP` (`socrata_zap`), which is not RSS and
  does not take RSS slots. ingesta also says three launch additions would land "exactly 50" and
  starve the sources listed last. With 46 of 50 slots taken, three additions would need 52.
  That starvation behaviour is the juror's reading of the code. I did not check it.
- **Blocked or unreachable during scouting:** The Next Miami (Cloudflare 522 three times),
  Florida DBPR condo filings (Cloudflare challenge, not bypassed), San Diego permits CSV
  (expired TLS certificate), Seattle DJC (no response, again), Archinect and competitions.archi
  (robots.txt disallows ClaudeBot, so not fetched), Haute Living's real-estate feed (403),
  several trade and Caribbean outlets (403 or no response).

---

## 8. SQL for review — not a migration, not run

**Cap.** The launch lane has 23 active sources (46 of 50 slots). The brief allows one more,
so this block activates exactly one source.

**Order of the five forward candidates** (all `project_launch`), with what each would replace.
The replacement targets are limited to sources with a number in the round-2 yield table (§5
there):

| Rank | Candidate | Would replace | Basis |
|---|---|---|---|
| 1 | PROFILEmiami | — (takes the free slot) | aceptada, 8.7 |
| 2 | CJ Invest Projects | **Dezeen** (524 raw / 43 disc / 14 used in 90 d; 28 of 43 discoveries non-US; round 2: "weakest remaining direct feed; revisit if a slot is needed") | 6.7. Low volume (~0.1/day), so it would rarely use its 2 slots |
| 3 | King & Partners | No other weak launch source has a number in the round-2 table. *GNews Airport Lounges* (104 / 32 / 0) was rewritten today, so its history restarts and it should not be judged yet. | 6.0 |
| 4 | GNews Sales launches | Same as above; overlaps PROFILEmiami on ~1/3 | 5.3 |
| 5 | GNews Caribbean development | Same as above; all jurors prefer CJ Projects for this region | 5.0 |

Ranks 3–5 need the live 90-day yield of the remaining launch sources before anything is
named to swap out. The yield table was not re-read for this round.

```sql
-- ════════════════════════════════════════════════════════════════════════════
-- REVIEW ONLY. docs/source-viability-report-2026-11-26-round3.md
-- Launch lane: 23 active -> 24 active (48 of 50 slots). One row, per the cap.
-- ════════════════════════════════════════════════════════════════════════════

insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
  -- ACEPTADA (A/A/A, avg 8.7). medicion: 200, 20 items 2026-10-30..11-25 (26 d), ~10 early in-scope items with
  -- architect/ID/sales-agency credits in the body (Arquitectonica, Meyer Davis, Fogarty Finger, KPF, SWA, DEDM, Gensler).
  -- ingesta: rss-parser OK with fetcher headers, median 2,358 chars (no enrichment), ~0.8 items/day.
  -- encaje: team credits in 11 of 20; title overlap with Florida YIMBY / TRD Miami = 2 stories; ~6 of 20 noise.
  -- Note: /feed is 404 — only the ?format=rss collection URL works.
  ('PROFILEmiami', 'https://profilemiami.com/miamirealestate?format=rss', 'rss', 'miami', 'luxury_residential', true, 192, 'project_launch')
on conflict (url) do nothing;

-- ── OPTIONAL SWAP — rank 2. Commented out: run only together, so the lane stays at 24. ──
-- A_PRUEBA (T/A/T, avg 6.7). medicion: 200, 10 items on page 1, 2026-08-27..11-24 (89 d), ~5 clear luxury
-- Caribbean projects, developers named, 0 designers. ingesta: rss-parser OK (scout had regex only), median
-- 770 chars, all >= 600 (no enrichment; page is paywalled teaser anyway), ~0.1 items/day.
-- encaje: ~6 of 10 project-stage, 0 duplicates with live feeds or the Caribbean GNews query.
--
-- update sources set active = false where name = 'Dezeen';  -- 524 / 43 / 14 in 90 d; 28 of 43 discoveries non-US
-- insert into sources (name, url, source_type, region, sector, active, sort_order, discovery_kind) values
--   ('Caribbean Journal · CJ Invest Projects', 'https://www.caribjournal.com/cj-invest-news/projects/feed/', 'rss', 'global', 'hospitality', true, 194, 'project_launch')
-- on conflict (url) do nothing;

-- ── Verify (optional) ────────────────────────────────────────────────────────
--   select discovery_kind, count(*) filter (where active) as active
--     from sources where source_type = 'rss' group by 1;
--   -- expect project_launch = 24, opportunity_signal = 6
```

As in round 2: `supabase/schema.sql` re-seeds from its own block. If this row is applied to
the live table only, the seed has to carry it too, or a fresh seed will not include it.

---

## 9. Diff summary

**Added:** this report. **Touched:** nothing else. No row was changed and the app was not run.
The scout notes under `docs/source-round3/` and the uncommitted `supabase/schema.sql` and
round-2 migration were already in the working tree. They were read, not modified.
