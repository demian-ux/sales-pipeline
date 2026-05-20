# Audit — Project overview & folder structure

> **Audit only.** No app code was modified. No builds were run. Inspections only.

Three projects on disk (folder names ≠ product names):

| Product | Disk path |
|---|---|
| **Oaki Relations** (proposed main app) | `C:\Users\dszkl\sales-pipeline` |
| **Opportunity Terminal** | `C:\Users\dszkl\opportunity-terminal` |
| **Fase B** | `C:\Users\dszkl\fase-b` |

---

## At-a-glance

| | Oaki Relations | Opportunity Terminal | Fase B (api) | Fase B (web) |
|---|---|---|---|---|
| **Framework** | Next.js 16.2.6 (App Router) | Next.js 16.2.4 (App Router) | Express 4.21.2 | React 18.3.1 + Vite 6.3.3 |
| **React** | 19.2.4 | 19.2.5 | — | 18.3.1 |
| **TypeScript strict** | ✅ | ✅ | ✅ | ✅ |
| **Package manager** | npm | npm | pnpm (workspace) | pnpm (workspace) |
| **Storage** | Google Sheets (service account) + mock fallback | Supabase (Postgres) | Ephemeral; Google Sheets append-log | none (client only) |
| **AI** | Claude Sonnet 4.6 (SDK 0.97.0) | Claude Sonnet 4.6 (SDK 0.36.0) | Claude Sonnet 4.6 (SDK 0.52.0) | — |
| **Auth** | Google OAuth (Gmail read+compose) | None (bearer token on `/api/ingest`) | None (CORS-only) | — |
| **UI tokens** | Tailwind 4, dark + gold `#c8a96e` | Tailwind 4, dark zinc | — | Vanilla CSS, light theme |
| **Packaging** | Standard Next.js | Standalone Next.js + `pkg` → `.exe` | tsc → node | Vite build |
| **Status** | Built; Phases 1–5 mostly done | Built (`.next/` present + `.exe`) | Running (logs show successful analyses) | Running (Vite HMR active) |

---

## What each project does (one sentence)

- **Oaki Relations** — strategic relationship OS: leads, companies, opportunities, research findings, interactions, AI insights, Gmail thread intelligence, draft queue. The "what to say + who to follow up with" layer.
- **Opportunity Terminal** — RSS-driven market signal engine: ingests architecture/real-estate news, classifies + analyzes with Claude, scores opportunities on 6 axes, generates outreach letters/emails/LinkedIn. The "why now" layer.
- **Fase B** — article → firm prospecting: paste a news URL, extract project metadata (Jina), discover candidate architecture/design firms (Tavily), Claude scores 5–8 firms 0–100 for Oaki fit, export to CSV / append to Google Sheets. The "who to contact" layer.

These align cleanly with the brief's core promise: *who to contact, why now, and what to say.*

---

## Oaki Relations — structure

```
src/
├── app/
│   ├── (page.tsx)               # / Today dashboard
│   ├── api/
│   │   ├── ai/                  # extract-research-signals, linkedin-strategy, prioritize-stakeholders
│   │   ├── analyze/             # lead "why now" analysis
│   │   ├── campaigns/
│   │   ├── companies/[id]/
│   │   ├── discovery/
│   │   ├── gmail/               # auth, callback, status, sync, analyze, create-draft
│   │   ├── import/apollo/       # CSV import
│   │   ├── insights/, interactions/, leads/, opportunities/, research/
│   │   ├── settings/status/, workflow/track/
│   ├── campaigns/, companies/[id]/, conversations/, discovery/[id]/
│   ├── draft-queue/, import/apollo/, insights/, leads/(new + [id])
│   ├── opportunities/, pipeline/, relationships/, research/, research-inbox/
│   ├── settings/, strategic-map/
│   ├── globals.css, layout.tsx
├── components/                  # 19 components in 11 sub-folders incl. ui/ primitives
└── lib/
    ├── claude.ts                # all prompts inline
    ├── mock-data.ts, types.ts, utils.ts
    ├── gmail/                   # client, sync, analyze, types, index
    └── sheets/                  # client, cache, leads, companies, opportunities,
                                 # research, interactions, insights, campaigns, discovery
```

**Notable:**
- 17 frontend pages, 24 API routes (highest surface area of the three).
- `gmail_tokens.json` lives at repo root (gitignored) — single-user token storage.
- `docs/current-build-status.md` already exists with self-audit (Phases 1–5 status + known issues).

---

## Opportunity Terminal — structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate/{letter,email,linkedin}/
│   │   ├── ingest/              # POST: bearer token; GET: cron header
│   │   ├── opportunities/{,[id]}/
│   │   └── research/{start,status/[id]}/
│   ├── opportunity/[id]/
│   ├── actions.ts               # triggerIngest() server action
│   ├── page.tsx                 # feed
│   ├── layout.tsx, globals.css
├── components/                  # FilterPanel, LetterGenerator, OpportunityCard, ScoreBadge, icons
├── lib/
│   ├── claude.ts                # classify + analyze + 3 generators
│   ├── supabase.ts              # public client + service client
│   ├── scoring.ts
│   └── ingestion/{processor,rss,sources}.ts
└── types/index.ts
supabase/schema.sql              # full DDL: sources, opportunities, ingestion_runs,
                                 # raw_articles, analyzed_articles, generated_outputs
