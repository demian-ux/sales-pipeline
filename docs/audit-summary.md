# Audit — Executive summary

> Read this first. The other audit-*.md files have the details.

## 1. Executive summary

Three Oaki projects sit side-by-side on disk:

- **Oaki Relations** (`C:\Users\dszkl\sales-pipeline`) — Next.js 16, Google Sheets DB, Gmail OAuth, Claude. The largest and most polished. The "what to say + who to follow up with" layer.
- **Opportunity Terminal** (`C:\Users\dszkl\opportunity-terminal`) — Next.js 16, Supabase, RSS ingestion, Claude. Scores market signals from architecture/real-estate news. The "why now" layer.
- **Fase B** (`C:\Users\dszkl\fase-b`) — pnpm monorepo: Express API + Vite/React 18 SPA. Article URL → Jina extract → Tavily firm search → Claude scoring → CSV/Sheets. The "who to contact" layer.

These three roles align cleanly with the brief's core promise: *who to contact, why now, what to say.* That alignment is the reason this merge can work.

**Headline findings:**
1. No direct URL or table-name collisions today (different ports / different namespaces), but **`Opportunity` is overloaded** — Relations and Terminal both use the name for fundamentally different things. Rename Terminal's to `Discovery` before any merge work.
2. **Three Anthropic SDK versions** (0.36 / 0.52 / 0.97) — biggest dependency conflict. Consolidate to one.
3. **Three storage backends** (Sheets / Supabase / ephemeral) — biggest *architectural* conflict. A hybrid (Sheets for human-touched entities, Supabase for machine-generated) is the recommended path, but this is a decision for Demian.
4. **Fase B's web app is incompatible** (React 18 + Vite + light theme + vanilla CSS). The UX must be rebuilt inside Relations. The API logic ports cleanly.
5. **Relations' design system is the canonical one** — gold + dark, 40+ tokens, real sidebar shell. Everything else gets re-skinned to match.

## 2. Main recommendation

**Yes, merge — with Relations as the host.** The brief's expected direction holds up:

- **Oaki Relations = main relationship intelligence app** ✅ confirmed
- **Opportunity Terminal = research / opportunity discovery module** ✅ confirmed (rename `Opportunity` → `Discovery`)
- **Fase B = prospecting module** ✅ confirmed (but only the API logic; the Vite web app is discarded and rebuilt)

The merged app architecture and 15-step order are in [audit-recommendation.md](audit-recommendation.md).

## 3. Merge difficulty: **Medium**

Not Low — there are real architectural conflicts (storage, SDK versions, React 18 vs 19, two entities sharing a name).

Not High — no project depends on infrastructure the others don't have; nothing requires throwaway rewrites except Fase B's web UI; build artifacts confirm all three projects compile and run today.

Realistic estimate: **10–17 focused days**, plus 1–2 days of pre-merge decision-making.

## 4. Biggest risks

In severity order:

1. **Storage strategy decision** (`A1` in [audit-risks.md](audit-risks.md)) — three different stores; choice is hard to reverse. Decide before touching any code.
2. **`Opportunity` entity overload** (`A4`/`P1`) — two different things with the same name. Rename Terminal's to `Discovery` first thing.
3. **Three Anthropic SDK versions** (`A2`) — subtle API drift. Bump all to 0.97 and re-test every Claude call site.
4. **Gmail thread sync is session-memory only** (`C5`) — already flagged in Relations' own `current-build-status.md`. Persist before relying on it.
5. **Sheets writes can silently no-op in Relations** (`A8`) — also self-flagged. Fix before merge work that depends on Sheets writes.
6. **Fase B web rebuild scope** (`A3`) — non-trivial UX rebuild; the components inform the rebuild but aren't ported.
7. **Brand voice drift across three prompts** (`C7`) — outreach copy will sound inconsistent. Extract a single `BRAND_VOICE` fragment.

Full list (35 risks) in [audit-risks.md §3](audit-risks.md).

## 5. Best first merge step

**Step 0: Decide the storage strategy.**

Specifically: do entity rows for Lead / Company / Opportunity / Interaction stay in Google Sheets, while machine-generated rows (Discovery, RawArticle, IngestionRun, Source, Thread, ThreadAnalysis) go to Supabase? Or do we migrate everything one way or the other?

Until this is decided, every subsequent step has a fork.

**Once decided, Step 1: Rename Terminal's `Opportunity` → `Discovery` in Terminal's own code.** This is a self-contained rename inside one project (no merging yet) that removes the worst conceptual blocker. It can ship as a Terminal-only PR while the rest of the merge is planned.

