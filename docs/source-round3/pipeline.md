# Round 3 scout — project trackers and local development press

Angle: trackers and local press that credit the full team (developer, architect, interior
designer, sales/marketing agency) on projects still ahead. All fetches made 2026-11-26 with
curl and a browser User-Agent; every feed reported as parseable was also run through the
repo's own `rss-parser` (`node_modules/rss-parser`, same options as `src/lib/discoveries/rss.ts`).
PROFILEmiami and Urbanize Chicago were also fetched with the fetcher's exact Windows UA and
Accept header: both 200.

Checked against `sources-live.txt` and the round-1/round-2 reports first. Nothing below is in
the live table or was tested in rounds 1–2, except where a different URL / route is noted.

## Result in one paragraph

One strong find: **PROFILEmiami's own Squarespace RSS**
(`https://profilemiami.com/miamirealestate?format=rss`). Its `/feed` URL is 404, which is
probably why it was missed; the sitemap shows the blog collection is `/miamirealestate`, and
Squarespace serves `?format=rss` for it. Full text in the feed, ~5 items a week, and every
in-scope item credits the architect and/or interior designer and often the sales agency.
One Google News query on sales launches is a reasonable trial. Everything else on this angle
(resort-market local press, What Now, Chicago YIMBY, Urbanize DC/Austin/Atlanta, Haute
Living, developer newsrooms, Substack newsletters) failed on access or on scope.

## 1. PROFILEmiami — ADD

- URL: `https://profilemiami.com/miamirealestate?format=rss` → 200 `application/rss+xml`,
  594 KB, rss-parser OK.
- 20 items, 2026-10-30 → 2026-11-25 (26 days) → about 5.4 a week. Full text in the feed
  (1,486–5,202 chars per item), so no article fetch is needed.
- Read all 20. **10 clear in scope, 3 arguable, 7 out** (listings, a café, a financing
  roundup, an insurance ad, a park improvement).
- **All 10 in-scope items name the architect or interior designer in the body**; 12 of 20
  items overall name a design firm. Six name a firm already in the CRM pool: Douglas Elliman
  Development Marketing (THE WELL, Raffles), Fogarty Finger (SB/Hazelton tower), Fortune
  International (LILLI, ORA), Cervera (75 Broadway).
- Credits seen in the text (verbatim fragments): "designed by Arquitectonica with interiors
  by Meyer Davis" (Midtown Park Residences by Proper); "Conceptual architectural renderings
  by Fogarty Finger" (SB Development / Hazelton 55-story); "Adrian Smith + Gordon Gill
  Architecture designed the 636-foot tower and its interiors… ODP Architects is the
  architect of record, and SWA Group is the landscape architect" (LILLI); "SHoP Architects
  designed the tower… Studio Paolo Ferrari is designing the interiors" (ATMA); "Arquitectonica
  designed the tower, with interiors by Studio Munge" (EDITION Residences Edgewater);
  "architecture by Kohn Pedersen Fox, interiors by ACPV… Cervera Real Estate is handling
  exclusive sales" (75 Broadway); "Brandon Haw Architecture is leading the design… Douglas
  Elliman Development Marketing is handling exclusive sales and marketing" (Raffles).
- Stage: approvals, unveilings, sales-gallery launches, demolition-before-construction. Early.
- In-scope titles: Miami Commission Approves $2 Billion Midtown Park District · SB Development
  and Hazelton Secure Approval for 55-Story Edgewater Tower · THE WELL Coconut Grove Unveils 17
  Meyer Davis Penthouses From $6.3 Million · OKO Group Celebrates LILLI Sales Gallery Launch in
  Edgewater · Two Roads Begins Demolition for EDITION Residences in Miami's Edgewater · Aman
  Group Unveils ATMA Miami… · One United Properties to Invest $43 Million in ORA by Casa Tua
  in Brickell · ICA Miami Taps Gensler for 30,000-Square-Foot Expansion… · Ytech Unveils 75
  Broadway in Brickell… · Raffles Selects Coconut Grove for Its First Standalone Residences…
- Arguable: Pagani Residences seawall (under construction), Bentley Residences event,
  Bal Harbour Shops expansion (flagship retail, no designer named).
