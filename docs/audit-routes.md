# Audit — Routes

> Frontend routes, API routes, dynamic segments, OAuth callbacks, webhooks, server actions across the three projects.

## TL;DR

- **No direct URL collisions** between the three apps today, because they ship as separate apps on separate ports.
- **In a merged app, three structural collisions surface**: `/opportunities` (different meanings), `/api/opportunities` (different shapes), and `/api/generate/{letter,email,linkedin}` (Terminal-only but overlaps with Relations' existing "draft via insight" flow).
- Only one OAuth callback exists in the bundle: Relations' `/api/gmail/callback`. Terminal's `/api/ingest` GET uses Vercel cron header; POST uses a bearer token.

---

## Oaki Relations — full route inventory

### Frontend pages (17)

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Today dashboard |
| `/campaigns` | `src/app/campaigns/page.tsx` | Campaign list |
| `/companies/[id]` | `src/app/companies/[id]/page.tsx` | Company detail |
| `/conversations` | `src/app/conversations/page.tsx` | Gmail thread list |
| `/discovery/[id]` | `src/app/discovery/[id]/page.tsx` | Discovery prep for a lead |
| `/draft-queue` | `src/app/draft-queue/page.tsx` | Drafts ready to copy/send |
| `/import/apollo` | `src/app/import/apollo/page.tsx` | Apollo CSV import preview |
| `/insights` | `src/app/insights/page.tsx` | AI insight list |
| `/leads/new` | `src/app/leads/new/page.tsx` | Create lead form |
| `/leads/[id]` | `src/app/leads/[id]/page.tsx` | Lead detail |
| `/opportunities` | `src/app/opportunities/page.tsx` | **Lead-attached** opportunity list |
| `/pipeline` | `src/app/pipeline/page.tsx` | Pipeline view |
| `/relationships` | `src/app/relationships/page.tsx` | Relationship overview |
| `/research` | `src/app/research/page.tsx` | Research tool |
| `/research-inbox` | `src/app/research-inbox/page.tsx` | Research ingestion + signal extraction |
| `/settings` | `src/app/settings/page.tsx` | App settings |
| `/strategic-map` | `src/app/strategic-map/page.tsx` | (placeholder — incomplete) |

### API routes (24)

| Route | Methods | Purpose |
|---|---|---|
| `/api/leads` | GET, POST | List/create leads |
| `/api/leads/[id]` | GET, PATCH | Single lead |
| `/api/companies/[id]` | GET | Single company |
| `/api/opportunities` | GET, POST | **Lead-attached** opportunities |
| `/api/opportunities/[id]` | PATCH | Update status |
| `/api/research` | GET, POST | Research findings |
| `/api/research/extract` | POST | (route exists; flow unclear) |
| `/api/ai/extract-research-signals` | POST | Claude: raw text → signals |
| `/api/ai/linkedin-strategy` | POST | Claude: LinkedIn action recommendation |
| `/api/ai/prioritize-stakeholders` | POST | Claude: rank contacts at a firm |
| `/api/analyze` | POST | Claude: lead "why now" analysis |
| `/api/insights` | GET, POST | AI insights |
| `/api/interactions` | GET, POST | Touchpoints |
| `/api/campaigns` | GET | Campaign list |
| `/api/discovery` | POST | Save discovery prep |
| `/api/gmail/auth` | GET, DELETE | OAuth initiate / disconnect |
| `/api/gmail/callback` | GET | OAuth code exchange |
| `/api/gmail/status` | GET | Connection status |
| `/api/gmail/sync` | POST | Sync threads (to session memory) |
| `/api/gmail/analyze` | POST | Claude: analyze single thread |
| `/api/gmail/create-draft` | POST | (incomplete) |
| `/api/import/apollo` | POST | Apollo CSV import handler |
| `/api/settings/status` | GET | Config status check |
| `/api/workflow/track` | POST | Workflow action log |

### Dynamic segments
- `[id]` in `/leads/[id]`, `/companies/[id]`, `/discovery/[id]`, `/api/leads/[id]`, `/api/companies/[id]`, `/api/opportunities/[id]`. No catch-all routes.

### OAuth callbacks
- `/api/gmail/callback` — Google OAuth code exchange. Default redirect URI `http://localhost:3000/api/gmail/callback`. **The only OAuth in the bundle.**

### Webhooks
- None.

### Server actions
- None (no `"use server"` files outside API routes).

---

## Opportunity Terminal — full route inventory

### Frontend pages (2)

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Opportunity feed |
| `/opportunity/[id]` | `src/app/opportunity/[id]/page.tsx` | **Market-signal** opportunity detail |

### API routes (9)

| Route | Methods | Purpose |
|---|---|---|
| `/api/ingest` | POST | Manual ingest (requires `Authorization: Bearer ${INGEST_SECRET}`) |
| `/api/ingest` | GET | Cron trigger (Vercel `x-vercel-cron: 1`) or run history |
| `/api/research/start` | POST | Start ingestion run |
| `/api/research/status/[id]` | GET | Poll run status |
| `/api/opportunities` | GET | **Market-signal** opportunity list w/ filters |
| `/api/opportunities/[id]` | GET | Single market-signal opportunity |
| `/api/generate/letter` | POST | Claude: 280-350 word marketing letter |
| `/api/generate/email` | POST | Claude: 100-160 word email follow-up |
| `/api/generate/linkedin` | POST | Claude: ≤300 char LinkedIn message |

### Dynamic segments
- `[id]` in `/opportunity/[id]`, `/api/opportunities/[id]`, `/api/research/status/[id]`.

### OAuth callbacks
- None.

### Webhooks / cron
- `GET /api/ingest` doubles as a cron endpoint. Triggered by Vercel cron header.

### Server actions
- `triggerIngest()` in `src/app/actions.ts` (wraps `/api/ingest` with 5-min timeout). **The only server action in the bundle.**

---

## Fase B — full route inventory

### Web app (Vite SPA)
- No URL routing — single component tree (`App.tsx`).

### API routes (apps/api, port 4000)

| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | `/api/health` | inline | Health check |
| POST | `/api/analyze` | `analyzeController` | URL → Jina extract → Claude metadata → Tavily search → Claude firm-scoring |
| POST | `/api/export` | `exportController` | Build CSV from `{ article, firms }` |

**Auth:** None. CORS hard-coded to `http://localhost:5173`.

### OAuth / webhooks / server actions
- None.

---

## Route conflict & merge table

> Status legend — **K**eep / **M**erge (combine logic) / **R**ename / **D**rop.

### Frontend conflicts

| Route | Project | Purpose | Action | Notes |
|---|---|---|---|---|
| `/` | Relations | Today dashboard | **K** | Keep as the merged shell's home. |
| `/` | Terminal | Opportunity feed | **R** | Move under `/discoveries` or `/market-signals` (new namespace, see below). |
| `/opportunities` | Relations | Lead-attached opportunities | **K** | Original meaning. |
| `/opportunity/[id]` | Terminal | Market-signal article detail | **R** | Move to `/discoveries/[id]` — "Opportunity" already means something specific in Relations, and conflating the two will be confusing. |
| Fase B SPA root | Fase B | Article-to-firm prospecting | **R** | New page `/prospecting` or `/firms` under Relations shell; the Vite SPA should not survive. |

### API route conflicts

| Route | Project | Purpose | Action | Notes |
|---|---|---|---|---|
| `/api/opportunities` | Relations | List/create lead opportunities | **K** | Owns the "Opportunity" entity. |
| `/api/opportunities` | Terminal | List market-signal opportunities w/ filters | **R** | Move to `/api/discoveries` (or `/api/signals`). Different schema, different lifecycle. |
| `/api/opportunities/[id]` | Relations | PATCH status | **K** | |
| `/api/opportunities/[id]` | Terminal | GET single article opportunity | **R** | `/api/discoveries/[id]`. |
| `/api/analyze` | Relations | Lead "why now" via Claude | **K** | Established. |
| `/api/analyze` | Fase B | Article → metadata + firms | **R** | Move to `/api/prospecting/analyze`. Verb collision; different inputs/outputs. |
| `/api/research/start` | Terminal | Start ingestion run | **R** | Move to `/api/ingest/start` or `/api/discoveries/ingest`. Relations already has `/api/research` (research findings list); status routes must not collide. |
| `/api/research/status/[id]` | Terminal | Poll ingestion run | **R** | Move to `/api/discoveries/ingest/[runId]`. |
| `/api/research` | Relations | Research findings CRUD | **K** | Owns "ResearchFinding" entity. |
| `/api/research/extract` | Relations | (unclear purpose) | **D** | Looks orphaned — `/api/ai/extract-research-signals` is used instead. Confirm with Demian before removing. |
| `/api/generate/letter` | Terminal | Marketing letter via Claude | **M** | Merge with Relations' draft pipeline (`suggested_email` field in LeadAnalysisOutput). Consider keeping under `/api/discoveries/[id]/generate/letter` since letters are signal-driven. |
| `/api/generate/email` | Terminal | Email follow-up via Claude | **M** | Same — overlap with Relations' `suggested_email`. |
| `/api/generate/linkedin` | Terminal | LinkedIn DM via Claude | **M** | Overlaps with Relations' `/api/ai/linkedin-strategy` (Relations recommends an action AND drafts a DM). The Terminal version is purely a copy generator; Relations is strategy+copy. Keep Relations' version as the strategy entrypoint; merge Terminal's copy logic into it. |
| `/api/ingest` | Terminal | Manual + cron ingest | **K** (renamed) | Move to `/api/discoveries/ingest`. Keep bearer-token auth pattern. |
| `/api/export` | Fase B | CSV download | **R** | Move to `/api/prospecting/export`. |

### OAuth/webhook conflicts
- None — Gmail OAuth is sole OAuth, and lives in Relations. Terminal's cron endpoint is HTTP-level only.

### Auth model conflicts
- Relations: Gmail OAuth (per-user tokens to `gmail_tokens.json`) — no general session auth.
- Terminal: Bearer token (`INGEST_SECRET`) for write endpoints; reads are public.
- Fase B: No auth, CORS-only.

**In the merged app**, every Terminal/Fase B endpoint inherits Relations' no-session-auth posture. The `INGEST_SECRET` pattern is worth keeping for the cron endpoint. Bigger question: does the merged app need any session auth at all (it's single-user)? See `audit-risks.md`.

