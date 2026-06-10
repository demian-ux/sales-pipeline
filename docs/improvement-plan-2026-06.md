# Oaki Relations — Audit & Improvement Plan

*Date: 2026-06-09. Method: outreach strategy reconstructed from all past Claude Code sessions + three parallel deep code audits (signal side, relationship side + data layer, UX/workflow) of this repo. Supersedes `opportunity-terminal/docs/improvement-plan.md` — Relations is the consolidated live app; findings there that carried over in the port are re-verified here with Relations file:line refs.*

---

## Verdict in five themes

1. **The funnel has no persistent spine.** "Sent" state, Gmail threads/analyses, thread-derived signals, workflow actions, and meeting preps all live in `global.__oaki_session_cache` — wiped on every restart/redeploy, and on Vercel different requests can hit different instances. `last_touch_date` is read in 8 places and **written by zero code paths**. So the Today queue, attention signals, and campaign-due counts — the heart of cadence execution — run on hand-typed Sheet data and silently reset.
2. **The Terminal's worst signal bugs were ported verbatim**, and one got worse: transient AI failures still permanently tombstone articles, and the new 300s Vercel wall adds a second permanent-loss trigger (candidates inserted as `new` before the kill are treated as duplicates forever after).
3. **The last mile is ~12–14 interactions where it should be one.** There is no "mark sent" on the lead page; Gmail draft creation exists only on the hidden `/draft-queue`, which is itself dead (it filters on legacy insight fields the current analyze prompt no longer fills).
4. **Cadence exists nowhere in the UI.** Tue/Thu cold-send days appear only in a mock-data comment. No "due this week" roll-up, no send-day queue; only after-the-fact "overdue" detection.
5. **Outreach generation is split-brain.** The lead side gets full context and "from Oaki's founder"; the discovery side still demands `[Sender Name]` placeholders, feeds email/LinkedIn generators **only the title string**, and hardcodes "references a letter already sent" regardless of reality.

---

## Strategy vs. reality

| Strategy requires | App reality | Refs |
|---|---|---|
| Never lose a "why now" signal | Null analysis → tombstoned forever (`analysis_attempts` never read); 300s wall kills busy runs and strands candidates as fake duplicates; dead RSS feeds invisible (errors swallowed; `ingestion_runs` lacks a `failed_sources` column); GNews enrichment fetches the unresolved interstitial | `lib/discoveries/processor.ts:119-160, 232-235, 276-279, 432, 498-529`; `lib/discoveries/rss.ts:41-69`; `api/discoveries/ingest/route.ts:22,94` |
| Letter → email → LinkedIn with premium specific copy | Discovery email/LinkedIn prompts receive title only; letter forces bracket placeholders; sequence position hardcoded as prior fact; no sender identity; English-only never stated (French feed exists) | `lib/prompts/discoveries/generate-{letter,email,linkedin}.ts`; `api/discoveries/[id]/generate/email/route.ts:31` |
| Tue/Thu cold sends, weekly/quarterly cadences | No send-day surface; campaign `cadence` is a static label that never proposes `next_followup_date`; Today only shows overdue | `components/dashboard/cards/TodayCard.tsx:134-152`; `components/campaigns/CampaignsClient.tsx:110-168` |
| Track sent → replied → meeting | "Mark sent" writes sessionCache only; no Interaction auto-logged; `pipeline_stage` manual-only; replies inferred from non-persistent Gmail cache; meeting prep evaporates | `api/workflow/track/route.ts:24`; `lib/sheets/cache.ts`; `lib/sheets/meeting-prep.ts:4-13` |
| Hard ICP exclusions (construction/PM/investment), NY/Miami/France | Exclusions are prompt-text only with "include if unsure" instruction; no code-level filter; Tavily country list is legacy LatAm-heavy; nothing biases to target geos | `lib/prompts/prospecting/select-firms.ts:53-62`; `lib/prospecting/tavily.ts:35-39,71-81` |
| Quality-over-volume triage | 3+ disagreeing tier systems (model tier wins at write; badge 70/40; card 85/75; filter 60/75/85; dashboard mixes both); region filter works via ILIKE `_` wildcard accident | `lib/discoveries/scoring.ts:36-40`; `components/discoveries/DiscoveryCard.tsx:30-34`; `api/discoveries/route.ts:44` |
| Single-user private tool | Ingest endpoint trusts spoofable `x-vercel-cron` header unconditionally; whole app open if `APP_PASSWORD`/`SESSION_SECRET` unset; **live Gmail refresh token in plaintext at repo root (`gmail_tokens.json`)** — migration code shipped but the artifact remains | `lib/auth.ts:106-122`; `middleware.ts:31-55` |