- Overlap, measured via Google News for four stories: ATMA, Midtown Park and the Hazelton
  approval also ran in Florida YIMBY and The Real Deal (both live). THE WELL penthouse story
  appeared only in PROFILEmiami and Haute Living. So roughly half the big stories duplicate
  live feeds; the unique value is the consistent full-team credit in the feed text.
- Ingestible as an RSS row today. 2 slots in the launch lane.

## 2. GNews · Sales launches (for-sale residential) — TRIAL

- Query (170 chars): `when:30d ("exclusive sales and marketing" OR "sales and marketing" OR "sales gallery" OR "launches sales" OR "sales launch") (condo OR condominium OR residences OR tower)`
- 200, 63 items, 2026-10-28 → 2026-11-26.
- Read all 63 titles. About 22 clear (about 17 distinct stories after syndicated copies),
  12 arguable, 29 out — the out pile is mostly Singapore, Malaysia, Dubai, India, Australia,
  London.
- About 20 titles name a developer (Ytech, OKO, MRR, Kadima, Valor, Ronto, Deiso Moss, ZD
  Jasper, Four West, sbe, Palm Tree Crew…). **None names an architect or interior designer
  in the title.** Headline-only, as with every GNews row.
- Samples: "MRR Development launches Malabar Residences on Billionaires' Row - The Real Deal";
  "ELIE SAAB and ZD Jasper Introduce 24-Unit Luxury Condominium on Manhattan's Upper East
  Side - citybiz"; "Valor Ignites Luxury Momentum with Entitlement of Aston Martin Residences
  Sales Gallery in Daytona Beach Shores - StreetInsider"; "Mira Music Row Launches Sales
  Starting At $1.2 Million in Nashville. - CITY NOW NEXT"; "Four Seasons Announces First
  Standalone Private Residences in Colorado - The Real Deal".
- A variant with `-Singapore -Dubai -Malaysia -India -London` collapsed to 10 items and lost
  most US rows, so exclusions are not the fix.
- Overlap with live `GNews Branded Residences` not measured. Trial, judged on raw/disc/used.

## 3. Urbanize Chicago — BACKLOG

- `https://chicago.urbanize.city/rss.xml` → 200, 10 items, 11-21 → 11-26 (about 14 a week),
  full text 2,650–5,703 chars.