---

## Proposed merged route namespace

```
/                                # Relations Today dashboard (unchanged)
/relationships, /leads, /opportunities, /pipeline, /campaigns,
/companies, /conversations, /discovery, /draft-queue, /research,
/research-inbox, /insights, /settings, /import/apollo
                                 # all Relations (unchanged)

/discoveries                     # (was Terminal /) market-signal feed
/discoveries/[id]                # (was Terminal /opportunity/[id])

/prospecting                     # (was Fase B SPA) article → firms tool

/strategic-map                   # placeholder — out of scope for merge

/api/...                         # Relations API as-is, plus:
/api/discoveries                 # GET filters (was /api/opportunities in Terminal)
/api/discoveries/[id]
/api/discoveries/ingest          # POST manual ingest (was /api/ingest)
/api/discoveries/ingest/[runId]  # GET status (was /api/research/status/[id])
/api/discoveries/[id]/generate/{letter,email,linkedin}
                                 # Terminal generators, scoped under discovery
/api/prospecting/analyze         # (was Fase B /api/analyze)
/api/prospecting/export          # (was Fase B /api/export)
```

**Why "discoveries" not "opportunities":** Relations already owns "Opportunity" as a tracked-entity status (`opportunity_id`, `pipeline_stage`, etc). A market signal from a news article is not the same thing — it's a *discovery* that may *become* an opportunity once a lead is attached. Keeping these distinct in the URL avoids the most likely source of confusion post-merge.

**Why "prospecting" not "firms":** Fase B's output is a list of firms but the user flow is *paste a URL → get prospects*. Naming it after the verb keeps it clear that it's a tool, not a directory.
