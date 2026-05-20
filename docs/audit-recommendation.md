# Audit — Recommended merge strategy

> Recommendation only. No merge work has happened. Demian's approval required before any of this is acted on.

## Recommended final architecture

```
Oaki Relations (the merged app — Next.js 16 App Router)
│
├── Relationship Intelligence       (Relations as-is)
│   ├── Today dashboard             # /
│   ├── Relationships               # /relationships
│   ├── Leads (list, detail, new)   # /leads, /leads/[id], /leads/new
│   ├── Opportunities               # /opportunities, /opportunities/[id]
│   ├── Pipeline                    # /pipeline
│   ├── Campaigns                   # /campaigns
│   ├── Companies                   # /companies/[id]
│   ├── Discovery (meeting prep)    # /discovery/[id]  (renamed MeetingPrep entity)
│   ├── Draft Queue                 # /draft-queue
│   ├── Research                    # /research
│   ├── Research Inbox              # /research-inbox
│   └── Insights                    # /insights
│
├── Discoveries                     (from Opportunity Terminal — renamed)
│   ├── Discovery feed              # /discoveries (was Terminal /)
│   └── Discovery detail            # /discoveries/[id] (was /opportunity/[id])
│
├── Prospecting                     (from Fase B — UI rebuilt, logic ported)
│   └── Article → firm tool         # /prospecting (was Fase B Vite SPA)
│
├── Gmail                           (Relations as-is)
│   ├── Conversations               # /conversations
│   └── OAuth flow                  # /api/gmail/...
│
├── Import                          (Relations as-is)
│   └── Apollo CSV                  # /import/apollo
│
└── Settings                        # /settings (extended for new modules)
```

**Strategic Map** stays as a placeholder — out of scope for the merge.

---

## Recommended module ownership

