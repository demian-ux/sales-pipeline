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
  mode + `sources_health` (ONLY feeds currently degraded/dead — `[]` means all
  healthy; `sources_summary: { active, ok, unhealthy }` confirms the count).
  Reading it (or polling a run/job) also sweeps killed runs: anything still
  `running` after 8 min is marked failed and the lock released.
- Scheduled ingest: Vercel cron every 6h runs `permit_filing` → `project_launch`
  → `opportunity_signal`. Until 2026-09-17 the cron never fired a run (the route
  gated on an `x-vercel-cron` header Vercel doesn't send).
- `POST /api/discoveries/ingest?mode=` remains the underlying endpoint (cron + UI).

### Sources CRUD + feed health

- `GET /api/sources` — all feeds with health columns (`health`, `consecutive_failures`,
  `last_success_at`, `last_error`). Filters: `?discovery_kind=`, `?active=`, `?health=`.
- `POST /api/sources`, `PATCH /api/sources/{id}` — create/edit. A new or changed
  URL is test-fetched first and rejected if it doesn't parse
  (`skip_validation: true` overrides). No DELETE — deactivate with `active: false`.
- Health is stamped by every ingestion run: 1–2 consecutive failed fetches =
  `degraded`, 3+ = `dead`. Requires `supabase/migrations/2026-08-25_source_health.sql`.

### Daily-workflow endpoints (2026-08-27)

- `POST /api/log-send` — compound send logger: `{ email, subject,
  gmail_thread_id, sent_at, direction?, create_if_missing?: { full_name,
  company, title?, notes? } }`. Resolves the lead by exact email (creates it
  when `create_if_missing` is given), logs the Email interaction, advances
  New Lead/Held/Nurture/Dormant → Contacted, sets `next_followup_date`
  = sent_at + 7d. Idempotent on (email, gmail_thread_id, sent_at): replays
  return `200 { already_logged: true }`.
- `POST /api/leads/batch` — array of leads (or `{ leads: [...] }`), max 100;
  per-item `{ ok, lead_id | error }`. `PATCH /api/leads/batch` — array of
  `{ lead_id, changes }` (or `{ updates: [...] }`), per-item results.
- `PATCH /api/leads/{id}` answers `429` + `Retry-After: 60` (`retryable: true`,
  nothing written) when Google Sheets throttles (60 reads/min) — wait and retry,
  or use `PATCH /api/leads/batch` for many leads. It never 404s a real lead on a
  throttled read anymore.
- `POST /api/discoveries` (manual entry) — required: `title`, `source`,
  `work_reason` (the why-benched line; no silent parks). Optional: `url` (alias
  `source_url`), `brief_summary`, `category`, `geo`, `icp_fit_score`,
  `re_arm_at`, `discovery_kind`, `address`, `sponsor`, `work_categories`,
  `work_status` (default `held`), `status`. Unknown fields → 400 listing
  `rejected_fields` + `accepted_fields`.
- `GET /api/leads` filters: `email=` (exact), `followup_due=YYYY-MM-DD|today`
  (next_followup_date on/before), `updated_after=` (incremental cursor), plus
  the existing `stage`, `temperature`, `company`, `q`.
- `GET /api/leads/{id}/interactions?limit=&offset=` — paginated, `total`
  included. `POST` there is idempotent on (gmail_thread_id, sent_at) → `200
  { already_logged: true }`. `DELETE /api/leads/{id}/interactions/{int_id}`
  removes a mis-logged row.
- `GET /api/discoveries` filters: `created_after=` / `created_before=` (row
  creation, not article pub date) and `sort_by=created_at`. `status=all` now
  really returns every row (worked + disqualified included).
- `DELETE /api/companies/{id}` (409s if leads still reference it; `?force=true`
  overrides). `POST /api/companies/merge { keep_id, merge_ids }` repoints
  Leads/Opportunities/Interactions and deletes the merged rows.

### API quirks worth knowing

- Pagination is `limit` + `offset` everywhere it exists (discoveries, leads,
  firm-pool); responses include `total`. `page`/`per_page` are rejected with a 400.
- `POST /api/leads` requires `full_name` (not `name` — the 400 says so). A
  duplicate returns `409 { duplicate_of }`.
- Discovery `work_status` enum includes `value-batch-consumed` (a value-outreach
  batch consumed the signal; hidden from the default board like other worked states).
- `next_followup_date` on lead PATCH accepts `null` or `''` to clear.
- Discovery list rows include both `discovery_kind` and its alias `kind`.
- `GET /api/discoveries` without `kind=` returns ONLY `project_launch` rows
  (the default board). Pass `kind=` (explicit empty) for every lane, or name
  one (`opportunity_signal`/`upstream_signal`, `offering_plan`, `permit_filing`).
  An "everything saved today" audit is `status=all&kind=&created_after=...`.
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