---

## Improvement plan

### P0 — Give the funnel a spine (persistence + write-through)

> **STATUS: IMPLEMENTED 2026-06-09.** All six items below are in the codebase; build verified. One manual step remains: run `supabase/migrations/2026-06-09_p0_persistence.sql` in the Supabase SQL editor (workflow_actions + meeting_preps tables, failed_sources column), and set `CRON_SECRET` in Vercel env. The Message Batches API option (P3 #16) was deferred to the end of implementation per Demian.
1. **Persist Gmail threads/analyses to the already-existing Supabase tables** (`threads`, `thread_analyses` exist in `supabase/schema.sql:203-242`; zero code reads/writes them). Sync writes through; conversations page, dashboard cards, and analyze read from Supabase with sessionCache as a hot layer at most. Fixes the non-deterministic "Thread not found — sync first" on Vercel too.
2. **One-click "Mark sent" on the lead draft tab that writes through**: auto-log an Interaction (channel/direction), bump `pipeline_stage` New Lead→Contacted, set `last_touch_date`, auto-propose `next_followup_date` from the campaign's cadence. Replaces today's two-form, two-reload dance. Same write-through on `OppStatusButton` "Mark contacted".
3. **Persist workflow actions** (`api/workflow/track` → Supabase table instead of sessionCache) and **persist meeting preps** (Sheets tab or Supabase).
4. **Reconcile the draft path**: add "Create Gmail draft" (`/api/gmail/create-draft` is built and working) next to Copy on `LeadAnalysisCard`; retire `/draft-queue` or repoint it at the Supabase `email_drafts`/`linkedin_drafts` tables.
5. **Stop losing signals**: never write `analyzed_articles` on null analysis; honor `analysis_attempts` (retry ≤3 runs); check `stop_reason === 'max_tokens'`; reclaim `raw_articles` stuck at `status='new'/'failed'` on the next run; resolve Google News URLs **before** the enrichment fetch; propagate RSS errors out of `fetchRSSFeed` and add `failed_sources` to `ingestion_runs` + surface in UI.
6. **Security trio**: rotate the Gmail refresh token and delete `gmail_tokens.json`; replace the unconditional `x-vercel-cron` trust with `CRON_SECRET` bearer; make auth fail-closed (refuse to serve if `APP_PASSWORD`/`SESSION_SECRET` unset in production).

> **STATUS: P1, P2, and P3 IMPLEMENTED 2026-06-10** (see commit diff). Manual step: run `supabase/migrations/2026-06-10_p1_p2.sql` (letter_drafts table).
>
> **Batches API decision (assessed at end of implementation, per Demian):** NOT implemented. With 3-way concurrency + the deadline/defer/reclaim mechanism, a full run (≤26 candidates) now fits comfortably inside the 270s budget, and Haiku triage cut the dominant cost. Batches would add a submit-in-run-N / harvest-in-run-N+1 state machine for ~50% savings on a pipeline that now costs cents per run — revisit only if source volume grows ~10×.

### P1 — Make cadence executable
7. **Today answers "what do I send today"**: a send-day card — "Next cold-send day: Tue · N staged" listing cold leads with drafts ready, plus a cross-campaign "due this week" roll-up (campaign-due leads currently never reach Today).
8. **Discovery triage at scan speed**: Save/Archive directly on `DiscoveryCard`, multi-select with bulk archive, "new since last visit" marker. Today: 2 page-loads per noise item.
9. **Deep-link conversations** (`?thread=` param) from TodayCard/ConversationsCard rows — every reply currently requires re-finding the thread manually.

### P2 — Outreach quality (the copy itself)
10. **Sender profile + context parity**: inject "Demian Oki, founder, Oaki Studio — architectural visualization" into all generators (kill `[Sender Name]` placeholders); give discovery email/LinkedIn the same context the letter gets (summary, deep-analysis excerpt, actors, location); make sequence position (first touch / follows letter / follows letter+email) an explicit selector instead of hardcoded prompt fact; state English-only in `BRAND_VOICE`; move the full forbidden-phrase list from `docs/outreach-context.md:199-204` into `BRAND_VOICE` (today only "Hope you're well" is encoded).
11. **Connect generation to records**: GenerateOutreach recipient becomes a picker over promoted firms/leads instead of free-text; add the Letter generator to the lead page (Letter is a campaign channel but only discoveries can generate one).
12. **ICP enforcement in code**: post-filter prospecting candidates (name/domain keyword blocklist for construction/PM/investment/brokerage), bias Tavily queries to NY/Miami/France, fix the country whitelist and the `in unspecified` query degeneracy. Flip the prompt default from "include if unsure" to "exclude if unsure" — your stated preference is that these never appear.
13. **Unify tiering**: one tier source (recommend numeric score with model tier as input), align card/badge/filter thresholds, normalize region values (store snake_case or filter on display values — kill the wildcard accident).

### P3 — Robustness, performance, hygiene
14. **IDs + validation**: `crypto.randomUUID()` everywhere (bare `Date.now()` IDs in leads, opportunities, insights, interactions, research, thread analyses); Zod on the remaining write routes (leads, opportunities, insights, interactions, research, apollo, promote); make `updateCampaign`/`updateLead`/`updateOpportunity` surface missing-row instead of silent success.
15. **Sheets resilience**: retry/backoff + quota guard in the client; chunk Apollo import writes (100-row import ≈ 200-300 sequential full-tab reads/writes today — the most likely real-world failure); cache full-tab reads per-request (every `getXById` is a full-tab scan; `/leads/[id]` = 7 reads); restrict mock-data fallback to an explicit dev flag (today an empty or failing Sheet silently shows sample data, and `findOrCreateCompanyByName` can attach real Opportunities to a mock company).
16. **Pipeline cost/speed**: document and default `ANTHROPIC_CLASSIFIER_MODEL=claude-haiku-4-5` for triage; small-batch concurrency (3-5) or move ingestion to the Message Batches API (50% cheaper, no 300s pressure — submit in run N, harvest in run N+1, fits the 6-hour cron); restructure prompts so the system block clears Sonnet's 2048-token caching minimum; drop `sleep(300)`; make `withTimeout` abort the underlying request; add Zod schemas (or upgrade to structured outputs) for `classifyArticle`/`analyzeArticle` — `jsonrepair` currently masks truncation as valid-but-incomplete data.
17. **Cross-store integrity**: idempotency on Discovery→Opportunity promotion (reverse-link write can fail → double promotion); single-firm promote should use `findOrCreateCompanyByName` like the bulk path (currently blind-appends duplicates); pass `discoveryId` through to `/api/prospecting/analyze` (provenance is silently lost — `firm_candidates.source_discovery_id` is always NULL).
18. **UX sweep**: fix silent failures (`LeadActions.tsx:114,380` ignore `res.ok`; Apollo preview try/finally without catch); replace 10 `window.location.reload()` sites with `router.refresh()`; add a toast system; CandidatesCard rows get Promote/Dismiss/Find-firms actions (currently decorative); redirect `/research-inbox` (literal re-export of `/research`); delete dormant `PromoteButton.tsx` and the dead "Skip duplicates" checkbox; standardize black-on-gold accent buttons (white-on-gold fails contrast); migrate legacy-token pages to the `.btn/.card` system; fix the prospecting cost table (Opus 4.7 priced 3× too high, nonexistent `claude-sonnet-4-7` entry).

---

## Strategy-level improvements (enabled by P0)

1. **Close the learning loop.** Once sent/replied persists (P0 #1-3), add a lightweight outcome field per outreach (no reply / replied / meeting) — after ~50 sends you'll know which signal types, sectors, and campaigns convert. Nothing in the stack can learn today because nothing records outcomes.
2. **Match sources to the signal taxonomy.** Sources are Supabase rows — add award feeds (AIA, Architizer, Dezeen Awards), competition calendars (Bustler/Competitions.archi), and hiring feeds (Archinect/Dezeen Jobs filtered for marketing/comms/design-director roles at NY/Miami firms — a named buy-signal no current source can see). Also reconsider `ARTICLE_FRESHNESS_DAYS = 365`: a year-old article is not a "why now".
3. **Capture the render-gap signal.** Your most differentiated signal ("premium positioning, weak current renders") has no field anywhere. Add a yes/no flag + note on Company/firm-candidate, set during the 30-second taste check, boosting priority.
4. **Tighten Gmail sync scope** as lead count grows: today it's O(leads × 9) sequential Gmail calls; sync only leads with activity or in active campaigns.

## Open decisions

1. **Batches API vs. chunked runs** for ingestion (P3 #16) — Batches is cheaper and removes the time wall but adds a harvest step; chunking keeps it simple.
2. **Draft queue: retire or repoint** (P0 #4) — the lead page can absorb its actions, or the queue becomes the Tue/Thu staging surface (pairs naturally with P1 #7).
3. **Standalone opportunity-terminal repo**: archive it (Relations contains the ported pipeline) or keep as sandbox. Its separate Supabase project/cron, if still live, is burning duplicate ingestion spend — worth checking Vercel/Supabase dashboards.