## 6. Things to avoid

From the brief's "product principles to preserve" + risks surfaced by this audit:

- **No mass outreach.** Terminal's letter/email/LinkedIn generators are useful — but never wired to batch send or auto-send. Drafts go to the Draft Queue and require explicit human action.
- **No LinkedIn automation.** Relations' LinkedIn fields (`linkedin_connection_status`, `linkedin_dm_status`, `linkedin_warmth`) are *tracking* fields. Never wire them to an API.
- **No generic-CRM creep.** Pipeline view, Today dashboard, Insights — keep them strategic and compact. Don't add board views, kanban drag-drop, forecasting widgets, contact import wizards.
- **Don't conflate Discovery and Opportunity.** Two different entities, two different lifecycles. Promotion goes one way (Discovery → Opportunity by attaching a Lead).
- **Don't conflate Firm and Company.** Same — promotion is one-way (FirmCandidate → Company) and is an explicit user action.
- **Don't centralize storage prematurely.** Hybrid Sheets+Supabase is recommended because Sheets preserves Demian's edit-directly workflow. Resist "but consistency" pulls.
- **Don't auto-loop the Prospecting tool.** One article in, one analysis out. No "find similar firms" recursion that would turn it into a generic engine.
- **Don't ship the Strategic Map placeholder visible** in the merged sidebar — keep the file, hide the nav entry until it's real.
- **Don't drop Mock Mode.** Relations' mock-data fallback is what lets you run the app without live Sheets. Keep it through the merge.

## 7. Open questions for Demian

1. **Storage:** Sheets-everywhere, Supabase-everywhere, or hybrid? (Audit recommends hybrid; this is the one decision that blocks everything else.) See [audit-data-models.md §Storage](audit-data-models.md).
2. **Is `.exe` distribution still wanted?** Terminal currently builds `opportunity-terminal.exe` via `pkg`. If the merged app should also ship as a Windows binary, `pkg` (maintenance mode) needs reevaluation. If not, drop it.
3. **What is `/api/research/extract` for?** Relations has both `/api/research/extract` and `/api/ai/extract-research-signals` — the second one is what `research-inbox` actually calls. Is the first orphaned?
4. **Should Fase B's firm-discovery prompt stay Spanish or be translated?** The output is internal-only today, so either is fine — but if firm summaries surface to outreach copy later, the inconsistency will bite.
5. **Should Discovery → Opportunity promotion include a `Lead`-creation flow?** A Discovery often points to a developer / firm without a known contact person. Should promotion create the Company + a placeholder Lead, or block until a Lead exists?
6. **`gmail_tokens.json` at repo root** is fine for local single-user. If the merged app is ever hosted, what's the deployment story for token storage?
7. **Apollo CSV import + Prospecting overlap conceptually.** Should they live in the same `/import` section? Or separate top-level entries to signal that Prospecting is a *discovery* tool and Apollo is a *bulk-load* tool?
8. **Does the merged app need any session auth?** Single-user posture today. If it's ever hosted at a public URL, even a basic auth layer is worth planning.
9. **Strategic Map** — is this still on the roadmap, or has it been deprioritized? Affects whether to keep the placeholder.
10. **Miro integration plan** — `docs/miro-integration-plan.md` exists in Relations. Still relevant, or out of scope?

---

## Document index

- **[audit-overview.md](audit-overview.md)** — Per-project overview tables, folder structure breakdown, confirmation that Relations is the right main app
- **[audit-routes.md](audit-routes.md)** — Full route inventory per project, conflict table, proposed merged URL namespace
- **[audit-data-models.md](audit-data-models.md)** — Model-by-model comparison, resolution table, storage strategy discussion
- **[audit-integrations.md](audit-integrations.md)** — Integration matrix, env var matrix (and naming collisions), AI/prompt comparison
- **[audit-ui.md](audit-ui.md)** — Design system comparison, component inventory, what to preserve / discard visually
- **[audit-risks.md](audit-risks.md)** — Dependency conflict matrix, build status, 35 risks scored by severity, triage by merge phase
- **[audit-recommendation.md](audit-recommendation.md)** — Final architecture, module ownership, 15-step merge order, what NOT to merge, effort estimate

---

## Final instruction (per audit brief)

This audit stops here. **No merge has been done. No code has been modified.** Two documents to review:

- [audit-summary.md](audit-summary.md) (this file)
- [audit-recommendation.md](audit-recommendation.md)

Only after approval should merge work begin.
