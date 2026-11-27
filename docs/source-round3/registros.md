# Round 3: public records and hearing agendas (scout notes, 2026-11-26)

Angle: open-data and agenda systems that name the architect or developer before the press does,
for the focus firm geos other than New York. The model is `ny-native.ts`: DOB filings and ULURP read
through Socrata. All requests were plain HTTP GET with a browser User-Agent. Nothing was submitted
and nothing was signed into.

## Bottom line

One source is worth building: **San Francisco Planning "Records - Projects"** (Socrata `qvu5-m3a2`).
It is the only record set I found where the record is filed at intake (months before a permit),
carries a free-text project description, and has an `applicant_org` field. That field names the
architect in 3 of the 12 large filings I read; in most of the rest it names a land-use law firm. It
would fit the existing structured-source framework in `ny-native.ts` as a new `case`.

Everything else was too late (issued building permits), never named a firm, named the firm only for
small projects, was stale, or could not be reached. Miami Beach (DRB, HPB) and City of Miami
(PZAB, UDRB) are where the client's luxury work actually goes to hearing. Neither has a public JSON
or RSS route I could use without submitting a form.

## Measurements

### 1. SF Planning Department Records - Projects (Socrata `qvu5-m3a2`): TRIAL as a structured source

- Endpoint: `https://data.sfgov.org/resource/qvu5-m3a2.json`. HTTP 200. Metadata `rowsUpdatedAt` is
  current, and the newest records are dated 2026-11-24.
- Fields include `record_id` (`2026-010248PRJ`), `project_name` (the address), `description` (free
  text), `open_date`, `applicant`, `applicant_org`, `number_of_units_prop`, `ownership_units` /
  `rental_units` flags, `visitor_prop` (hotel square feet), `office_prop`, `new_construction`, and a
  `pim_link`.
- Volume: 589 records opened from 2026-05-28 to 2026-11-26. All are record_type PRJ, and no PPA
  records appear in the 90-day group-by.
- Filter tested: `open_date > 2026-05-28 AND new_construction='CHECKED' AND
  (number_of_units_prop>=40 OR visitor_prop>0 OR office_prop>=100000)`. It returned **12 records**
  dated 2026-06-10 to 2026-11-24 (167 days), about 0.5 a week. I read all 12:
  - Clear fits (3): 329 Bryant St (270 units flagged ownership; 482,874 sf; applicant_org **Stanton
    Architecture**); 1301 Van Ness Ave (a residential high-rise of about 360 ft; J. Abrams Law);
    First and Mission, 50 1st St (a modification to the partly built project; 255,346 sf visitor
    space, i.e. hotel; Reuben, Junius & Rose).
  - Arguable (3): 1601 Ocean Ave (a 7-story building with 98 condominium units; applicant_org **S-AC
    Design Group**); 3300–3330 Geary Blvd (8 stories, 89 units flagged ownership; **Elevation
    Architects**); 1601 Mission St (45 stories, 528 units, flagged rental, so out by the rules but
    a tower).
  - Out (6): 38 8th St (40-story rental), 3350 Mission (rental above a grocery), 4101 3rd St (45
    rental units), 150 Hayes (a conversion), 85 West Portal (64 units), and 984 Dolores (an ADU; the
    unit count of 611 is a data error).
- Names a firm: `applicant_org` is an architecture firm in 3 of 12 and a law firm in 7 of 12
  (Reuben, Junius & Rose 5; J. Abrams Law 2). It is empty in 2. The developer is never in a
  structured field. The individual `applicant` is sometimes the developer's employee, but I did not
  verify that.
- Lead time: these are planning intake records, opened before entitlement hearings and well before
  a building permit. That is the same stage as ZAP and earlier than DOB.
- Caveat: SF has few for-sale towers right now, and most large filings are density-bonus rentals.
  Expect about one clear fit a month. The architect is often not named, so firm enrichment is still
  needed.

### 2. Hollywood, FL Legistar (`webapi.legistar.com/v1/hollywoodfl`): BACKLOG

- `/matters?$filter=MatterIntroDate ge 2026-08-01` returned HTTP 200 with 165 matters. 11 matched
  `hotel|condo|tower|stories|site plan|mixed-use|resort`, and I read all 11.
- Planning and Development Board items follow a fixed `FILE NO. / APPLICANT / LOCATION / REQUEST`
  layout, and APPLICANT often names the architect: "HOLLYWOOD AS LLC / LLR ARCHITECTS, INC.",
  "KENNETH R CARLSON ARCHITECT PA", "MICHAEL SCOTT / KALLER ARCHITECTURE", "Joseph B. Kaller on
  behalf of Mike Kaplun".
