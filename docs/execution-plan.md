# Execution plan — Oaki consolidation merge

> Approved by Demian on 2026-05-20. Supersedes the merge order in `audit-recommendation.md` with the decisions below baked in.

## Decisions locked in

| # | Question | Decision |
|---|---|---|
| 1 | Storage | **Hybrid.** Sheets for human-touched entities (Lead, Company, Opportunity, Interaction, MeetingPrep, Campaign, ResearchFinding, AIInsight). Supabase for machine-generated (Discovery, RawArticle, AnalyzedArticle, Source, IngestionRun, Thread, ThreadAnalysis, app_secrets). |
| 2 | `.exe` distribution | **Drop.** Webapp on Vercel only. Drop `pkg`, `launcher.js`, `xcopy` build script, `output: 'standalone'` config from Terminal. |
| 3 | `/api/research/extract` | **Treat as orphan.** Delete during Phase 4 cleanup unless something turns up. |
| 4 | Fase B Spanish prompt | **Translate to English.** All prompts in the merged app are English. |
| 5 | Lead source | **Apollo CSV import** (existing flow). |
| 6 | Hosting | **Vercel Pro + Supabase Free.** ~$20/mo. Pro plan unlocks 300s function timeouts (clean ingestion path). Supabase Free works for single-user because the daily ingestion cron prevents the 7-day-inactivity autopause. Bump Supabase to Pro later if storage/throughput grows. |
| 7 | Apollo + Prospecting placement | **Both under `/import`** — `/import/apollo` + `/import/prospecting`. Parent sidebar entry: "Import". |
| 8 | Auth | **Basic single-user auth.** Cookie session + `APP_PASSWORD` env var + Next.js middleware. |
| 9 | Strategic Map | **Hidden from sidebar.** File stays; nav entry removed. |
| 10 | Miro plan | **Out of scope.** `docs/miro-integration-plan.md` untouched. |

## Vercel-specific implications worth flagging

These reshape the plan compared to the audit's local-dev assumptions:

