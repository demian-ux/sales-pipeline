# Audit — Integrations, env vars, AI usage

> Combined per the audit brief (steps 5, 6, 7).

## TL;DR

- **Three Claude clients exist** with **three different SDK versions** (0.36 / 0.52 / 0.97) and three different JSON-parsing strategies (regex-only / regex+`jsonrepair` / regex-only). Consolidate to one — Relations' SDK version + Fase B's `jsonrepair` pattern.
- **Google credential env vars collide on meaning, not on name** — Relations uses `GOOGLE_CLIENT_EMAIL`/`GOOGLE_PRIVATE_KEY`/`GOOGLE_SHEET_ID`; Fase B uses `GOOGLE_SHEETS_CLIENT_EMAIL`/`GOOGLE_SHEETS_PRIVATE_KEY`/`GOOGLE_SHEETS_SPREADSHEET_ID`. Pick one naming and migrate.
- Relations should own all shared integrations (Anthropic, Google). Terminal owns its Supabase. Fase B's Tavily + Jina move with the prospecting module.
- **No `.env.example` exists in Relations** — this is the only project missing one. Create it as part of the merge.

---

## 1. Integration matrix

| Integration | Relations | Opportunity Terminal | Fase B (api) | Risk if merged | Recommended owner |
|---|---|---|---|---|---|
| Anthropic Claude SDK | ✅ v0.97.0 (`src/lib/claude.ts`) | ✅ v0.36.0 (`src/lib/claude.ts`) | ✅ v0.52.0 (`apps/api/src/services/anthropic.service.ts`) | **HIGH** — three SDK versions, three clients | Relations (one client), bump to latest |
| OpenAI | — | — | — | — | n/a |
| Google Sheets (`googleapis`) | ✅ v171.4.0 (`src/lib/sheets/client.ts`) | — | ✅ v171.4.0 (`apps/api/src/services/googleSheets.service.ts`) | LOW — same major version | Relations |
| Gmail (OAuth + Sheets) | ✅ scopes `gmail.readonly`, `gmail.compose`; tokens in `gmail_tokens.json` | — | — | n/a | Relations |
| Google OAuth | ✅ Gmail flow | — | — | n/a | Relations |
| Supabase (`@supabase/supabase-js`) | — | ✅ v2.39.0 (`src/lib/supabase.ts` — public + service clients) | — | LOW — sole user | Terminal (or merged: keep Supabase as machine-data store; see `audit-data-models.md`) |
| `rss-parser` | — | ✅ v3.13.0 (`src/lib/ingestion/rss.ts`) | — | LOW | Terminal/discovery module |
| Tavily search | — | — | ✅ direct HTTP via fetch (`apps/api/src/services/tavily.service.ts`) | LOW — sole user | Fase B/prospecting module |
| Jina Reader (`https://r.jina.ai`) | — | — | ✅ (`apps/api/src/services/jinaReader.service.ts`) | LOW | Fase B/prospecting module |
| `jsonrepair` | — | — | ✅ v3.12.0 — repairs Claude JSON before parse | **POSITIVE** — adopt project-wide | merged Claude client |
| Apollo CSV import | ✅ `/api/import/apollo` | — | — | n/a | Relations |
| LinkedIn (manual + Claude strategy) | ✅ no API — manual status fields + Claude action recommendation | — | — | n/a | Relations |
| Miro | — (plan only in `docs/miro-integration-plan.md`) | — | — | n/a | Relations (future) |
| Firebase / Airtable / Notion | — | — | — | — | n/a |
| Local JSON as data | ✅ `src/lib/mock-data.ts` (fallback) | partial — `DEFAULT_SOURCES` in `src/lib/ingestion/sources.ts` | — | LOW | each keeps its own |
| CSV imports/exports | ✅ Apollo CSV → leads/companies | — | ✅ export firms → CSV (`apps/api/src/services/export.service.ts`) | LOW — different formats | each keeps its own |
| Pino logging | — | — | ✅ structured JSON logs | POSITIVE — consider adopting | merged app (optional) |

**Headline issues:**

1. **Three Anthropic SDK versions** — the biggest dependency conflict in the whole bundle. The wire protocol is stable but client APIs and error shapes have diverged. Pick one (0.97.0 is the latest of the three) and migrate the other two call sites. Audit each call after migration — `anthropic.messages.create(...)` has had subtle parameter changes between minor versions.