- In scope: 1 of 11. That is `25-DP-73b APPLICANT: PRH 1301 S OCEAN DRIVE, LLC` (a design and site
  plan on S Ocean Drive; the entity prefix PRH is consistent with Related Group, but I did not
  verify that). The rest are 4-story 27–33-unit rentals, a self-storage facility, a county rezoning,
  and the TIDE hotel-room inventory resolution (a policy item, though a useful early signal that
  beach hotel density is opening).
- Needs a Legistar fetcher. None exists in `rss.ts` or `ny-native.ts`.

### 3. Coral Gables, FL Legistar (`coralgables`): BACKLOG

- 363 matters since 08-01, with 24 keyword hits, all read. Development Review Committee items carry
  descriptions such as "DERC-26-10-0085 Level 1. Application for a Small Scale Comprehensive Plan Map
  Amendment, Zoning Map Amendment, Conditional Use and Mixed-use Site Plan, for a new 12-story
  mixed-use commercial and residential development at 1008 E Ponce de Leon Boulevard." The applicant
  and architect are not in the item text.
- Board of Architects: 15 meetings since August, but the event items are boilerplate. The projects
  are only in the agenda PDF (`coralgables.legistar1.com/.../Board_of_Architects_..._Agenda.pdf`).
  I did not parse the PDF.
- In scope: about 2 of 24 (the 12-story and 13-story DRC filings; a commission resolution about
  "Crystal Residences"). The rest are condo-association housekeeping, historic certificates of
  appropriateness on single houses, and code enforcement.

### 4. Fort Lauderdale Legistar (`fortlauderdale`): DROP for now

- 289 matters since 08-01, 8 keyword hits, all read. The Planning and Zoning Board has no events
  in Legistar since August; only the City Commission does. Hits were a PDD amendment ("The Cypress"
  mixed-use, PFL VII LLC), a Site Plan Level II at 317 N Federal Hwy, beach alcohol licenses for
  existing hotels, and a right-of-way closure for The Ombelle. 0–1 in scope, and no architect named.

### 5. Delray Beach Legistar (`delraybeach`): DROP

- 453 matters since 08-01, 24 keyword hits, all read. Site Plan Review and Appearance Board items
  are detailed ("Easton at Atlantic ... eight-story, 352-unit multifamily building"), but nearly all
  are rental, townhomes, sign programs, a car wash, or offices. 0 clear fits, and no architect named
  in the item text.

### 6. Newport Beach, CA Legistar (`newportbeach`): DROP

