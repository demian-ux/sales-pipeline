# Source Viability Report — Upstream + Capital Signal Sourcing

**Date:** 2026-07-14
**Phase:** 1 (source probing) of `upstream-capital-signals-handoff-2026-07-14.md`
**Method:** 10 scout agents, one per candidate source, each running the handoff's §2.2 probe
protocol against a 60-day window (2026-05-15 → 2026-07-14).
**Status:** Awaiting Demi's source approval. **No application code was changed.**

---

## 0. Verdict

Ten sources probed. **Three are worth adopting. Five are structural dead ends. Two are
quarterly manual glances.**

But the headline is not in the source list.

> **Five of oaki's existing `project_launch` sources have been failing on every single
> run — plus a sixth switched off by mistake. They are the sources feeding the exact lane
> the handoff describes as starved (1–2/week), while the lane with zero failures runs at
> ~14/week. The pipeline logged all of it, every six hours, for weeks. The supply diagnosis
> that produced this handoff was made on instrumentation that was talking to nobody.**

The handoff's thesis was: *supply is throttled by manual press-only sourcing; widen it with
structured non-press sources.* The evidence inverts this. The structured non-press sources
are almost all dead ends, for **structural** reasons. The things that work are trade press —
and one of them is already in the source table, switched off by a URL typo.

---

## 1. Two corrections to the handoff's premises

Per §0's standing rule ("if the repo already does it, build on top of it").

### 1.1 `signal_type` is already taken — Phase 2 would collide with a live column

Phase 2 says: *"Add `signal_type` to discoveries: `launch` (default), `upstream`, `capital`."*

`discoveries.signal_type` **already exists in production** with a completely different
meaning: the **event-type gate**. Sixteen values (`new_development`, `approval_filing`,
`transaction`, `completion`, `capital_event`, …), of which eight are a DROP set used by
`lib/discoveries/signal-type.ts` → `icp.ts` to hard-disqualify off-type articles. Adding a
lane axis under that name would collide head-on with a live gate.

The lane axis the handoff means already exists too. It is **`discovery_kind`**:

| Handoff name | Repo reality |
|---|---|
| `launch` | `discovery_kind = 'project_launch'` — exists |
| `upstream` | `discovery_kind = 'opportunity_signal'`, with `upstream_signal` accepted as an API alias (`lib/discoveries/kind.ts`) — exists, retuned 2026-07-10 |
| `capital` | No lane — but see §6. `capital_event` already exists as a *signal_type* inside the launch lane, **with its own scoring branch**. |

**Action:** use `discovery_kind`. Do not add a `signal_type` lane column.

### 1.2 Phase 3's "firm-pool re-touch guard" does not exist

Phase 3 says: *"If the firm-pool store's re-touch guard can host this (a longer minimum
interval per pool entry), reuse it."*

There is no such guard. The firm pool's only dedup is a unique index on
`value_touches(firm_id, signal_ref)` — it is **signal-scoped, not time-scoped**. There is no
interval to lengthen.

The mechanism Phase 3 wants **does** exist, elsewhere: the Leads sheet already carries
`held_reason` + `held_until` (the July 7 `Held` stage work), which is exactly a long-horizon
re-touch clock. Discoveries have the equivalent in `re_arm_at`.

**Action:** a capital lead becomes `Held` with `held_until` at +12 months, `notes` carrying
the `capital` tag. No new column, no parallel timer. Smaller than the handoff assumed, and
in a different place than it pointed.

---

## 2. 🔴 The launch lane has been running with five dead sources

**This is not inference.** The pipeline recorded it. `ingestion_runs.errors` carries the exact
HTTP status of every failed fetch, and it has said the same thing on **every `project_launch`
run since at least 2026-07-06**:

```
project_launch  2026-07-13   new=7    failed=5
project_launch  2026-07-08   new=10   failed=5
project_launch  2026-07-06   new=1    failed=5
      x  Urbanize Miami             HTTP 404
      x  Urbanize NYC               fetch failed (DNS)
      x  Curbed NY                  HTTP 410
      x  The Architect's Newspaper  HTTP 403
      x  World Architecture         HTTP 403

opportunity_signal  (every run)      failed=0
```

**Every launch run: five sources down. Every upstream run: zero.**

