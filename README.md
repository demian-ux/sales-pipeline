# Oaki — sales pipeline app

Next.js 16 app on Vercel (production: sales-pipeline-gray.vercel.app). Project
guide, conventions, and architecture: [AGENTS.md](AGENTS.md).

```bash
npm run dev       # local dev server
npm run build     # production build
npm run lint      # eslint
npx tsc --noEmit  # type check
```

## API access for automation

Every `/api/*` route accepts `Authorization: Bearer <OAKI_API_KEY>` as an
alternative to the session cookie. The prospecting workflow operates the app by
API from a sandbox; the sections below document what that surface covers.

### Research triggers (API-first since 2026-08-25)

- `POST /api/research/run` → starts a Project Launches run. `202 { job_id, run_id }`.
- `POST /api/opportunities/run` → starts an Opportunity Signals run. Same shape.
- Both are idempotent under concurrency: if a run is already live they return
  `409 { job_id, already_running: true }` with the existing run's id.
- `GET /api/jobs/{job_id}` → `{ status: queued|running|done|failed, progress_pct,
  phase, mode, candidates_analyzed, new_saved, failed_sources, run }`.
- `GET /api/research/last-run` → report of the latest finished run + latest per
  mode + `sources_health` (feeds currently degraded/dead).
- `POST /api/discoveries/ingest?mode=` remains the underlying endpoint (cron + UI).

### Sources CRUD + feed health

- `GET /api/sources` — all feeds with health columns (`health`, `consecutive_failures`,
  `last_success_at`, `last_error`). Filters: `?discovery_kind=`, `?active=`, `?health=`.
- `POST /api/sources`, `PATCH /api/sources/{id}` — create/edit. A new or changed
  URL is test-fetched first and rejected if it doesn't parse
  (`skip_validation: true` overrides). No DELETE — deactivate with `active: false`.
- Health is stamped by every ingestion run: 1–2 consecutive failed fetches =
  `degraded`, 3+ = `dead`. Requires `supabase/migrations/2026-08-25_source_health.sql`.

### API quirks worth knowing

- Pagination is `limit` + `offset` everywhere it exists (discoveries, leads,
  firm-pool); responses include `total`. `page`/`per_page` are rejected with a 400.
- `POST /api/leads` requires `full_name` (not `name` — the 400 says so). A
  duplicate returns `409 { duplicate_of }`.
- Discovery `work_status` enum includes `value-batch-consumed` (a value-outreach
  batch consumed the signal; hidden from the default board like other worked states).
- `next_followup_date` on lead PATCH accepts `null` or `''` to clear.
- Discovery list rows include both `discovery_kind` and its alias `kind`.
- Firm-pool GET filters: `category`, `geo`, `pool_status`, `signal_ref`,
  `untouched_since`, plus `limit`/`offset`.

### Still UI-only (needs Chrome)

- Gmail connect/OAuth flow and conversation analysis views.
- Draft review/editing UX (draft content is reachable via `/api/drafts`, but
  the review-and-approve flow is the UI).
- Apollo CSV import (`/import/apollo`) and prospecting article import UI.
- Seats Gate-1 review queue interactions (`/seats` — approve/reject exist as
  API endpoints, but the review context lives in the UI).
- Dashboard/strategic-map visualizations.

### Vercel Security Checkpoint

A burst of malformed requests can trip Vercel's attack-mode challenge: `/api/*`
then returns 403/HTML for a while (observed ~40 min on 2026-08-25) even with a
valid Bearer key. There is no per-path exemption on our plan. If you get
403/HTML from endpoints that normally work: stop, wait ~15–45 minutes, and
retry gently — hammering the challenge extends it.
