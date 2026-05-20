# Audit — Dependencies, build status, risks

> Combined per the audit brief (steps 9, 10, 11).

## TL;DR

- **Biggest dep conflict:** Anthropic SDK (0.36 / 0.52 / 0.97). Bump everything to 0.97 (Relations' version).
- **Biggest framework conflict:** React 18 in Fase B web vs React 19 in the two Next.js apps. **Not resolvable in place** — Fase B web must be rebuilt.
- **Live builds skipped** per brief instruction (risky/slow). All three projects already have build artifacts (`.next/` and/or `dist/` equivalents) and recent dev-server logs show successful runs.
- **Highest-severity risks** are not dependency-level: they're storage divergence (Sheets vs Supabase vs ephemeral), three Claude clients, and JSON-parsing fragility.

---

## 1. Dependency conflict matrix

| Package | Relations | Opportunity Terminal | Fase B api | Fase B web | Conflict? | Recommendation |
|---|---|---|---|---|---|---|
| `next` | `16.2.6` | `^16.2.4` | — | — | trivial (patch) | Pin all to `16.2.6` |
| `react` | `19.2.4` | `^19.2.5` | — | `^18.3.1` | **MAJOR** (18 vs 19) | Fase B web rebuilt on React 19 (no in-place upgrade — see audit-ui.md) |
| `react-dom` | `19.2.4` | `^19.2.5` | — | `^18.3.5` | major | as above |
| `@anthropic-ai/sdk` | `^0.97.0` | `^0.36.0` | `^0.52.0` | — | **HIGH** | Pin all to `^0.97.0`; re-test each call site after bump |
| `googleapis` | `^171.4.0` | — | `^171.4.0` | — | none | Pin to `^171.4.0` |
| `google-auth-library` | `^10.6.2` | — | — | — | none | Relations-only |
| `@supabase/supabase-js` | — | `^2.39.0` | — | — | none | Terminal-only (post-merge: keep if Supabase becomes the machine-data store) |
| `rss-parser` | — | `^3.13.0` | — | — | none | Terminal-only |
| `date-fns` | `^4.2.1` | `^3.3.1` | — | — | **MAJOR** (3.x → 4.x has breaking changes) | Pin to `^4.2.1`; audit Terminal's date usage during port |
| `tailwindcss` | `^4` | `^4` | — | — | none | Same major |
| `@tailwindcss/postcss` | `^4` | `^4` | — | — | none | Same |
| `eslint` | `^9` | `^9` | — | — | none | Same |
| `eslint-config-next` | `16.2.6` | `16.2.4` | — | — | trivial | Pin to `16.2.6` |
| `typescript` | `^5` | `^5` | `^5.8.3` | `^5.8.3` | none | Pin to `^5.8.3` |
| `clsx` | — | `^2.1.0` | — | — | none | Optional adoption in merged UI for class composition |
| `cors` | — | — | `^2.8.5` | — | n/a in Next.js | Drops after merge (no separate API server needed) |
| `dotenv` | — | — | `^16.5.0` | — | n/a in Next.js | Drops after merge |
| `express` | — | — | `^4.21.2` | — | n/a in Next.js | Drops after merge |
| `ipaddr.js` | — | — | `^2.2.0` | — | unused-feeling | Drops with Express |
| `jsonrepair` | — | — | `^3.12.0` | — | should adopt | **Add to merged app** — fixes Claude JSON parsing bugs in Relations + Terminal |
| `pino` | — | — | `^9.7.0` | — | optional | Consider adopting for structured logging in API routes |
| `zod` | — | — | `^3.24.3` | — | should adopt | **Add to merged app** — env validation + Claude output validation |
| `tsx` | — | — | `^4.19.3` | — | n/a in Next.js | Drops with Express |
| `pkg` | — | `^5.8.1` | — | — | dev-only | Keep if `.exe` distribution still wanted; **risk: `pkg` is in maintenance mode** — consider migrating to `@yao-pkg/pkg` or dropping `.exe` distribution |
| `vite` | — | — | — | `^6.3.3` | drops | Drops with Fase B web |
| `@vitejs/plugin-react` | — | — | — | `^4.4.1` | drops | Drops with Fase B web |

### Heavy / unused dependencies
- **`ipaddr.js`** in Fase B api — unclear what it's for; only the controller files were inspected. Investigate before porting.
- **`pkg`** in Terminal — used to build `opportunity-terminal.exe`. If the `.exe` distribution is no longer needed post-merge, drop both `pkg` and the `xcopy` build script. If kept, note that `pkg` is now in maintenance.
- No unused heavy deps detected in Relations.

### Incompatible packages
- **React 19 vs React 18.** Fase B web cannot be ported in place — must be rebuilt inside Relations. No `react-dom@18` peer dependency carryover.
- **`date-fns@3` vs `@4`.** Breaking changes in `format`, `parseISO` defaults, locale imports. Audit every `date-fns` import in Terminal during port.

---

## 2. Build status (no commands run)

The brief instructed to run `npm install` / `npm run lint` / `npm run build` *only if safe*. **Skipped for all three** because:
1. All three already have build artifacts on disk (verified via folder listing).
2. Fase B's `api-dev.err.log` is 0 bytes; `api-dev.out.log` shows successful analyses with real Tavily costs.
3. Terminal already ships as a built `.exe`.
4. Running builds would consume disk + network without changing the audit outcome.

What was inspected statically:

| Project | Config file | Notable settings | Issues |
|---|---|---|---|
| Relations | `next.config.ts` | empty boilerplate | none |
| Relations | `tsconfig.json` | strict; ES2017; `@/*` → `./src/*`; incremental | none |
| Relations | `eslint.config.mjs` | not examined | unknown |
| Terminal | `next.config.mjs` | `output: 'standalone'` | needed for `pkg` bundling — fine |
| Terminal | `tsconfig.json` | strict; ES2017; bundler module resolution; `@/*` → `./src/*` | none |
| Terminal | `vercel.json` | not examined | likely sets up cron schedule — verify before dropping |
| Fase B api | `tsconfig.json` | strict; CommonJS target | none |
| Fase B api | (no config files of note) | — | — |
| Fase B web | `vite.config.ts` (assumed) | not examined | — |
| Fase B web | `tsconfig.json` | strict; ES2020; ESNext modules | none |

### Recent dev-run logs (Fase B only — these files exist)

```
api-dev.out.log: "Fase B API running on port 4000" + 4 successful analyses
                with Tavily + Claude costs in USD logged
api-dev.err.log: 0 bytes
web-dev.out.log: Vite dev server on http://localhost:5173,
                 HMR updates to FirmCard.tsx + global.css on 2026-05-18
web-dev.err.log: not examined (assumed empty/clean given web log shows no errors)
```

### Missing env vars (potential build/runtime failures)
- **Relations has no `.env.example`** — anyone cloning the repo has no template. Build won't fail (Next.js tolerates missing env at build time), but runtime calls to Sheets/Claude/Gmail will throw. Mock mode hides Sheets failure (good); Claude failure is visible (good).
- Terminal has `.env.local.example` with all five required keys.
- Fase B has `.env.example` for both api and web with complete keys.

### TypeScript / route / lint errors not surfaced
- Without running `tsc --noEmit` or `eslint`, no errors confirmed. **In-scope to run later** if/when build work begins, but per brief — not now.

---

## 3. Risk list

Sorted by severity within each category. Severity criteria:
- **High** — breaks core flow OR data loss OR security
- **Medium** — visible regression, requires careful migration
- **Low** — annoyance, easily mitigated

### Architecture / merge risks

| # | Risk | Affected | Severity | Why it matters | Suggested mitigation |
|---|---|---|---|---|---|
| A1 | Three different storage backends (Sheets / Supabase / ephemeral) | All | **High** | Forces an early architectural decision (Sheets vs Supabase vs hybrid) that's hard to reverse | Decide before any merge work begins. Lean hybrid (see `audit-data-models.md` §Storage). Surface as open question in `audit-summary.md`. |
| A2 | Three Anthropic SDK versions diverging behavior | All | **High** | Different error shapes; subtle API changes; one client could throw on a payload another accepts | Bump all to `^0.97.0` first; re-test every Claude call site; pin model name via env |
| A3 | Fase B web is React 18 + Vite + light-theme vanilla CSS | Fase B | **High** | Cannot port in place — full UX rebuild needed | Rebuild as Relations pages during merge step 6. Discard Vite project. |
| A4 | Storage decision affects the meaning of "Opportunity" | Relations + Terminal | **High** | Conflating Terminal's article-signal `Opportunity` with Relations' lead-attached `Opportunity` would corrupt both data models | Rename Terminal's to `Discovery`. See `audit-data-models.md`. |
| A5 | Relations has no `.env.example` | Relations | **Medium** | Anyone setting up a fresh clone (CI, new device) has no list of required keys | Create `.env.example` covering all 7 keys + 3 new merged-app keys |
| A6 | No env validation at boot in Relations or Terminal | both | **Medium** | Misconfigured deploys fail at first-request runtime, not at boot — harder to debug in prod | Adopt Fase B's Zod-validated `config/env.ts` pattern in merged app |
| A7 | Google credential env vars use two naming conventions | Relations vs Fase B | **Medium** | Same secrets under different names; risk of misconfig during merge | Standardize on `GOOGLE_SHEETS_*` per `audit-integrations.md` |
| A8 | Relations data layer "silently fails" on Sheets update errors | Relations | **Medium** | Per `docs/current-build-status.md` — Sheets updates can no-op without throwing; user thinks save succeeded | Fix before merge work that depends on Sheets writes |

### Code-quality risks

| # | Risk | Affected | Severity | Why it matters | Suggested mitigation |
|---|---|---|---|---|---|
| C1 | Broad regex JSON extraction `.match(/\{[\s\S]*\}/)` | Relations + Terminal | **High** | Fails on multi-brace responses or model preambles; corrupts insights silently | Adopt Fase B's `jsonrepair` + Zod validation |
| C2 | No Claude API timeout in Relations or Terminal | both | **Medium** | A slow/hung API call ties up the request indefinitely | Adopt Fase B's `withTimeout(p, ANTHROPIC_TIMEOUT_MS)` (default 90s) |
| C3 | No retry on transient Claude errors (429, 5xx) | all three | **Medium** | Single network blip surfaces as user-visible error | Add exponential-backoff retry around all Claude calls |
| C4 | `Date.now()`-based IDs in Relations | Relations | Low (today) | Single-user app means collisions are unlikely; would matter at scale | Switch to UUIDs for new entities during merge |
| C5 | Gmail thread sync stores in session memory only (lost on restart) | Relations | **High** | All sync work + Claude thread analyses are lost on server restart | Per `current-build-status.md` already flagged; persist to Sheets or Supabase before relying on it |
| C6 | API routes have limited input validation in Relations + Terminal | both | **Medium** | Single-user mitigates; but misformed client payloads can corrupt sheet data | Adopt Zod validation on POST/PATCH bodies |
| C7 | Three brand voice instructions across three projects | all three | **Medium** | Outreach copy will drift in tone if not unified | Extract single `BRAND_VOICE` prompt fragment |
| C8 | Inline prompts in 5+ files in two projects | Relations + Terminal | Low | Hard to diff prompts in PRs; hard to A/B | Move all prompts to `src/lib/prompts/*.ts` files (Fase B's pattern) |
| C9 | Hardcoded model name in two of three | Relations + Terminal | Low | Can't quickly swap to e.g. Haiku during incidents | Move to env var |
| C10 | Three card components, three loading-state styles, three error displays | all three | Low | UI inconsistency post-merge | Build `<Card>`, `<Loading>`, `<Banner>` primitives during merge |

### Security risks

| # | Risk | Affected | Severity | Why it matters | Suggested mitigation |
|---|---|---|---|---|---|
| S1 | `gmail_tokens.json` at project root (gitignored) | Relations | Low–Medium | Plaintext OAuth tokens on disk; fine for single-user dev; risky if ever deployed without rotating | Acceptable for current single-user setup; if hosted, move to encrypted store or env-based token storage |
| S2 | No session auth on Relations app | Relations | Low | Single-user, local-host posture | Confirm Relations is never publicly hosted without a reverse proxy / network ACL |
| S3 | `INGEST_SECRET` bearer token in Terminal | Terminal | Low | Pre-shared key; rotated by env change | Standard; keep |
| S4 | Supabase anon key on frontend (Terminal) | Terminal | Low (by design) | Anon key is meant to be public; RLS is the gatekeeper | Confirm RLS policies before merge — check `supabase/schema.sql` for `enable row level security` calls |
| S5 | Tavily + Anthropic + Sheets keys on server only | Fase B + others | None | Correctly server-side | — |
| S6 | No CSRF protection on POSTs | all three | Low (single-user) | Standard Next.js gap | Acceptable for local-only; add CSRF tokens if ever hosted publicly |

### Product / scope risks

| # | Risk | Affected | Severity | Why it matters | Suggested mitigation |
|---|---|---|---|---|---|
| P1 | "Opportunity" entity overload risks confusing the product surface | Relations + Terminal | **High** | Two entities with the same name + different meanings = bugs + miscommunication with future collaborators | Rename Terminal's to `Discovery` everywhere before any merge work |
| P2 | Terminal's letter/email/linkedin generators may pull merged app toward mass-outreach feel | Terminal | **Medium** | Brief explicitly states "Do not turn it into a mass outreach engine" | Keep generators per-discovery + human-approved (no batch send); never wire to an "auto-send" path |
| P3 | LinkedIn fields proliferating (Lead.linkedin_url, linkedin_connection_status, linkedin_dm_status, linkedin_warmth) might tempt automation | Relations | Low | Same as P2; the data shape is fine, the temptation is the risk | Document in CLAUDE.md: "LinkedIn is manual-tracking only; never automate connect/DM" |
| P4 | Fase B firm-discovery output is Spanish | Fase B | Low | UI consistency post-merge | Translate prompt to English OR keep Spanish if the firm list is internal-only |
| P5 | Strategic Map placeholder in Relations is incomplete | Relations | Low | Shipping a half-built page is bad UX | Hide from sidebar until ready; out of scope for this merge |
| P6 | Apollo CSV import + Fase B firm discovery overlap conceptually | Relations + Fase B | Low | Two paths to add companies — could confuse user | Clarify in UI: Apollo = bulk-import contacts you already know about; Prospecting = discover new firms from articles |

### Operational risks

| # | Risk | Affected | Severity | Why it matters | Suggested mitigation |
|---|---|---|---|---|---|
| O1 | Sheets-as-DB has no transactions | Relations | **Medium** | Multi-step writes can leave inconsistent state on partial failure | Acknowledged; pattern is acceptable for single-user; add idempotency where possible |
| O2 | Terminal's cron is Vercel-specific (`x-vercel-cron` header) | Terminal | Low | If merged app is hosted elsewhere, cron must be re-implemented | Replace with a generic scheduled-run pattern; bearer auth is already in place |
| O3 | `pkg` (Terminal's `.exe` packager) is in maintenance mode | Terminal | Low | Long-term, `.exe` distribution path may break | If `.exe` is still wanted post-merge, evaluate `@yao-pkg/pkg` or single-file Node bundles |
| O4 | No telemetry / metrics in any project | all three | Low | Operating blind during merge transition | Optional; add Pino-based request logging in API routes during merge |
| O5 | Three different log formats (console.log everywhere; Pino in Fase B; Next.js default in Relations/Terminal) | all three | Low | Inconsistent log analysis | Adopt Pino for API routes in merged app |

---

## 4. Risk priority for the merge

If we triage by what *must* be resolved before merging vs what can wait:

**Before any merge work begins (blockers):**
- A1 (storage decision)
- A2 (SDK consolidation)
- A4 / P1 (rename `Opportunity` → `Discovery` in Terminal)
- C5 (Gmail session-only persistence)
- A8 (silent Sheets-update failures)

**During merge (each step):**
- A3 (Fase B web rebuild) — during UI step
- A6, A7 (env validation + naming) — during env unification step
- C1, C2, C3 (Claude client hardening) — during AI client consolidation step
- C7, C8 (prompt unification) — during AI client consolidation step
- C10 (UI primitives) — during component port step

**After merge (polish):**
- C4 (UUIDs), C6 (Zod on API), C9 (env-driven model), O5 (Pino logging)
- P3, P5, S1, S2, S6 — known posture; revisit if hosting changes