1. **`gmail_tokens.json` on disk won't survive Vercel deploys.** Move to a Supabase `app_secrets` table (single row). Migration happens in Phase 2 alongside Supabase setup.
2. **Vercel function timeout.** Default 10s (hobby) / 60s (pro). Ingestion runs need explicit `maxDuration` config (up to 300s on pro). We'll set per-route. **Confirm Demian's Vercel plan** — affects whether ingestion needs chunking.
3. **Vercel cron** replaces Terminal's `vercel.json` cron config. Re-declare in the merged app's `vercel.json`. Authentication via `INGEST_SECRET` bearer (Terminal's existing pattern works on Vercel).
4. **Gmail OAuth redirect URI** must point to the production Vercel URL (`https://<project>.vercel.app/api/gmail/callback` or custom domain). Update in Google Cloud Console + env var. Local dev keeps `http://localhost:3000/api/gmail/callback` via env-driven config.
5. **No `output: 'standalone'`** — Vercel handles bundling natively. Drop Terminal's standalone config when porting.
6. **Apollo CSV body size** — Vercel default body limit is 4.5MB on App Router; raise to 10MB via `route segment config` if Apollo exports are large.

---

## Phase 0 — Pre-flight (Demian)

Tasks for Demian. Block all other phases until done.

| Task | Owner | Notes |
|---|---|---|
| **0.1** Create new Supabase project (or confirm reuse of Terminal's existing one) | Demian | If reusing Terminal's, capture URL + anon key + service role key. If new, run `supabase/schema.sql` (Phase 2 will provide). |
| **0.2** Create Vercel project | Demian | Linked to a GitHub repo (next item). Note the project name + production URL. |
| **0.3** Confirm GitHub repo strategy | Demian | Options: (a) push merged app to `sales-pipeline` repo (current Oaki Relations repo); (b) new repo `oaki-app` or similar. Recommended: (a) — preserves history, simplest. |
| **0.4** Confirm Google service-account creds still valid | Demian | `GOOGLE_SHEET_ID`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` — same ones Relations uses today. |
| **0.5** Confirm Tavily API key + quota | Demian | Fase B's existing key, or new. Note current usage if shared. |
| **0.6** Confirm `ANTHROPIC_API_KEY` will be reused | Demian | Single key across all merged flows; usage will spike vs Relations-only baseline. |

**Phase 0 success criteria**: Demian has the env values ready to hand back when Phase 4 deploys.

---

## Phase 1 — Foundation (Claude codes)

Pure local work. Ends with a working merged-app skeleton on Relations' codebase that compiles and runs identically to today — no new features yet, but the plumbing for everything else is in place.

| Step | What |
|---|---|
| **1.1** | Add `.env.example` to Relations covering all current 7 keys + new ones from Terminal/Fase B/auth/Supabase. |
| **1.2** | Add `lib/env.ts` — Zod-validated env at boot (Fase B pattern). |
| **1.3** | Add deps: `@supabase/supabase-js`, `zod`, `jsonrepair`, `rss-parser`. |
| **1.4** | Build `lib/ai/{client,parse,timeout}.ts` — single Anthropic client (already on 0.97), `jsonrepair`+Zod parsing helper, `withTimeout` wrapper. |
| **1.5** | Extract Relations' inline prompts to `lib/prompts/{brand.ts, lead/, research/, conversations/}`. Refactor `lib/claude.ts` to import from prompts dir + use new ai client. **Verify no regressions** — every existing Claude flow still works locally. |
| **1.6** | Add `Discovery`, `RawArticle`, `AnalyzedArticle`, `Source`, `IngestionRun`, `Thread`, `ThreadAnalysis`, `FirmCandidate` to `lib/types.ts` (type-only; no implementations yet). |
| **1.7** | Rename `DiscoveryPrepOutput` → `MeetingPrepOutput` and `/api/discovery` → `/api/meeting-prep`, `/discovery/[id]` → `/meeting-prep/[id]`. Sidebar nav updated. Sheets tab can stay named `DiscoveryPrep` for now (rename is a separate Sheets-tab task). |
| **1.8** | Add `components/ui/icons.tsx` — import Terminal's icon set verbatim. Use it in 1–2 places to verify it renders. |
| **1.9** | Adopt Tailwind v4 settings consistent across what we'll inherit. No visual changes yet. |

**Phase 1 success criteria**: Relations app boots, all existing pages work, all Claude flows still respond, `tsc` clean, no UI regressions. Nothing is deployed.

**Demian's task between Phase 1 and Phase 2**: none — still local.

---

## Phase 2 — Supabase + Discoveries (Claude codes; Demian provisions)

Port Opportunity Terminal's ingestion + discovery feed under the new `Discovery` name. Add Supabase. Migrate Gmail tokens off the filesystem (needed for Vercel).

| Step | What |
|---|---|
| **2.1** | Add `supabase/schema.sql` to repo: Terminal's six tables (`sources`, `opportunities` → renamed to `discoveries`, `ingestion_runs`, `raw_articles`, `analyzed_articles`, `generated_outputs`) + new tables (`threads`, `thread_analyses`, `app_secrets`). |
| **2.2** | Add `lib/supabase.ts` — public client + service client, env-driven. |
| **2.3** | Port Terminal's ingestion pipeline to `lib/discoveries/{processor,rss,sources}.ts`. Adapt to use unified ai client. |
| **2.4** | Port Terminal's frontend pages: `/discoveries` (feed), `/discoveries/[id]` (detail). Re-skin to Relations' design tokens (`--accent`, `--surface`, etc.). |
| **2.5** | Port Terminal's API routes under new namespace: `/api/discoveries`, `/api/discoveries/[id]`, `/api/discoveries/ingest` (POST + GET cron), `/api/discoveries/ingest/[runId]`. Bearer auth via `INGEST_SECRET` (Terminal's pattern). |
| **2.6** | Port Terminal's generators with shared brand voice: `/api/discoveries/[id]/generate/{letter,email,linkedin}`. Outputs save to `Interaction` table with `direction='draft'` + `channel='letter'\|'email'\|'linkedin'`. |
| **2.7** | Add Discovery → Opportunity promotion flow: button on `/discoveries/[id]`; opens a small modal/form to attach a Lead; creates an Opportunity row in Sheets with `discovered_from_url` field carrying provenance. |
| **2.8** | **Migrate Gmail tokens to Supabase.** Rewrite `lib/gmail/client.ts` token I/O: read/write from `app_secrets` table instead of `gmail_tokens.json`. Add migration helper that runs once on first load if local `gmail_tokens.json` exists, copying to Supabase. |
| **2.9** | Add `/discoveries` to sidebar nav. |
| **2.10** | Add `vercel.json` with cron config for `/api/discoveries/ingest` (GET) at appropriate cadence (e.g., `0 */6 * * *` — every 6 hours). |

**Phase 2 success criteria**: Discoveries feed renders locally; ingestion runs against real Supabase; Gmail OAuth round-trips with tokens in Supabase; Discovery → Opportunity promotion creates Sheet row.

**Demian's tasks between Phase 2 and Phase 3**:

| Task | Notes |
|---|---|
| **D2.1** Run `supabase/schema.sql` against the Supabase project | Either via SQL editor or `supabase db push` |
| **D2.2** Provide Supabase env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **D2.3** Generate `INGEST_SECRET` | Strong random string for bearer auth |
| **D2.4** Decide ingestion cadence | Default suggestion: every 6 hours. Adjust in `vercel.json` |

---

## Phase 3 — Prospecting (Claude codes; Demian provides Tavily key)

Port Fase B's article→firm logic. **Discard the Vite SPA entirely**; rebuild UI inside Relations under `/import/prospecting`.

| Step | What |
|---|---|
| **3.1** | Port Fase B services to `lib/prospecting/{tavily,jinaReader,costEstimate,export,promote}.ts`. Strip Express/dotenv dependencies. Use unified ai client + env validation. |
| **3.2** | Translate Fase B's Spanish system prompt to English. Save as `lib/prompts/prospecting/select-firms.ts`. Apply shared `BRAND_VOICE` fragment for consistency. |
| **3.3** | Port API routes: `/api/prospecting/analyze` (POST: URL → article + firms), `/api/prospecting/export` (POST: CSV download). |
| **3.4** | Build new `/import/prospecting` page in Relations' style. Components: URL form, article summary card, firm list with score badges (Relations' tokens, not Fase B's), cost estimate card, export bar, loading + error states. |
| **3.5** | Restructure `/import` as parent with two children: `/import/apollo` (existing) + `/import/prospecting` (new). Sidebar shows "Import" with two sub-items. |
| **3.6** | Add FirmCandidate → Company promotion: button on each firm card. Maps Fase B's 6 fields onto Relations' Company schema (others left blank). Creates Company in Sheets; opens `/companies/[id]` for Demian to enrich. Guards against creating duplicates by name match (warn, don't block). |
| **3.7** | Apollo + Prospecting share UX patterns where possible (loading, error banner, success toast — uses Fase B's `LoadingState` + `ErrorBanner` shapes as `components/ui/{Loading,Banner}.tsx`). |

**Phase 3 success criteria**: Paste a URL on `/import/prospecting`, get article + 5–8 firms, promote one to a Company in Sheets, edit it in Relations.

**Demian's tasks between Phase 3 and Phase 4**:

| Task | Notes |
|---|---|
| **D3.1** Provide Tavily API key | `TAVILY_API_KEY` (plus optional tuning vars from Fase B's `.env.example`) |

---

## Phase 4 — Auth, cleanup, Vercel deploy (Claude codes + Demian deploys)

Final polish, auth, deployment.

| Step | What |
|---|---|
| **4.1** | Add `middleware.ts` at repo root — Next.js middleware checks for `oaki_session` cookie. If absent and path isn't `/login` / `/api/gmail/callback` / `/api/discoveries/ingest` (cron uses bearer), redirect to `/login`. |
| **4.2** | Add `/login` page — single password field; POST validates against `APP_PASSWORD` env var; sets `oaki_session` cookie (HTTP-only, secure, sameSite=lax, ~30 day expiry). Add `/logout` route that clears cookie. |
| **4.3** | Delete `/api/research/extract` route (orphan candidate from audit Q3). |
| **4.4** | Hide Strategic Map from sidebar (keep file). |
| **4.5** | Remove all references to legacy `Opportunity` (Terminal's old name) — should already be done in Phase 2; double-check with grep. |
| **4.6** | Update `CLAUDE.md` / `AGENTS.md` with: hybrid storage model, "no automation, no mass outreach" principles, key folders. |
| **4.7** | E2E smoke pass locally: login → Today → create Lead → create Opportunity → import Apollo CSV → run Prospecting on a URL → promote firm → run Discoveries ingest → analyze a Discovery → generate a letter → check Gmail conversations → analyze a thread → log out. |
| **4.8** | First Vercel deploy. |

**Phase 4 success criteria**: Merged app live at the Vercel URL, login works, every flow above works in production.

**Demian's tasks for first deploy**:

| Task | Notes |
|---|---|
| **D4.1** Set all env vars in Vercel | Full list below |
| **D4.2** Update Google OAuth redirect URI | Add `https://<your-vercel-url>/api/gmail/callback` to authorized redirects in Google Cloud Console |
| **D4.3** Set `GOOGLE_OAUTH_REDIRECT_URI` env var to production URL | |
| **D4.4** Set `APP_PASSWORD` env var | Strong password for single-user login |
| **D4.5** Set `maxDuration` per-route in code | Vercel Pro confirmed → ingestion routes can use up to 300s |
| **D4.6** Trigger first Discoveries ingestion manually | POST to `/api/discoveries/ingest` with bearer; verify Supabase rows appear |
| **D4.7** Connect Gmail via `/settings` on deployed app | Verify tokens persist to Supabase, survive a redeploy |

### Full Vercel env var list

```
# Anthropic
ANTHROPIC_API_KEY                    (server-only)
ANTHROPIC_MODEL                      (default claude-sonnet-4-6)
ANTHROPIC_TIMEOUT_MS                 (default 90000)

# Google Sheets (service account)
GOOGLE_SHEET_ID
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY                   (paste multiline value; Vercel handles \n)

# Google OAuth (Gmail)
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI            (https://<vercel-url>/api/gmail/callback)

# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Discoveries ingestion
INGEST_SECRET                        (strong random; bearer for /api/discoveries/ingest POST)

# Prospecting
TAVILY_API_KEY
TAVILY_BASE_URL                      (https://api.tavily.com)
TAVILY_SEARCH_DEPTH                  (basic)
TAVILY_MAX_RESULTS_PER_QUERY         (8)
TAVILY_TIMEOUT_MS                    (20000)
JINA_READER_BASE_URL                 (https://r.jina.ai)
JINA_TIMEOUT_MS                      (25000)
ARTICLE_MAX_CHARS                    (20000)

# Auth
APP_PASSWORD                         (strong; single-user login password)
SESSION_SECRET                       (strong random; for signing the cookie)
```

(The `GOOGLE_*` vs `GOOGLE_SHEETS_*` naming question from audit-integrations.md: **going with Relations' names** since they're already in use and the merge work is large enough — not worth the cross-cutting rename.)

---

## What's not in this plan (deferred)

| Item | Why |
|---|---|
| Strategic Map | Demian deprioritized (Q9) |
| Miro integration | Out of scope (Q10) |
| Migrate `Date.now()` IDs to UUIDs | Polish; ship first |
| Add Zod validation on API POST bodies | Polish; single-user mitigates risk |
| Pino structured logging | Optional; Vercel logs are fine |
| Multi-user / RBAC auth | Q6 says single user for now |
| Persist Gmail thread sync to Sheets | Trade-off; session-memory is fine for v1, persistence can wait |
| Replacing `mock-data.ts` | Keep for dev safety net |

---

## Rollback strategy

Each phase ends in a commit. If anything breaks:

- **Phase 1**: revert; Relations works as before.
- **Phase 2**: revert; the `gmail_tokens.json` migration in 2.8 is the only thing with a writeback (and the local file is preserved during migration — see 2.8).
- **Phase 3**: revert; no Sheets writes happen until Demian promotes a firm.
- **Phase 4**: roll back Vercel deployment to previous; rebuild from last good commit. Supabase + Sheets data unaffected.

No destructive migrations. Sheets data and Supabase data are append-only or row-level-update.

---

## Pacing

If we work straight through:

- Phase 1: 2–3 sessions
- Phase 2: 3–5 sessions
- Phase 3: 2–4 sessions
- Phase 4: 1–2 sessions + Demian's deploy steps

**Recommended cadence**: complete each phase, run it locally, then Demian provisions / approves before moving to the next. Avoids debugging cross-phase changes when something breaks.

---

## Open follow-ups (non-blocking)

1. After Phase 4 ships, decide if `gmail_tokens.json` migration helper (Phase 2.8) can be deleted — it's only needed once.
2. After first week of production use, revisit Vercel function timeouts based on real ingestion runs.
3. Pick a single canonical date for "deploy day" so docs can reference it.
4. Decide later whether the `INGEST_SECRET` cron endpoint should be split (one secret for manual triggers, one for Vercel cron header check) — current plan combines them.
