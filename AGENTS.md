# Oaki — merged app guide

> This is the consolidated Oaki app: Relations + Discoveries (was Opportunity
> Terminal) + Prospecting (was Fase B). Single Next.js 16 webapp on Vercel,
> single user. Merge plan + decisions in `docs/execution-plan.md` and `docs/audit-*.md`.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

Next.js 16 has breaking changes — App Router APIs, async `params`, the
middleware Edge runtime, and conventions can differ from your training data.
When in doubt, read `node_modules/next/dist/docs/` before writing code and
heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product principles — do not violate

- **No automation.** Drafts go to the user, never sent automatically. The LinkedIn fields are tracking, not API hooks.
- **No mass outreach.** Every contact needs a real "why now". Generators produce one piece of copy at a time, never batched.
- **Human-approved.** All AI output is a draft the user reviews. Nothing acts on the user's behalf without an explicit click.
- **Calm, premium, specific.** Outreach copy is short (4–7 sentences), references something real, never generic openers.
- **Discovery ≠ Opportunity.** Two distinct entities. A Discovery is a market signal extracted from an article. An Opportunity is a deal in motion attached to a Lead. Promotion is one-way (Discovery → Opportunity, by attaching a Lead).
- **FirmCandidate ≠ Company.** A FirmCandidate is a discovery from Prospecting (6 lightweight fields). A Company is a richer engaged-firm record. Promotion is one-way.

## Hybrid storage

| Entity | Lives in | Why |
|---|---|---|
| Lead, Company, Opportunity, Interaction, MeetingPrep, Campaign, ResearchFinding, AIInsight | **Google Sheets** | Demian edits directly in Sheets. Low volume, human-touched. |
| Discovery, RawArticle, AnalyzedArticle, Source, IngestionRun, Thread, ThreadAnalysis, app_secrets | **Supabase Postgres** | Machine-generated, high volume, needs queries + dedup. |
| Generated outreach copy per Discovery | Supabase `generated_outputs` | Not in Sheets `Interactions` because Discoveries aren't lead-attached. |

Schema: `supabase/schema.sql`. Idempotent — safe to re-run.

## Key directories

```
src/lib/
├── env.ts                          # Zod-validated env at boot
├── ai/{client,parse,timeout}.ts   # Single Anthropic client + jsonrepair parse + withTimeout
├── auth.ts                         # Edge-compatible HMAC session cookie
├── supabase.ts                     # Lazy public + admin clients
├── claude.ts                       # Thin re-export barrel (back-compat for old imports)
├── gmail/                          # OAuth, sync, token storage (Supabase-first + local fallback)
├── sheets/                         # One file per entity: leads, companies, opportunities, …
├── discoveries/                    # Ingestion pipeline (RSS → Tavily → Claude)
├── prospecting/                    # Article → firm candidates (Jina → Tavily → Claude)
└── prompts/                        # ONE file per Claude prompt; brand.ts holds BRAND_VOICE
    ├── lead/                       # analyze-why-now, prepare-meeting-prep, recommend-linkedin-strategy, prioritize-stakeholders
    ├── research/                   # extract-signals
    ├── conversations/              # analyze-thread (Gmail)
    ├── discoveries/                # classify, analyze, generate-{letter,email,linkedin}
    └── prospecting/                # extract-metadata, select-firms

src/app/
├── (Today / leads / companies / opportunities / pipeline / campaigns / relationships)
├── conversations/                  # Gmail intelligence
├── meeting-prep/[id]               # Pre-call brief (was /discovery/[id])
├── research/, research-inbox/
├── draft-queue/, insights/
├── discoveries/, discoveries/[id]  # Market signal feed
├── import/                         # Parent landing page with two flows:
│   ├── apollo/                     #   Apollo CSV → leads + companies
│   └── prospecting/                #   Article URL → scored firm candidates
├── login/                          # Single-user auth
├── settings/, strategic-map/       # strategic-map is hidden from sidebar nav
└── api/                            # discoveries/, prospecting/, gmail/, auth/, leads/, ...

middleware.ts                       # Auth gate (Edge runtime). Off when APP_PASSWORD/SESSION_SECRET unset.
supabase/schema.sql                 # Idempotent schema for Supabase tables.
vercel.json                         # Cron: GET /api/discoveries/ingest every 6h.
```

## Auth model

Single-user. `middleware.ts` checks an HMAC-signed cookie on every non-public
route. Public paths: `/login`, `/api/auth/*`, `/api/gmail/callback` (Google
can't include our cookie), `/api/discoveries/ingest` (cron/bearer protected).

Two env vars required for auth to be on: `APP_PASSWORD` (8+ chars) and
`SESSION_SECRET` (32+ chars). If either is missing, auth is off and the app is
open — fine for local dev, never deploy this way.

## Gmail tokens

Stored as a single row in Supabase `app_secrets` (key `gmail_tokens`). RLS is
enabled on that table — only the service_role key can read/write.

A local `gmail_tokens.json` is supported as a dev fallback. On first read with
Supabase configured, the local file auto-migrates to Supabase. After the first
Vercel deploy, the local file is irrelevant (Vercel filesystem is ephemeral).

## Env vars

Template: `.env.example`. Required for production:

```
ANTHROPIC_API_KEY
GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY                  # Sheets service account
GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI  # Gmail OAuth
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
INGEST_SECRET                       # Bearer for manual POST /api/discoveries/ingest
TAVILY_API_KEY                      # Prospecting
APP_PASSWORD, SESSION_SECRET        # Single-user auth
```

## Commands

```
npm run dev       # next dev
npm run build     # next build
npm run lint      # eslint
npx tsc --noEmit  # type check (clear .next/types first if validator complains about stale routes)
```

## Claude SDK + prompt conventions

- One unified Anthropic client in `lib/ai/client.ts`. Never `new Anthropic({...})` elsewhere.
- One unified JSON parser: `parseJson(text, schema?)` from `lib/ai/parse.ts`. Uses `jsonrepair` first, then optional Zod validation.
- Wrap every Claude call in `withTimeout(promise, env.ANTHROPIC_TIMEOUT_MS, label)`.
- Brand voice prompt fragment: `lib/prompts/brand.ts` (`BRAND_VOICE`). Use it as the `system` param for any outreach-flavored prompt.
- One prompt per file under `lib/prompts/`. Don't inline new prompts in `lib/claude.ts` or in routes.