2. **Two Claude prompt strategies coexist** — inline strings (Relations + Terminal) vs separated prompt files (Fase B). Adopt Fase B's separation — `src/lib/prompts/` directory with one file per prompt, exported as named constants.

3. **JSON parsing is fragile in two of three** — Relations and Terminal use bare `.match(/\{[\s\S]*\}/)` which fails on multi-object responses or stray braces. Fase B uses `jsonrepair` first. Adopt `jsonrepair`.

---

## 2. Env var matrix

| Env var | Relations | Terminal | Fase B | Same purpose? | Action |
|---|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | ✅ | ✅ identical | **Keep one** — merged app uses one key |
| `ANTHROPIC_MODEL` | — (hardcoded `claude-sonnet-4-6`) | — (hardcoded) | ✅ env-overridable | ✅ same purpose | **Adopt Fase B's env-overridable pattern** — easier model swaps |
| `ANTHROPIC_CLASSIFIER_MODEL` | — | ✅ (defaults to main) | — | n/a | Keep — discovery-module-specific |
| `GOOGLE_SHEET_ID` | ✅ | — | — | conflict w/ `GOOGLE_SHEETS_SPREADSHEET_ID` | **Rename collision** — pick one |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | — | — | ✅ | conflict w/ above | (see above) |
| `GOOGLE_CLIENT_EMAIL` | ✅ | — | — | conflict w/ `GOOGLE_SHEETS_CLIENT_EMAIL` | **Rename collision** |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | — | — | ✅ | conflict w/ above | |
| `GOOGLE_PRIVATE_KEY` | ✅ | — | — | conflict w/ `GOOGLE_SHEETS_PRIVATE_KEY` | **Rename collision** |
| `GOOGLE_SHEETS_PRIVATE_KEY` | — | — | ✅ | conflict w/ above | |
| `GOOGLE_SHEETS_TAB_NAME` | — | — | ✅ (default `companies`) | n/a | Module-specific; Fase B writes to its own tab |
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | — | — | n/a | Relations-only (Gmail) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | — | — | n/a | Relations-only |
| `GOOGLE_OAUTH_REDIRECT_URI` | ✅ (defaults to `http://localhost:3000/api/gmail/callback`) | — | — | n/a | Relations-only |
| `NEXT_PUBLIC_SUPABASE_URL` | — | ✅ | — | n/a | **Frontend-exposed** — by design (Supabase anon key is meant to be public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | ✅ | — | n/a | Frontend-exposed (intentional) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ✅ | — | n/a | Server-only |
| `INGEST_SECRET` | — | ✅ (bearer for `/api/ingest`) | — | n/a | Terminal-only |
| `TAVILY_API_KEY` | — | — | ✅ | n/a | Fase B-only |
| `TAVILY_BASE_URL` | — | — | ✅ | n/a | Fase B-only |
| `TAVILY_SEARCH_DEPTH` | — | — | ✅ (`basic`) | n/a | Fase B-only |
| `TAVILY_MAX_RESULTS_PER_QUERY` | — | — | ✅ (`8`) | n/a | Fase B-only |
| `TAVILY_TIMEOUT_MS` | — | — | ✅ (`20000`) | n/a | Fase B-only |
| `JINA_READER_BASE_URL` | — | — | ✅ | n/a | Fase B-only |
| `JINA_TIMEOUT_MS` | — | — | ✅ (`25000`) | n/a | Fase B-only |
| `ARTICLE_MAX_CHARS` | — | — | ✅ (`20000`) | n/a | Fase B-only |
| `ANTHROPIC_TIMEOUT_MS` | — | — | ✅ (`90000`) | should be cross-cutting | **Adopt across merged app** — Relations and Terminal have no timeouts on Claude calls |
| `REQUEST_TIMEOUT_MS` | — | — | ✅ (`120000`) | n/a | Fase B-only (Express level) |
| `CORS_ORIGIN` | — | — | ✅ (`http://localhost:5173`) | n/a | Drops after merge (no separate web origin) |
| `VITE_API_BASE_URL` | — | — | ✅ (web) | n/a | Drops after merge (web folds into Next.js) |
| `PORT` | — | — | ✅ (`4000`) | n/a | Drops after merge |
| `NODE_ENV` | — | ✅ (via launcher) | ✅ | platform | Standard |

**`.env.example` files:**

| Project | Has `.env.example`? |
|---|---|
| Relations | ❌ **No template exists** — the only project without one |
| Terminal | ✅ `.env.local.example` |
| Fase B api | ✅ `apps/api/.env.example` |
| Fase B web | ✅ `apps/web/.env.example` |

### Env naming collision: `GOOGLE_*` vs `GOOGLE_SHEETS_*`

Two reasonable resolutions:

1. **Keep `GOOGLE_*` (Relations' names).** Shorter. Already in production. But ambiguous — Google has many services and these creds are Sheets-specific (the same service account principal can be granted Sheets scope only).

2. **Adopt `GOOGLE_SHEETS_*` (Fase B's names).** More descriptive. Survives if we ever add a second Google service account (e.g., Calendar) without ambiguity. But requires migrating Relations.

**Recommendation:** adopt `GOOGLE_SHEETS_*`. The cost is one rename in Relations; the benefit is unambiguous naming for the merged future.

### Frontend-exposed secrets
- Only `NEXT_PUBLIC_*` vars (Terminal's Supabase URL + anon key) are intentionally exposed. Confirmed safe — Supabase RLS is the gatekeeper, not the anon key.
- No accidental exposures found. Service-role key (Terminal), service-account private key (Relations + Fase B), `INGEST_SECRET`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY` are all server-side only.

### Unsafe env usage
- Relations: no env validation at startup. Misconfigured deploys will fail at first runtime use, not at boot.
- Terminal: same — no validation.
- Fase B: ✅ Zod validates all env at boot. **Adopt this pattern in the merged app.**

---

## 3. AI / prompt comparison

### Claude clients

| Property | Relations | Terminal | Fase B |
|---|---|---|---|
| SDK version | 0.97.0 | 0.36.0 | 0.52.0 |
| Model | `claude-sonnet-4-6` (hardcoded) | `claude-sonnet-4-6` (hardcoded) + optional `ANTHROPIC_CLASSIFIER_MODEL` | env-driven, default `claude-sonnet-4-6` |
| Prompt location | inline strings in `src/lib/claude.ts` | inline strings in `src/lib/claude.ts` | **separate file** `apps/api/src/prompts/phaseB.systemPrompt.ts` |
| System prompt usage | Single 50-line SYSTEM_PROMPT applied to every call (brand voice + scoring rubric) | Per-call system prompts (different one per generator) | Single 83-line Spanish system prompt for firm selection; short system prompt for extraction |
| JSON-only mode | "respond with JSON only" instruction in prompt; no `response_format` use | Same — text instruction only | Same — text instruction only |
| JSON extraction | `responseText.match(/\{[\s\S]*\}/)` then `JSON.parse` | Same regex pattern | `jsonrepair(text)` then `JSON.parse` |
| Validation | None (TS interface assertion only) | None | **Zod schema validation** on result |
| Retry logic | None | None | None |
| Timeout | None | None | `ANTHROPIC_TIMEOUT_MS` env (default 90s), wrapped via `withTimeout()` util |
| Temperature | not set | not set | 0 |
| Max tokens | not set (SDK default) | 300 (classifier), 3000 (analyzer), 1024 (letter), 512 (email), 256 (linkedin) | 1024 (extraction), 2048 (selection) |
| Error handling | try/catch, log, throw | try/catch, log, throw | Custom `AppError`, log via Pino, structured to API response |

### Prompt inventory

| Prompt | Project | File / location | Input | Output | Reusable? |
|---|---|---|---|---|---|
| `SYSTEM_PROMPT` (universal) | Relations | `src/lib/claude.ts` L18–68 | every call | brand voice + scoring rubric | ✅ Core — keep |
| `analyzeLeadWhyNow` | Relations | `src/lib/claude.ts` L175–198 | Lead + Company + Research + Interactions | `LeadAnalysisOutput` | Keep |
| `prepareDiscovery` | Relations | `src/lib/claude.ts` L223–243 | Lead + Company + Research | `DiscoveryPrepOutput` | Keep |
| `extractResearchSignals` | Relations | `src/lib/claude.ts` L302–335 | raw research text | `ResearchExtractionOutput` | Keep; complements Terminal's classifier (different use case — paste vs RSS) |
| `recommendLinkedInStrategy` | Relations | `src/lib/claude.ts` L382–407 | Lead LinkedIn context + Company | `LinkedInStrategyOutput` | Keep |
| `prioritizeStakeholders` | Relations | `src/lib/claude.ts` L456–485 | Company + leads at company | `StakeholderPrioritizationOutput` | Keep |
| Gmail thread analysis | Relations | `src/lib/gmail/analyze.ts` | parsed thread + lead context | `ConversationAnalysis` | Keep |
| Article classifier | Terminal | `src/lib/claude.ts` L16–26 | article title + snippet + url | `AIClassification` | Keep — fast triage for ingestion |
| Article analyzer | Terminal | `src/lib/claude.ts` L77–202 | article title + content + url | `AIAnalysis` (20+ fields incl. 6 scores) | Keep — this is the heart of Discovery |
| Letter generator | Terminal | `src/lib/claude.ts` L208–264 | opportunity + recipient + client_type | 280–350 word letter | **Merge with Relations' draft generators** — overlaps with `LeadAnalysisOutput.suggested_email` semantics |
| Email generator | Terminal | `src/lib/claude.ts` L270–298 | opportunity + recipient | 100–160 word email | Merge as above |
| LinkedIn generator | Terminal | `src/lib/claude.ts` L304–329 | opportunity + recipient | ≤300 char DM | Overlaps with Relations' `LinkedInStrategyOutput.suggested_dm` — Relations' is strategy+copy, Terminal's is copy-only. Keep Relations' as the user-facing entrypoint; Terminal's becomes the internal "generate fallback copy when no strategy is needed" helper. |
| Article metadata extractor | Fase B | `apps/api/src/services/anthropic.service.ts` (inline system prompt) | article URL + text | `Article` (title, project_type, scale, location) | Keep |
| Firm selection prompt | Fase B | `apps/api/src/prompts/phaseB.systemPrompt.ts` (83 lines, Spanish) | article + Tavily results | `PhaseBAnalysis` (article + firms[5–8] with scores) | Keep |

### Brand voice handling

| Project | Brand voice location | Tone |
|---|---|---|
| Relations | `SYSTEM_PROMPT` in `src/lib/claude.ts` — "short, calm, confident, premium; no pushy language, no fake urgency, no generic openers" | English; relationship-driven |
| Terminal | Embedded per-prompt in `generateLetter`/`generateEmail`/`generateLinkedIn` — "useful colleague, not salesy marketer; strategic significance over hype" | English; client-letter formality |
| Fase B | Embedded in `PHASE_B_SYSTEM_PROMPT` — Oaki Studio reference, prospect-fit scoring rubric | Spanish; internal-tool tone |

**Three voices is a problem.** All outreach copy should sound like the same person wrote it. Action: extract a single `BRAND_VOICE` prompt fragment in the merged app's `src/lib/prompts/brand.ts` and import it into every generator. Translate the Fase B prompt to English (or keep Spanish if the firm-selection output stays internal-only).

### Hallucination & validation risks

| Risk | Where | Severity | Mitigation |
|---|---|---|---|
| Broad regex JSON extraction fails on multi-brace responses | Relations + Terminal | HIGH | Use `jsonrepair` like Fase B; consider switching to Anthropic's `tool_use` for structured output |
| No schema validation on Claude output | Relations + Terminal | MEDIUM | Adopt Zod schemas like Fase B; runtime-validate before storing |
| No retry on transient API errors | All three | MEDIUM | Add exponential backoff for 429/5xx |
| No timeout on Claude calls | Relations + Terminal | MEDIUM | Adopt Fase B's `withTimeout(p, ANTHROPIC_TIMEOUT_MS)` pattern |
| Hardcoded model in two of three | Relations + Terminal | LOW | Move to env var (allows quick model swap during incidents) |
| Brand voice drift across three prompts | all three | MEDIUM | Single `BRAND_VOICE` fragment |
| No prompt versioning | all three | LOW | When prompts move to `src/lib/prompts/*.ts`, treat them like code — review changes in PRs |

---

## 4. Recommended consolidated layout

```
src/lib/
├── ai/
│   ├── client.ts              # one Anthropic instance (latest SDK)
│   ├── parse.ts               # jsonrepair + Zod validation helper
│   └── timeout.ts             # withTimeout wrapper
├── prompts/
│   ├── brand.ts               # single BRAND_VOICE fragment, shared
│   ├── lead/                  # analyzeWhyNow, prepareDiscovery, recommendLinkedInStrategy,
│   │                          # prioritizeStakeholders
│   ├── research/              # extractResearchSignals
│   ├── conversations/         # analyzeThread
│   ├── discovery/             # classifyArticle, analyzeArticle
│   ├── prospecting/           # extractArticleMetadata, selectFirms
│   └── generate/              # letter, email, linkedin (shared by Lead + Discovery flows)
└── env.ts                     # Zod-validated env at boot (Fase B pattern)
```