- **10 of 10 name the architect** ("Designed by Hanna Architects", "Designed by Perkins
  Eastman and ESG Architecture", "Designed by Hirsch MPG"…). Early stage: zoning, Plan
  Commission, permits.
- In scope: 1 (170 N. Green, a previously approved two-tower plan revised toward a hotel),
  arguable 1 (601 S. LaSalle conversion, probably rental). The rest are small rental
  buildings or a hospital lab. None of the 13 Chicago pool firms (bKL, SCB, Pappageorge
  Haymes, HPA, Gettys…) named in these 10.
- Samples: "Revised development moves forward at 170 N. Green"; "ZBA approves residential
  conversion at 601 S. LaSalle"; "Plan Commission approves Washington Park campus".
- Good format, wrong mix for now. Revisit only if Chicago becomes more than hand-picked firms.

## 4. Dead ends (measured)

| Source | URL | Result |
|---|---|---|
| The Next Miami | `thenextmiami.com/feed/`, `www.` and homepage | 522 (Cloudflare: origin unreachable) three times; `site:thenextmiami.com` on Google News returns 0 items. Not verifiable today |
| PROFILEmiami `/feed` | `profilemiami.com/feed/` | 404 (the working route is §1) |
| Chicago YIMBY | `chicagoyimby.com/feed` + `?paged=2..6` | 200, 30 items over 15 days (2 a day), deks ~350 chars. Mostly three-flats and permits; 1 arguable (Milshire Hotel redevelopment) |
| What Now Miami / NY / LA | `whatnow.com/{miami,new-york,los-angeles}/feed/` (old `whatnowmiami.com` domains redirect to a lander) | 200, 10 items a week each. Chain restaurants, gyms, retail. 1 arguable in 30 (Michael Mina bar at Ritz-Carlton Bal Harbour); 0 name a designer |
| Urbanize DC | `dc.urbanize.city/rss.xml` | 200, 10 items spanning 2025-04 → 2026-11. Near-dormant |
| Urbanize Austin | `austin.urbanize.city/rss.xml` | 200, newest 2026-07-06. Dormant |
| Urbanize Atlanta | `atlanta.urbanize.city/rss.xml` | 200, active, but not a focus geo; no luxury for-sale in 10 |
| Urbanize Nashville | `nashville.urbanize.city` | DNS / no response — edition probably does not exist |
| Haute Living main feed | `hauteliving.com/feed/` | 200, 50 items a week, lifestyle; 1 of 50 a development (Raffles Houston) |
| Haute Living real-estate category | `/category/real-estate/feed/` | 403, Cloudflare challenge |
| Haute Living via Google News | `when:14d site:hauteliving.com (residences OR tower OR condo …)` | 40 items, ~3 in scope; the rest are agent profiles, legal SEO pages, dining |
| RESIDENT | `resident.com/feed` → `stories.rss` | 200, 22 items all on one day, mostly sponsored/SEO posts |
| citybiz | `citybiz.co/feed/` | 200, parses; corporate appointments, 0 of 10 |
| South Florida Agent Magazine, Boca Post | `/feed/` | 403 Cloudflare |
| Miami Agent Magazine | `/feed/` | no response |
| Miami Condo Investments | `miamicondoinvestments.com/feed` | 200, good content (Anantara, Kempinski residences) but newest item 2026-04-23. Stale |
| Miami Today | `/feed/` | 200, 10 items from one weekly issue; this week Art Basel coverage, 0 in scope |
| Palm Beach Daily News | `/news/rss/` | 402 paywall |
| Palm Beach Illustrated | `/feed/` | 200, society and events, 0 of 10 |
| Brownstoner | `/feed/` | 200, Brooklyn listings and links, 0 of 10 |
| Brick Underground | `/rss.xml` | 200, advice content, 0 of 10 |
| Real Estate Weekly, NYREJ, Commercial Property Exec, ENR | `/feed` | 403 |
| CityRealty | `/nyc/market-insight/rss` | redirects to HTML; no RSS link in page |
| Eater NY / Miami | `/rss/index.xml` | 200; restaurant openings and lists, no designer credits in deks (~350 chars) |
| Interior Design magazine | `interiordesign.net/feed/` | 200, valid RSS, 0 items |
| Aspen Times, Vail Daily, Park Record, Maui Now, Civil Beat, Hawaii Business | `/feed/` | 200; general local news. 0 in scope across ~70 items |
| Aspen Daily News, Napa Valley Register, Jackson Hole News&Guide | BLOX `?f=rss` | 429 rate-limit or HTML; not ingestible |
| Explore Big Sky, TownLift | `/feed` | 403 |
| Nashville Post | BLOX RSS | 200, 25 items, deks 60–140 chars, 0 in scope |
| AZ Big Media | `/feed/` | redirects to homepage |
| Texas YIMBY, towers.net (Austin) | `/feed` | lander / no response |
| UrbanTurf DC | `/feed`, `/articles/rss` | 404 |
| The Urbanist (Seattle) | `/feed/` | 200, transit/policy, 0 of 15 |
| Seattle DJC | `/rss/` | no response again (4th attempt across rounds) |
| Developer / dev-marketing newsrooms | Corcoran Sunshine, Related Group, Fortune, Cervera, OKO, Two Roads `/feed/` | 0 items, or newest item 2021–2026-07, or not RSS |
| Hotel Online | `hotel-online.com/feed/`, `/rss` | 404 |
| Hospitality Net pipeline list | HTML list page | 403 |
| SmartFlyer (Substack) | `smartflyer.substack.com/feed` | 200, ~2 a month, global openings for travel advisors |
| Hotels Above Par (Substack) | `/feed` | 404 |
| GNews · resort markets (two versions) | Big Sky / Jackson Hole / Aspen / Vail / Maui / Park City + resort or luxury terms | 32 and 21 items; ski-season and travel noise. 3–4 arguable (Territory 1889 Montana luxury resort approvals, Vail luxury residences); 0 firms in titles |

## 5. Not verified

- Whether The Next Miami feed works when its origin is up.
- Overlap of the sales-launch query with the live Branded Residences query.
- How the analyzer scores PROFILEmiami items (I did not run the app).
- The "monthly bulletins" tracker named in the brief: Haute Living publishes monthly "New
  Development Tracker" pages (one seen on Google News: "West Palm Beach New Development
  Tracker: November 2026"), but its real-estate feed is behind Cloudflare and
  `site:` queries for the tracker return 0–1 items, so I could not measure it as a source.