launcher.js                       # pkg-aware launcher for .exe distribution
opportunity-terminal.exe          # 37.6 MB Win binary
vercel.json                       # (not examined)
```

**Notable:**
- 2 frontend pages, 9 API routes — narrow surface, deep AI pipeline.
- Standalone Next.js bundle (`output: 'standalone'`) packaged via `pkg@5.8.1` → Windows executable. The build script uses `xcopy` to assemble the bundle.
- Has a real database (Supabase) with proper schema and dedup logic.

---

## Fase B — structure (pnpm monorepo)

```
apps/api/                        # Express + tsx + Zod-validated env
├── src/
│   ├── app.ts, server.ts        # port 4000
│   ├── config/env.ts            # Zod schema
│   ├── controllers/{analyze,export}.controller.ts
│   ├── routes/{health,analyze,export}.route.ts
│   ├── schemas/phaseB.schema.ts # Article, Firm, PhaseBAnalysis
│   ├── services/                # anthropic, tavily, jinaReader, googleSheets,
│   │                            # costEstimate, export
│   ├── prompts/phaseB.systemPrompt.ts   # Spanish, 83 lines
│   └── utils/                   # AppError, asyncHandler, errorHandler, logger,
│                                # safeUrl, timeout
apps/web/                        # Vite + React 18 SPA
├── src/
│   ├── App.tsx, main.tsx
│   ├── api/phaseBClient.ts
│   ├── components/              # UrlForm, ArticleSummaryCard, FirmCard, FirmList,
│   │                            # ExportBar, CostEstimateCard, LoadingState, ErrorBanner
│   ├── hooks/usePhaseBAnalysis.ts
│   ├── types/phaseB.ts
│   └── styles/global.css        # vanilla, light theme, 860px container
README.md                        # only doc; no CLAUDE.md/AGENTS.md
```

**Notable:**
- Cleanly separated api/web with shared TypeScript types duplicated on both sides.
- API uses Zod for runtime validation (Relations and Terminal do not).
- API uses Pino for JSON logging; uses `jsonrepair` to fix malformed Claude JSON before parsing — a pattern Relations should adopt.
- Web app is the architectural outlier: Vite + React 18 + vanilla CSS, light theme. Cannot be merged as-is into a Next.js 16 + React 19 shell.

---

## Cross-project folder/convention observations

| Observation | Detail |
|---|---|
| **`lib/` vs `lib/sheets/` modularity** | Relations splits sheet entities into one file per entity (`leads.ts`, `companies.ts`, …). Terminal keeps Supabase logic in one `supabase.ts` + ingestion modules. Fase B uses a `services/` directory pattern. The Relations split-by-entity pattern is the cleanest. |
| **Prompts location** | Relations: inline strings in `lib/claude.ts`. Terminal: inline strings in `lib/claude.ts`. Fase B: separated file `prompts/phaseB.systemPrompt.ts`. **Fase B's separation is the right pattern** — prompts deserve their own files. |
| **Env validation** | Only Fase B validates env with Zod at startup. Relations and Terminal read `process.env.X` directly with no guard. |
| **Types duplication** | Fase B duplicates `Article`/`Firm` types in `apps/api/src/schemas/` and `apps/web/src/types/`. No shared package. This is a smell — but only a smell because they're a monorepo. |
| **Mock mode** | Only Relations has a mock-data fallback (when service-account creds invalid). Terminal and Fase B fail hard without their backing services. |
| **Component primitives** | Relations has its own `components/ui/` (Badge, CopyButton, …). Terminal has no primitive layer. Fase B has its own component set with no primitives. **No shadcn/ui in any of the three.** |
| **Documentation** | Relations has `docs/current-build-status.md` (genuinely useful) + a Miro plan. Terminal has only generic README + a deprecation notice in `CLAUDE.md`. Fase B has only README. |

---

## Build status snapshot (no commands run)

| Project | Has built? | Recent dev runs? | Visible errors? |
|---|---|---|---|
| Oaki Relations | ✅ `.next/` present | — | None at file level; `docs/current-build-status.md` lists known runtime issues |
| Opportunity Terminal | ✅ `.next/` + `standalone/` + `.exe` present | — | None |
| Fase B api | ✅ `tsc` based | ✅ `api-dev.out.log` shows successful analyses; `api-dev.err.log` is 0 bytes | None |
| Fase B web | ✅ Vite | ✅ `web-dev.out.log` shows HMR on 2026-05-18 | None |

The brief said to document and skip `npm install` / `npm run build` if risky or slow — **all three already have build artifacts**, so live builds were skipped in favor of inspecting configs.

---

## Confirmation of main-app decision

The brief states: *"Oaki Relations should become the main app."* The evidence supports this:

1. **Largest surface area** — 17 pages, 24 API routes vs 2/9 in Terminal, 0/3 in Fase B.
2. **Owns the user-facing CRM-like primitives** — Lead, Company, Opportunity, Interaction, Research, Insight, Campaign, DiscoveryPrep — that the other two would slot into.
3. **Already has the most polished UI** — only project with a real design-token system (dark + gold `#c8a96e`), only one with a sidebar/app shell.
4. **Already has auth** — Gmail OAuth flow is the only OAuth in the bundle and is the natural home for any future Google integration.
5. **Closest to the brand promise** — "strategic relationship OS" matches *who to contact, why now, what to say*.

Terminal and Fase B should become modules. See [audit-recommendation.md](audit-recommendation.md) for the proposed final architecture.