| Feature | Final owner | Source project | Notes |
|---|---|---|---|
| Lead, Company, Opportunity, Interaction, AIInsight, Campaign, ResearchFinding, MeetingPrep (renamed DiscoveryPrep) | Relations | Relations | Core entities — no change |
| Gmail OAuth, sync, thread analysis | Relations | Relations | No change |
| Apollo CSV import | Relations | Relations | No change |
| Discovery (renamed from Terminal's Opportunity) | Relations / Discoveries module | Terminal | Rename entity, port routes under `/discoveries`, port Supabase schema |
| RawArticle, AnalyzedArticle, Source, IngestionRun | Relations / Discoveries module | Terminal | Keep in Supabase (dedup needs `UNIQUE` constraints) |
| Letter / Email / LinkedIn generators | Relations / shared `lib/prompts/generate/` | Terminal | Merge with Relations' draft logic; expose under `/api/discoveries/[id]/generate/*` |
| RSS ingestion + cron | Relations / Discoveries module | Terminal | `/api/discoveries/ingest` (POST + GET cron) |
| Article-to-firm prospecting flow | Relations / Prospecting module | Fase B api | Port `analyze`/`export` logic into Next.js API routes |
| Tavily + Jina integrations | Relations / Prospecting module | Fase B api | Port wholesale |
| FirmCandidate → Company promotion | Relations / Prospecting module | new | New helper; map 6 Fase B fields onto rich Company entity |
| Google Sheets append-log for firms | Relations (optional) | Fase B api | Keep if Demian wants a Sheets-of-discoveries audit log; otherwise skip — Supabase covers it |
| Single Anthropic client | Relations / `lib/ai/client.ts` | Relations (latest SDK) | All three apps converge here |
| Brand voice prompt fragment | Relations / `lib/prompts/brand.ts` | new | Extract from current SYSTEM_PROMPT |
| Design tokens (gold + dark) | Relations | Relations | Canonical |
| App shell / sidebar | Relations | Relations | Extended with new nav entries |
| Icon library | Relations / `components/ui/icons.tsx` | Terminal | Adopt Terminal's `icons.tsx` upward |
| Zod env validation | Relations / `lib/env.ts` | Fase B | Adopt at boot |
| Claude JSON parsing helper (jsonrepair + Zod) | Relations / `lib/ai/parse.ts` | Fase B | Adopt |
| withTimeout wrapper | Relations / `lib/ai/timeout.ts` | Fase B | Adopt |
| Pino logging | Relations API routes (optional) | Fase B | Optional adoption |

---

## Recommended merge order

Each step ends in a working, deployable app. **Do not start step N+1 until step N is verified.**

### Pre-merge (decision-gates)
0. **Decide storage strategy** (hybrid Sheets + Supabase recommended — see `audit-data-models.md`). Blocks everything that follows.

### Foundation
1. **Unify types** — bring all entity types into Relations' `src/lib/types.ts`. Rename Terminal's `Opportunity` to `Discovery` *in Terminal first* (keeps Terminal working while we work). Add `Discovery`, `RawArticle`, `AnalyzedArticle`, `Source`, `IngestionRun`, `FirmCandidate` to Relations as type-only.
2. **Unify env vars** — adopt `GOOGLE_SHEETS_*` naming, add Zod-validated `lib/env.ts` to Relations. Create the missing `.env.example` for Relations covering all current + new keys.
3. **Unify Anthropic client** — bump Relations' SDK to latest, build `lib/ai/{client,parse,timeout}.ts` adopting Fase B's patterns (jsonrepair, Zod, withTimeout). Migrate Relations' existing prompts to use the new client. *Verify all existing Relations Claude flows still work.*
4. **Extract prompts** — move all inline Relations prompts to `src/lib/prompts/` files. Extract `BRAND_VOICE` fragment. Translate Fase B's Spanish prompt to English (or document why it stays Spanish).

### Discoveries (Terminal port)
5. **Port Supabase schema + clients** — bring `supabase/schema.sql` into Relations under `supabase/`. Add `lib/supabase.ts` (public + service clients).
6. **Port Discovery routes** — `/discoveries`, `/discoveries/[id]`, `/api/discoveries/*`, `/api/discoveries/ingest`, `/api/discoveries/ingest/[runId]`. Reuse Relations' app shell. Re-skin `OpportunityCard` → `DiscoveryCard` with Relations tokens.
7. **Port Discovery → Opportunity promotion** — new flow: a Discovery can be attached to a Lead to create an Opportunity. Carries provenance (`source_url`, `discovered_from_id`). UI button on Discovery detail.
8. **Port generate routes** — `/api/discoveries/[id]/generate/{letter,email,linkedin}` using the new unified prompts. Verify outputs are saved to `Interaction` with `direction='draft'`.

### Prospecting (Fase B api port)
9. **Port Fase B services** — `lib/prospecting/{anthropic,tavily,jinaReader,export,costEstimate}.ts` ported wholesale (already TypeScript, mostly framework-agnostic). Adapt to use the unified Anthropic client.
10. **Port Fase B routes** — `/api/prospecting/analyze`, `/api/prospecting/export` as Next.js API routes. Drop the Express server entirely.
11. **Rebuild Prospecting UI** — new `/prospecting` page with URL form, article summary card, firm list with score badges, export bar. Built with Relations tokens + Tailwind v4 + React 19. *Do not port the Vite SPA.*
12. **Add FirmCandidate → Company promotion** — UI button on the firm list; explicit field mapping; opens the new Company in `/companies/[id]` for Demian to enrich.

### Final
13. **Update sidebar navigation** — add `Discoveries` and `Prospecting` sections; verify all routes reachable.
14. **Remove duplicates** — delete Terminal's `src/lib/claude.ts`, Fase B api's separate Anthropic client, Fase B api's separate types. Drop the standalone Express server. Drop the Vite web app.
15. **End-to-end test full app** — every page loads, every API responds, Gmail OAuth round-trips, ingest runs, discovery → opportunity promotion works, firm → company promotion works.

### Optional polish (post-merge)
16. Migrate `Date.now()` IDs → UUIDs for new entities.
17. Add Zod validation to API POST bodies.
18. Add Pino structured logging to API routes.
19. Persist Gmail thread analyses to Sheets (or Supabase if hybrid chosen) — fixes Relations' session-only memory.

---

## What not to merge

| Don't bring over | Why |
|---|---|
| `apps/web/` from Fase B (the entire Vite SPA) | React 18 + light theme + vanilla CSS — incompatible. Rebuild as Relations page. |
| Fase B api's Express server (`apps/api/src/app.ts`, `server.ts`) | Next.js API routes are the new home. Drop CORS, Express, dotenv, tsx. |
| Terminal's `OpportunityCard`, `FilterPanel`, `LetterGenerator` styling | Two-token CSS system + blue accent. Re-skin during port. |
| Terminal's two-token `globals.css` (`--background`, `--foreground` only) | Relations' 40-token system is the canonical theme. |
| Terminal's `launcher.js` + `.exe` packaging path | Unless `.exe` distribution is still wanted (ask Demian). If so, retarget the launcher at the merged app's build output. |
| Three separate `claude.ts` files | One unified `lib/ai/client.ts`. |
| Three brand-voice instruction blocks | One unified `BRAND_VOICE` prompt fragment. |
| Fase B's `apps/web/src/types/phaseB.ts` (duplicated types) | Single source of truth lives in Relations' `lib/types.ts`. |
| Relations' `mock-data.ts` (eventually) | Useful for dev right now; consider removing post-merge once Supabase/Sheets are reliable. Not urgent. |
| Relations' `/api/research/extract` route (if confirmed unused) | Looks orphaned vs `/api/ai/extract-research-signals`. Confirm with Demian. |
| Relations' Strategic Map placeholder | Keep file but hide from sidebar until built. |
| Old Terminal `Opportunity` references in code (post-rename) | Audit grep for `Opportunity` after rename to ensure no stragglers. |
| Three different date-fns imports | Pin one major version (4.x). |

---

## Things to be careful about during the merge

- **Don't conflate Discovery and Opportunity entities.** They are intentionally separate. A Discovery is a market signal; an Opportunity is a deal in motion. Promotion goes one way.
- **Don't conflate Firm and Company entities.** A Firm is a candidate from article discovery; a Company is an engaged firm. Promotion goes one way.
- **Don't centralize storage prematurely.** The hybrid model (Sheets for human-touched entities, Supabase for machine-generated) is recommended *because* it preserves Demian's edit-in-Sheets workflow. Resist the urge to move everything to one store "for consistency".
- **Don't merge `suggested_email` and Terminal's `letter` generator into one prompt.** They serve different audiences (cold outreach vs warm follow-up). Share the `BRAND_VOICE` fragment but keep the prompts task-specific.
- **Don't auto-send anything.** All outreach drafts go to the Draft Queue and require Demian's explicit copy/send. This is the core product principle.
- **Don't enable mass operations.** Bulk LinkedIn DMs, bulk emails, bulk discovery → opportunity promotion — none of these. Single-action UX everywhere.
- **Don't add a "find similar firms" auto-loop to Prospecting.** The pattern would turn the tool into a generic prospecting engine. Each article = one analysis; user moves on.

---

## Estimated effort (rough)

| Phase | Steps | Effort |
|---|---|---|
| Pre-merge (storage decision + docs review) | 0 | 1–2 days |
| Foundation (steps 1–4) | unify types, env, Claude, prompts | 2–3 days |
| Discoveries (steps 5–8) | port Terminal | 3–5 days |
| Prospecting (steps 9–12) | port Fase B | 3–5 days |
| Final (steps 13–15) | nav + cleanup + E2E | 1–2 days |
| **Total** | | **~10–17 days of focused work** |

Optional polish (steps 16–19) adds another 2–4 days.

**Confidence:** medium. The estimate assumes the storage decision (step 0) goes smoothly. If Demian wants a full Sheets-only or full Supabase-only strategy, add 3–5 days for that migration. If `.exe` packaging needs to be preserved, add 1–2 days for `pkg`/launcher work.
