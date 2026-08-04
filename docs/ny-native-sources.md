# NY-native signal sources (2026-08-04)

NY doesn't announce via press — it files papers. Three filing-based lanes feed
the discovery board alongside the RSS lanes. Handoff:
`ny-native-signal-sourcing-handoff-2026-08-04.md` (Work Assistant / handoffs).

## Lanes

| Lane | discovery_kind | Source | How it runs |
|---|---|---|---|
| DOB new-building filings | `permit_filing` | NYC Open Data Socrata `w9ak-ipjd` (DOB NOW job filings) | Automatic — cron + "Run research" dispatch via `lib/discoveries/ny-native.ts` |
| ZAP / ULURP | `opportunity_signal` | NYC Open Data Socrata `hgx4-8ukb` (DCP ZAP project data) | Automatic — runs with the opportunity-signal mode; feeds the value lane (`work_categories` development+architecture, geo nyc) |
| AG offering plans | `offering_plan` | NYS AG Real Estate Finance Bureau offering-plan database | **Manual** — no public API; the JSP search app is not reliably scrapable headless |

## Filters (in code, `lib/discoveries/ny-native.ts`)

- **DOB**: job_type "New Building", boroughs Manhattan/Brooklyn, ≥15 stories OR
  ≥$50M est. cost (filtered server-side via Socrata `::number` casts), 120-day
  lookback. Manhattan filings that clear the size bar qualify anywhere (the
  Extell 65th St hook sits on no named corridor); Brooklyn additionally requires
  a waterfront-corridor match (Williamsburg / Greenpoint / Dumbo streets). Medium score (55, watchlist) — the hook is
  speculative ("the site exists, the design doesn't"), drafts carry a
  conditional per the skill.
- **ZAP**: residential/mixed-use briefs only, ≥100 units or ≥200k sf parsed
  from the project brief; small-ULURP noise is dropped at ingestion.
- Both lanes run gate-0 (standing-rulings auto-kills) at insert: a hit lands as
  `work_status='rejected'` with `work_reason='ingestion gate-0: <rule>'`.

Dedup is by `project_key` (address/project name + New York), across kinds and
board statuses — a filing that later hits the press collapses onto the same row.

## AG offering plans — the Monday manual step

Every Monday pre-sweep:

1. Search the AG database (Real Estate Finance Bureau, offering plan data
   search) for plans submitted/accepted in the last week — new construction
   condos, Manhattan/Brooklyn premium first.
2. Skip conversion coops, affordable, and anything hit by the standing-rulings
   kills (segment/geo).
3. Enter each keeper:

```
POST /api/discoveries
{
  "title": "<project name> — offering plan accepted",
  "source": "NYS AG offering plans — manual sweep <date>",
  "discovery_kind": "offering_plan",
  "address": "<street address>",
  "sponsor": "<sponsor LLC — the real developer usually needs excavation>",
  "geo": "nyc",
  "work_categories": ["new_dev_marketing", "development"],
  "work_status": "unworked",
  "work_reason": "offering plan <submitted|accepted> <date> — sales open in weeks",
  "icp_fit_score": 85
}
```

`address` becomes the dedup identity (`project_key`); `sponsor` lands in
`developer`. Acceptance = sales start in weeks = the imagery-purchase moment —
score it high (≥85 for new-construction Manhattan/Brooklyn premium).

The board's **NY Filings** toggle shows `offering_plan` + `permit_filing` rows.

## new_dev_marketing category

Brokerage new-development marketing divisions (Corcoran Sunshine, Elliman
Development Marketing, SERHANT New Dev, Compass Development, BHS Dev Marketing)
are an enabled buyer category (Demi ruling 4-ago-2026 — exception to
"brokerages = noise"). Matching:

- `offering_plan` signals match `new_dev_marketing` + `development`
- NY `upstream_signal` (ZAP) matches `development` + `architecture` — the
  marketing divisions enter when a project is heading to sales, not at rezoning.