- 485 matters since 08-01, 13 keyword hits, all read. Mostly 2–3-unit condo parcel maps ("Kewamee
  Drive, LLC Residential Condominiums (PA2026-0191)"), plus Dove Point condos and the Newport Village
  mixed-use study session. The applicant LLC is named; architects are not. 0–1 in scope.

### 7. Chicago Building Permits (Socrata `ydr8-5enu`): DROP

- `permit_type='PERMIT - NEW CONSTRUCTION' AND reported_cost>=10M`, issued since 2026-08-28:
  15 records, all read. Each carries `contact_N_type = ARCHITECT`, but the name is the licensed
  individual ("VRAJITORU, COSMIN" for the 33-story, 383-unit 410 N Elizabeth St), not the firm. The
  records are issued permits, so the project is already designed. In scope: about 1 (410 Elizabeth,
  likely rental). Chicago is a hand-picked-firm geo only.

### 8. LA City Planning bi-weekly entitlement case filings (ArcGIS `New_PCTS_Case_Filings`): DROP

- `services1.arcgis.com/tzwalEyxl2rpamKs/.../New_PCTS_Case_Filings/FeatureServer/0`: HTTP 200, 520
  records covering 7 reporting periods (2026-07-25 to 2026-11-14). Fields: case number, address,
  project description, request type. **There is no applicant field.**
- 131 CPC/VTT/DIR/PAR records; I scanned all of them for hotels, towers or ≥80 units. Only 2 large
  projects turned up: 303 for-sale 2–3-story townhomes on Burbank Blvd and a 269-unit subdivision on
  Topanga Canyon Blvd. Neither fits. 0 in scope.
- The older Socrata planning-case datasets on data.lacity.org stopped in 2016.

### 9. Seattle SDCI Land Use Permits (Socrata `ht3q-kdvx`) and Building Permits (`76t5-zqzr`): DROP

- Land use, since 2026-05-28, filtered to `estprojectcost>=30M OR housingunits>=100 OR HOTEL`:
  8 records, all read. They were a contract rezone, parking-access items, MHA payment changes, a
  Harborview medical building, and a data center. 0 in scope.
- Building permits, new construction since 2026-07-01, ≥80 units or hotel: 2 records (one
  affordable, one 173-unit). 0 in scope.
- Neither dataset has an architect or applicant field; `contractorcompanyname` was empty.

### 10. Washington DC Building Permits 2026 (`maps2.dcgis.dc.gov/.../FEEDS/DCRA/FeatureServer/18`): DROP

- 40 most recent NEW BUILDING permits read: townhomes, single-family houses, a Pepco substation, and
  a 272-unit mass-timber rental. `OWNER_NAME` is present but there is no architect field. The records
  are issued permits. 0 in scope.

### 11. City of Miami Building Permits Since 2014 (ArcGIS, CityMiamiFL): DROP

- `CompanyName` is the contractor. A query for new construction with lodging/hotel or 26+ units,
  issued since 2026-05-01, returned 3 records: a 304,627 sf lodging project at 152 SW 9 St
  ($150M), a large 2 Island Dr project, and a retail building. Issued permits, no architect.

### 12. Miami-Dade County permit data (ArcGIS `miamidade_permit_data`): DROP (but noted)

- It has an `ArchitectName` field. New construction ≥6 floors or ≥50 units since 2026-05-01
  returned 60 records (the page limit), all read. Large towers appear (8000 East Dr, 44 floors,
  Harbor Island Dev Company; 1700 NE 4 Ave, 39 floors; 1600 NE 2 Ave, 33 floors), but
  `ArchitectName` is "NOT LISTED" on every one of them. Architects are filled in only on small
  affordable or rental jobs (Flux Architects, GHA Architects, Palenzuela & Hevia). These are issued
  sub-permits (site access, water main, temporary power), so they come late.

### 13. Miami-Dade "Permits Requiring Allocation" and "DERM Sewer Allocation": DROP

- 80 recent records read. PROJDESC is the existing land use ("CONDO/APT INDIVIDUAL UNIT", "HOTEL"),
  so these are mostly renovations of existing units and hotels. Owner names only.

### 14. Miami-Dade "Land Management Hearing - View": DROP

- The newest OBJECTIDs carry `APPL_YEAR 2000`, so the ordering is not by date. It holds the applicant
  name and board but no project description, and covers unincorporated county only. Not pursued.

## Dead ends and unreachable

- **Miami Beach DRB / HPB / Planning Board.** The agendas live in NovusAgenda
  (`miamibeach.novusagenda.com/agendapublic/`, HTTP 200). The meeting types are listed (DRB = 6,
  HPB = 7, Planning Board = 8), but the listing needs an ASP.NET postback, which is a form
  submission, so I did not attempt it. Guessed RSS paths (`rss.aspx`, `RSS.aspx`,
  `AgendaRSS.aspx`) all returned 404. The WordPress media API (`/wp-json/wp/v2/media?search=DRB`)
  works but holds only city capital-project presentations, not private DRB applications.
- **City of Miami.** The Legistar client `miamifl` exists, but its last event was 2026-06-04, with
  0 matters since August, so it is stale. `miamifl.iqm2.com` timed out (connection 000) on two
  tries.
- **Miami-Dade County Legistar** (`miamidade`): the last event was in 2018. Stale.
- **Florida DBPR condominium filings.** Every URL tried returned 403 with a Cloudflare "Just a
  moment..." challenge. This is bot detection, so I did not proceed.
- **San Diego development permits** (`seshat.datasd.org/development_permits/*.csv`): the TLS
  certificate is expired ("SSL certificate problem: certificate has expired"). Not verified. The
  production fetcher would fail the same way.
- **Town of Palm Beach.** The CivicPlus Agenda Center RSS
  (`townofpalmbeach.com/RSSFeed.aspx?ModID=65&CID=All-0`) returned HTTP 200 with an empty channel
  (0 items). The `/AgendaCenter` page returned 404. ARCOM agendas were not found by another route.
- **West Palm Beach, Santa Monica, West Hollywood, San Diego, LA City, Chicago, DC.** No Legistar
  web API client under any slug tried (HTTP 500). Beverly Hills, sfgov and longbeach have clients
  but returned 0 matters since August.
- **Socrata catalog.** No SF, Seattle or Chicago design-review dataset. NYC "Public Design
  Commission Monthly Design Review" exists (`tfrc-rjtr`), but New York is outside this angle.

## If the SF source is built

- Add `socrata_sfplanning` to `STRUCTURED_SOURCE_TYPES` in `ny-native.ts`, with a fetcher modeled
  on `fetchZapProjects`: a 120-day lookback, `new_construction='CHECKED'`, and
  `number_of_units_prop>=40 OR visitor_prop>0 OR office_prop>=100000`.
- Map `applicant_org` to `architect` only when it is not a law firm (`LLP|Law|P.C.`).
- Use `pim_link` as the source URL, with dedup on the address.
- Expect about 2 candidates a month and about 1 clear fit.