The handoff (§1) reports supply as **~14/week from opportunity signals, 1–2/week from project
launches** — and treats that as evidence that press sourcing is exhausted. But all five dead
feeds are `project_launch` sources. The upstream lane runs on the `Upstream ·` Google News
queries and has never had a failure. **The lane at 14/week is healthy. The lane at 1–2/week is
the one running on half a source list.** That asymmetry is the pipeline's own log, not a theory.

### Two different failure classes — and the distinction matters

| Class | Sources | Reality | Action |
|---|---|---|---|
| **(a) Wrong / dead URL** | Urbanize Miami, Urbanize NYC, Curbed NY | Miami's feed moved to `/rss.xml`; NY's subdomain is **`nyc.`**, not `ny.` (the old host does not resolve); Curbed NY is **410 Gone** — folded into NY Mag. | Repair ×2, retire ×1 |
| **(b) IP block** | The Architect's Newspaper, World Architects | **403 to Vercel's datacenter ranges — but HTTP 200 with 10 valid items from a residential IP, using the pipeline's exact User-Agent.** It is the IP, not the crawler identity. Their URLs are correct; the deploy environment simply cannot reach them. | Deactivate (recoverable) |

### And the sixth: The Real Deal

`active = false`, behind the comment *"bot-blocked / paywalled / feed discontinued."* **For TRD
all three claims are false.** `therealdeal.com/feed/` **301-redirects to the homepage** — the
stored URL was simply wrong. The market feeds each return **HTTP 200 with 10 items**,
unpaywalled, and `robots.txt` is `Allow: /`.

**In fairness to that comment: bot-blocking is real here — just not for the sources it named.**
It is true of ArchPaper and World Architects (both genuinely 403). It is false of The Real Deal
and of Commercial Observer — which has been **active and healthy in the same table the whole
time**, directly contradicting the comment three lines above it. The error was generalizing one
observed 403 into a blanket policy, and then citing that policy in `schema.sql:480` to justify
reaching the trade press *only* through Google News. **A whole architectural stance rested on an
unverified word.**

### Why nobody saw it

The information was never missing. `processor.ts:294` writes `failed_sources` to the run record;
`pollRunStatus` in `discoveries/page.tsx` already *renders* it. But it renders only into the live
progress line of a run **you triggered by hand and stayed to watch**. The cron runs every six
hours with nobody watching. So the pipeline detected these failures, wrote them down, and knew
how to display them — into an empty room.

**The bug was never instrumentation. It was that failure visibility was coupled to manual
observation.**

### Fix (applied 2026-07-14 — `migrations/2026-07-14c_source_repair.sql`)

1. **Repair** Urbanize ×2 → `/rss.xml`, and `nyc.` for New York.
2. **Reactivate The Real Deal**, split into NY + Miami market feeds. (Splitting matters:
   `MAX_PER_SOURCE = 2` caps each source at two articles per run, so one combined feed would
   throttle both target markets into a single pair of slots.)
3. **Deactivate** Curbed NY (gone), ArchPaper and World Architects (403 from the deploy IP).
   ArchPaper is deactivated *not* because it is dead — it is a good feed — but because a source
   that fails on every run would keep the new health banner permanently lit, and **an alarm that
   is always on is an alarm nobody reads**. It is recoverable: proxy the fetch, or add a GNews
   query scoped to `site:archpaper.com` (Google's crawler is not blocked) — the same workaround
   the existing GNews sources already are.
4. **Surface it.** The discoveries board now shows the last finished run's `failed_sources` on
   load, so a dead feed is visible to whoever opens the board next — not only to whoever happened
   to be watching a manual run.
5. **Re-measure launch-lane supply for one week before committing to any new ingestion work.**

---

## 3. Probe results

60-day window, 2026-05-15 → 2026-07-14. "Qualifying" = passes the handoff's signal test
(§2.2.4) or capital-stage test, **in target geo, in target sector**.

| Source | Qualifying / 60d | Access | Automation | Verdict |
|---|---|---|---|---|
| **EU TED** | **14** | Free typed-JSON API, no key | easy | **AUTOMATE** |
| **Commercial Observer** | **3–6** | RSS, unpaywalled | easy | **AUTOMATE** |
| **The Real Deal** | **3** | RSS, unpaywalled | easy | **REPAIR** (already in table) |
| NYC EDC + PASSPort | 0 / 320 reviewed | public, JS-rendered | headless | Quarterly manual |
| Miami-Dade procurement | 0 / 42 reviewed | public, JS-rendered | headless | Drop (optional quarterly) |
| Hotel brand newsrooms | 0–1 | mixed; 2 of 6 bot-hostile | headless | **DROP** |
| Competition platforms | 0 | **robots.txt conflict** | manual | **DROP** |
| ACRIS | 0 | free Socrata API | manual (unmasking) | **DROP** |
| EB-5 | 1 (proves the failure) | fragmented | headless | **DROP** |
| Gulf giga-projects | 0 / 112 | mixed, bot-hostile | headless | **DROP** |

### 3.1 EU TED — **automate** (highest yield of the ten)

- **Access:** `POST https://api.ted.europa.eu/v3/notices/search`. **No login, no API key.**
  OpenAPI spec at `api.ted.europa.eu/api-v3.yaml`. Fair-use limits (600 dl/6min, 700
  req/min) never approached. The cleanest access story of any source probed.
- **Structure:** typed JSON per notice — notice ID, multilingual title, publication date,
  buyer country, CPV array, buyer name, links.
- **Yield: 14 / 60 days** (≈ 7/month). Museums (Groningen, Sassari, Poperinge, Musée de
  l'Air), libraries (Venlo), cinemas (Pamplona, Venlo), a conservatory (Lyon), a university
  building (Florence), a resort amenity complex (IGESA), a Paris concert-venue plaza
  (Zénith), an airport terminal (Palermo).
- **This is the `opportunity_signal` lane, exactly.** A TED contract notice is *definitionally*
  a named buyer announcing an unawarded design commission — `briefs_status='unawarded'`,
  `future_work_test=true`, `buyer_committed=true`, sector `cultural` → `sectorFitFromSector()`
  = `high`. No new lane, no new scorer.

**Three implementation gotchas — each would have cost weeks:**

1. **Filter on `notice-type IN (cn-standard, cn-desg)`. NEVER on the legacy `TD` field.**
   TD is empirically broken — it returned `"3"` for *both* a pre-award contract notice and a
   post-**award** notice. Filtering on TD would silently pour awarded briefs into a lane
   whose entire premise is pre-award, reintroducing the exact failure the July 10 retune
   removed.
2. **CPV-45 hits require an explicit design-build tell** (`conception-réalisation` /
   `bouwteam` / `appalto integrato` / `progettazione ed esecuzione`) before counting.
   Two perfect-sector cultural hits (Cassis, Anklam) were post-design construction trade lots.
3. **`CY` is the buyer's country, not the place of performance.** Caught a false positive
   (Expertise France procuring for Tunisia). Geo-filtering on CY alone leaks.

**CPV codes.** Core (high precision): `71220000` architectural design services, `71221000`
architectural services for buildings, `71223000` extensions, `71230000` organisation of
architectural design contests. Broader (noisier, needs extra filtering): `71200000`,
`71210000`, `71240000`, `71241000`, `71242000`. Division 45 (mostly post-design noise unless
design-build): `45212000`, `45212300`, `45212310`.

**One new component required.** The ingestion layer only speaks RSS (`lib/discoveries/rss.ts`).
TED needs a JSON-API fetcher normalizing into the existing `RawArticleFromRSS` shape. The
schema already anticipates this — `sources.source_type` is documented as `'rss' | 'api' |
'manual'`. **This is the only genuinely new engineering in the entire project.**

*Confidence: medium (self-assessed by the scout). The 14-count rests on judgment calls on
4–5 borderline items, and ~967 of 1,888 raw division-71 notices were screened rather than the
full tail. Honest range: roughly 9–20.*

### 3.2 Commercial Observer — **automate**

- **Feed:** `https://commercialobserver.com/finance/feed/`, paginate `?paged=N` (verified
  through `paged=10`). **No paywall triggered on ~20 articles fetched.**
- ⚠️ **`/category/finance/feed/` is a decoy** — valid XML, **zero items**. Wiring that URL
  would have produced a silently-always-empty source.
- **Yield: 3–6 / 60 days.** Three are clean (Apollo/Tribeca condo conversion; Madison
  Realty/1740 Broadway; MG-Vertical/Coral Gables). Three are defensible-but-arguable
  judgment calls. Call it **2–3/month**.
- **Overlap with existing Google News queries: LOW — and this is the argument for it.**
  The existing capital queries trigger on *"closes fund" / "capital raise" / "raises" /
  "acquires" / "acquisition" / "development site" / "to redevelop"*. Every CO qualifying item
  is a **construction-loan** story, containing **none** of those phrases. Conversely, the
  fund-close and acquisition stories in CO's sample that *would* match the existing queries
  (Starwood's $10.2B data-center fund; Core Spaces' $1.64B raise) all **failed** the
  capital-stage test on sector anyway. **The two are near-disjoint: current sourcing catches
  the genre that mostly fails, and is structurally blind to the genre that mostly passes.**
- ⚠️ **Classify on the article body, not the RSS dek.** Verified: dek-only classification
  misjudges for-sale-vs-rental *in both directions* and sometimes drops the developer name.
  Use `content:encoded`, or the existing `enrichArticleForAnalysis` step.

### 3.3 The Real Deal — **repair, don't add**

See §2. Feeds: `/new-york/feed/` and `/miami/feed/`. Yield **3 / 60 days** on the
capital-stage test alone; its general NY/Miami development coverage additionally feeds the
launch lane, which is what it was originally in the table for.

- **Overlap: partial → low.** Tested against oaki's *live* `GNews Capital · Redev
  Acquisitions` query: it caught item #1 (lucky verb match on "buys"), **missed** item #2
  (TRD's headline said "nab", not acquires/buys), and **missed** item #3 entirely — none of
  the three existing capital queries contain **any** construction-loan or financing
  vocabulary. A structural blind spot.
- Urbanize NYC and NY YIMBY had **not** independently covered either Tribeca deal.
- ⚠️ **False-positive pattern to guard in the prompt:** 2 of 3 near-identical candidates
  (Grupo T&C Brickell, Simon Property Boca) were **stale 2025 acquisitions re-covered as 2026
  "plans" stories**.

### 3.4 NYC EDC + PASSPort — quarterly manual glance

**0 qualifying out of 320 solicitations individually reviewed.** The structural finding is
decisive: **PASSPort's civic-building solicitations are late by years.** Verified — Queens
Museum's design went to Grimshaw in **2005**; Staten Island Museum to Gluckman Tang c. **2015**;
Hollis Library is "DDC In-House Design". When DDC posts, the architect was chosen a decade ago.

NYC EDC *does* periodically run exactly the right RFP type — "Request for Development Partner"
for mixed-use sites with a civic component (West 100th St + Bloomingdale Library, Gansevoort
Square, 100 Gold St) — but every instance found was outside the window or already closed.
**A few per year.** Cheapest path: a **quarterly** human glance at `edc.nyc/rfps` →
"Real Estate Development Opportunities" filter. Not scraping infrastructure.

*Compliance note: `passport.cityofnewyork.us/robots.txt` is a blanket `Disallow: /`. The
static data file at `a0333-passportpublic.nyc.gov/dataJs/rfxData.js` carries no restriction.*

### 3.5 Miami-Dade — drop (optional quarterly)

**0 qualifying out of 42 open solicitations.** The two development-partner RFPs that looked
promising on title (Kline Nunn–Little River; SW 296th St Transitway) both verified out to
**affordable/workforce rental** housing. Clean fails, not close calls — and structural: when
a county puts public land out to a development partner, it wants affordable housing. That is
what counties are *for*. Both portals are JS/AJAX-rendered (headless-only).

*The scout recommended a weekly manual checklist. **I dissent.** A weekly slot costs ~4
hours/year to maybe catch one item that Urbanize Miami or TRD would surface anyway. If you
want coverage, quarterly is the honest price.*

### 3.6 Hotel brand newsrooms — drop

**0–1 qualifying / 60 days** across Marriott, Hilton, Accor, Hyatt, Four Seasons, Aman.
Hyatt's own Europe RSS returned 10 items across 4.5 months, continent-wide, **zero passing**.
Overlap with Google News: **high** — the brand newsroom is the *origin* of the press release,
but PR Newswire and the hospitality trade press syndicate it into Google News the same day.
Not a faster or wider channel. Marriott and Accor are JS-only SPAs on top of that.

*Working RSS found, for the record: Hilton `stories.hilton.com/feed`; Hyatt
`newsroom.hyatt.com/all-rss-feeds`. No RSS for Marriott, Accor, Four Seasons, or Aman.*

*The count is 0 or 1 depending on geography: a Four Seasons **Seville** signing (2026-06-04,
no designer named, genuinely pre-award) was scored out-of-geo by the scout against a
four-city list. Per `target-geo.ts`, Seville **is** in geo (`region: 'Europe'`). Either way,
one item in 60 days across six brands is a drop.*

### 3.7 Competition platforms — drop

**0 qualifying.** The a-priori sharpest signal on the list (a firm entering a competition
needs renders to win it) — and it did not survive contact.

- **Google News already carries it.** The two closest-to-qualifying items (Amsterdam National
  Slavery Museum, €50M, real client, in-geo; Portland Waterfront Park) were picked up
  immediately by Dezeen, Designboom, and ArchPaper — well inside the existing
  `Upstream · Competitions & RFPs` query.
- **What is unique to these platforms fails the test anyway.** Awards programs (Prix
  Versailles, A' Design Award) and student/ideas competitions. Real-client-to-noise ratio
  ≈ **1:20**.
- 🚫 **`competitions.archi/robots.txt` explicitly disallows ClaudeBot by name.** That is a
  policy conflict, not a technical obstacle. **We should not scrape it regardless of yield.**
- Bustler also 403s. Malcolm Reading is fetchable and higher-quality per item, but produced
  **0 in-geo open competitions in 14 months** of news history.

*The zero is under-evidenced (2 of 3 platforms were bot-blocked, so the scout judged from
search-cache snippets). The drop rests on the robots.txt conflict and the Google News overlap
— which hold independent of the count.*

### 3.8 ACRIS — drop

Killed with live API queries, not argument. 21,084 records in the window ("noisy", confirmed)
→ 5,033 deed-type → 62 unique land-deed documents → 35% were $0 nominal transfers → only
**8 cleared $3M**.

- **The Building Loan path is empirically dead.** **Zero** of 6,215 mortgage-class records
  in-window carry a "BUILDING LOAN" remark. The most recent such hit *anywhere in ACRIS
  history* is January 2026.
- **The LLC problem finishes it.** Every real land-acquisition grantee was a single-purpose
  shell (`GROVE MENAHAN BK LLC`, `NORWORTH HOLDINGS LLC`). Unmasking needs a fragile DOB-permit
  cross-join (worked 1 of 3) or manual press research. The one LLC successfully unmasked was
  **Bingo Wholesale — a grocery retailer, not a developer.** The largest "development" deed in
  the window ($25.55M, West St, Brooklyn) was a **foreclosure transfer to a securitization trust**.
- **The punchline:** to unmask that LLC, the scout used **Commercial Observer and The Real
  Deal**. The press layer *is* the unmasking layer. ACRIS gives you opaque shells; CO and TRD
  give you named developers, because that identification work is their job.

*Data collection is trivially easy (four clean Socrata JSON datasets, no auth). The cost is
entirely in the unmasking step, which has no reliable hit rate. Hence: manual_only → drop.*

### 3.9 EB-5 — drop (structurally, not marginally)

The handoff guessed "likely low yield". **The truth is worse and more useful: it is the wrong
*stage*, permanently.**

One qualifying item in 60 days — and that item is the argument against the source. **The
William** (North Miami Beach condo tower): EB-5 raise announced 2026-07-01; its renderings
launched **2025-11-05**, eight months earlier. Every timeline the scout could verify (Okan
Tower, Meliá Brickell, both Manhattan Regional Center offerings) showed the same pattern.
**Zero counter-examples.**

The reason is structural: **EB-5 is gap financing.** It is layered onto a project that already
has a design and marketing package — because you need the renders to sell units to investors
and secure the senior debt. By the time an EB-5 raise is announced, oaki's imagery window has
been closed for the better part of a year. Ten times the volume would still arrive too late.

*Compounding it: the 2022 RIA's rural-TEA incentives pushed EB-5 volume toward rural,
industrial, and logistics projects — structurally away from urban luxury condo.*

### 3.10 Gulf giga-projects — drop (on source quality, independent of the geo question)

**0 qualifying out of 112 raw items.** Probed at Demi's direction (2026-07-14) on a
report-but-don't-ingest basis, given that Middle East is a settled ICP exclusion enforced in
`target-geo.ts` (out-of-geo → capped at 55, below the 70 prime threshold).

**The geo question turns out to be moot: these sources fail on the merits.** All five entities
are *past* the stage oaki sells into. Masterplans and architect pairings were locked 2020–2023
(Foster + Partners, BIG, HKS, ACPV at Red Sea Global; equivalents at Diriyah and Qiddiya).
Today's output is openings, ESG milestones, and certifications — **Red Sea Global released a
music album as a "News" item.** Tenders that do surface are contractor-facing packages on
already-designed work. Dubai Municipality's portal is generic municipal supply chain (truck
parts, pharmaceuticals, IT renewals) — real branded-residence development in Dubai is
commissioned privately by Emaar, Meraas, and Nakheel entirely **off-portal**.

*One genuine near-miss, verified: Diriyah + Midad's JV for a Four Seasons hotel and branded
residences, no architect named — a clean pass, dated **7 January 2026**, four months outside
the window. The family can throw a real signal roughly once every several months.*

*Methodology note: the scout found search snippets conflating 2025 and 2026 dates (a Diriyah
tender article read as current but was July 2025). Every date in the final count was
re-verified by direct fetch.*

---

## 4. Recommended source list (for Demi's approval)

### Automate (3)

1. **EU TED** → `discovery_kind = 'opportunity_signal'`. Requires the one new component: a
   JSON-API fetcher (`source_type = 'api'`). Filter `notice-type IN (cn-standard, cn-desg)`;
   core CPV `71220000/71221000/71223000/71230000`; buyer countries FR/IT/ES/NL/DE/BE.
2. **Commercial Observer** `/finance/feed/` → `discovery_kind = 'project_launch'`, classified
   `capital_event` by the existing analyzer. Body-level classification, not dek.
3. **The Real Deal** `/new-york/feed/` + `/miami/feed/` → **repair, not add** (§2).

### Repair (2)

4. **Urbanize NYC** — dead subdomain. Re-point or retire.
5. **Urbanize Miami** — `/feed` 404s. Re-point or retire.

### Manual, quarterly (1)

6. **NYC EDC** — `edc.nyc/rfps` → "Real Estate Development Opportunities". A few qualifying
   RFPs per year. Hand this to the Cowork skill's sweep checklist, per handoff §2.3 — **not**
   into the app.

### Drop (5)

Competition platforms · Hotel brand newsrooms · ACRIS · EB-5 · Gulf giga-projects · (and
Miami-Dade, at most an optional quarterly glance).

---

## 5. New source leads → monthly source-scout backlog (handoff §2.4)

Both surfaced *during* probing, neither on the original candidate list:

- **UK Find a Tender (FTS)** — **high priority.** TED structurally carries **zero UK notices
  post-Brexit** (a dataset gap, not a sector miss). London is a target city. FTS has its own
  **OCDS-based API**. This is plausibly a second TED-shaped win, and the single most promising
  unprobed source known.
- **BidNet Direct** — City of Miami and Miami Beach have both migrated there. Registration-walled,
  unprobed. Lower expected value given the Miami-Dade result, but it is now the only route to
  those two cities' solicitations.

---

## 6. The capital-lane fork — recommendation: **do not build the lane**

Phase 2 asks for a `capital` lane; Phase 3 for capital-stage lead handling. The evidence says
build neither, because **the machinery already exists.**

**Volume.** CO (3–6/60d) + TRD (3/60d) ≈ **6–9 per 60 days ≈ 3–4.5/month** — items that then
sit in `Held` for twelve months.

**What already exists:**

- `capital_event` is already a KEEP `signal_type` with **its own scoring branch** in
  `icp.ts:109-117` — `deployment_horizon` → stage-equivalent points, the `financing_only`
  disqualifier explicitly exempted, a weak-cap when the horizon is unstated. Shipped 2026-07-06.
- **The analyzer already implements the capital-stage test.** `schema.sql:478-479`: *"classifies
  these `capital_event` (KEEP) only when it can quote forward development intent; loans / refis /
  stabilized trades stay DROP."* That is precisely *named developer + land buy or construction
  financing + future development intent* — already coded.
- Three `GNews Capital ·` sources are already seeded in the launch lane.
- `Held` + `held_until` already provides Phase 3's long re-touch horizon; `notes` can carry the
  `capital` tag. No new column.
- `dedup.ts` already dedupes across lanes with verdict inheritance.

**What a third lane would cost:** a migration, an API validation change (`api/discoveries/route.ts`
currently 400s on any kind outside `project_launch | opportunity_signal`), a new analyzer prompt,
a new scorer, a board toggle, a cron mode, supply-health instrumentation, and Phase 4 parity
testing across three lanes instead of two — for ~3–4.5 items/month.

**Recommendation.** Point Commercial Observer and The Real Deal at the **existing launch lane**.
The existing `capital_event` classifier and scoring branch handle them. Route capital-stage leads
to `Held` with a long `held_until`. **Zero migrations. Zero new scorers. Zero API changes.**

---

## 7. The finding underneath all of it: the ICP is the constraint, not the sourcing

Two independent probes converged on this without being asked to.

- **Commercial Observer:** roughly **a dozen** otherwise-qualifying deals in 60 days were
  excluded **purely on geography** — including an **$870M Four Seasons branded-residences
  construction loan**. Widening the geo would roughly *triple* this source's yield without a
  line of ingestion code.
- **EU TED:** the raw pre-award pool is **1,888 notices** in 60 days across six countries. The
  14 that qualify are what survives the sector + design-stage screen.

The supply funnel is not starved of input. It is narrow by construction — four geographies, a
handful of sectors, pre-award only. That narrowness is deliberate and may well be correct. But
it means **no amount of new plumbing widens supply**, and the handoff's premise ("widen supply
by adding sources") is chasing the wrong variable.

**The real supply levers, in ROI order:**

1. **Fix the three dead feeds.** Zero new code. Recovers the launch lane.
2. **Add TED.** One new fetcher. ≈ 7/month of pure pre-award upstream signal into the lane
   built to eat it.
3. **Add Commercial Observer.** One RSS row. ≈ 2–3/month into the existing `capital_event` path.
4. **Reconsider the ICP geography.** A Cowork/skill decision, not an app decision — but CO alone
   showed ~12 qualifying-but-out-of-geo deals in 60 days.

Building a third lane appears nowhere on that list.

---

## 8. Diff summary (handoff §Acceptance 6)

Demi's call on 2026-07-14, after seeing the dead-feed finding: **"feeds first, then
re-measure"** — repair the existing sources, surface failures, and add **no new sources** until
the launch lane has been measured with working plumbing.

**Added:**
- This report; one scratchpad findings file per probed source (10).
- `supabase/migrations/2026-07-14c_source_repair.sql` — the source repair (§2). **Not yet run
  against Supabase; that is a manual step in the SQL editor.**
- A feed-health banner on the discoveries board: the last finished run's `failed_sources`,
  shown on load.

**Touched:**
- `supabase/schema.sql` — repaired the seed URLs and moved the three unreachable sources into
  the inactive block *with the HTTP status actually observed*. Corrected the false
  "bot-blocked/paywalled" note at `:480`. **This file had to change too: it is idempotent and
  re-runnable, so fixing only the migration would have let the next `schema.sql` run silently
  restore the broken URLs.**
- `src/lib/types.ts` — added `failed_sources` to `IngestionRun`. The column and the writer have
  existed since June; the *type* omitted the field, so no caller could read it.
- `src/app/discoveries/page.tsx` — the health banner.

**No new sources were added.** TED and Commercial Observer are approved-in-principle (§4) and
deliberately deferred until the re-measurement.

**Deliberately left alone:**
- The firm-pool store (`firm_pool`, `firm_pool_contacts`, `value_touches`) — built, working.
- `work_status` / `work_reason` write-back, the `Held` stage, and the active-feed exclusion query.
- The launch scorer (`scoring.ts`, `icp.ts`) and its ICP tuning.
- The `opportunity_signal` lane and its July 10 retune.
- `dedup.ts` and its verdict-inheriting logic.
- The decision-trail HTML output format.
- The existing `signal_type` event-type gate — **explicitly not repurposed** (§1.1).

**Not yet done (blocked on approval):**
- Phase 2 ingestion for the three approved sources.
- Phase 4 `work_status` parity verification (structurally likely already true — the column and
  its API filter are lane-agnostic — but the handoff correctly says *test, don't assume*).
