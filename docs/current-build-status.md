# Current Build Status

Created: 2026-05-19
Updated: 2026-05-19 after initial Phase 4.5 LinkedIn implementation and Phase 5 continuation

## 1. What phases appear complete

Phase 1 is mostly complete. The app has a Next.js 16 app shell, compact base UI, mock-data fallback, Google Sheets client helpers, Anthropic integration, shared types, and a first lead analysis flow.

Phase 2 is mostly complete. Leads, Companies, Opportunities, Research_Findings, Interactions, Campaigns, and AI_Insights are represented in types and Sheets modules. The app has Today, relationship, lead detail, opportunity, pipeline, campaign, discovery, research, settings, and conversation surfaces.

Phase 3 is substantially complete. Lead scoring fields exist, the homepage surfaces operating priorities, AI analysis produces why-now reasoning, recommended next actions, draft email/LinkedIn copy, discovery questions, objections, opportunities, risk, and confidence.

Phase 4 is partially complete. Gmail OAuth, sync, status, conversation list, thread parsing, and thread analysis exist. Conversation state detection exists in memory.

Phase 4.5 is now partially complete. LinkedIn relationship fields, Sheets columns, mock data, lead editing support, a lead detail LinkedIn panel, manual LinkedIn action logging, and `POST /api/ai/linkedin-strategy` now exist. LinkedIn remains manual-only.

Phase 5 is now mostly complete. A `/research` page and `/research-inbox` route exist with a research ingestion form, Claude signal extraction, review-before-save, research finding persistence, selected opportunity creation, optional AI insight saving, and lead detail research history.

## 2. What features exist but are incomplete

- LinkedIn context now exists as URLs, status fields, warmth, notes, strategy recommendations, and manual action logging. It is still not represented as a richer unified strategic timeline beyond the existing interaction history.
- Gmail sync is session-memory based. Synced threads and analyses are stored in `sessionCache`, so they are lost when the server restarts.
- Gmail is read-only. This matches current safety rules, but Phase 8 Gmail draft creation will require a scope and approval flow change later.
- Research ingestion can now create findings, opportunities, and optional AI insights from the extraction result.
- Research source types are now aligned between the research inbox and lead detail form.
- Company creation is incomplete in mock mode. `createCompany` intentionally no-ops when `USE_MOCK` is true, so creating a new lead in mock mode can produce a lead with a company id that has no matching company record.
- Lead editing now includes LinkedIn status fields, but broader contact/company editing remains limited.
- Strategic visualizations are not present yet. There is no `/strategic-map`, health map, discovery pipeline view beyond individual discovery prep, or Miro plan doc.

## 3. What features are missing

- Phase 4.5 timeline integration beyond the existing interaction list.
- A persistent record of generated LinkedIn strategies. Today they are shown in the lead panel but not saved as AI insights or workflow memory.
- Company-level research history is still missing because there is not yet a company detail page.
- Phase 6 Strategic Map, Opportunity Board grouping controls, Relationship Health Map, Discovery Pipeline View, Strategic Timeline, and `docs/miro-integration-plan.md`.
- Phase 7 Apollo CSV import, duplicate detection, stakeholder mapping, and stakeholder prioritization route.
- Phase 8 Draft Queue, approved Gmail draft creation, strategic reminders, and workflow memory.
- Persistent storage for Gmail threads, Gmail analyses, workflow memory, and accepted/rejected recommendations.

## 4. What files/routes/components already exist

Routes:
- `/` Today dashboard: `src/app/page.tsx`
- `/relationships`: `src/app/relationships/page.tsx`
- `/leads/[id]`: `src/app/leads/[id]/page.tsx`
- `/leads/new`: `src/app/leads/new/page.tsx`
- `/research`: `src/app/research/page.tsx`
- `/research-inbox`: `src/app/research-inbox/page.tsx`
- `/opportunities`: `src/app/opportunities/page.tsx`
- `/campaigns`: `src/app/campaigns/page.tsx`
- `/pipeline`: `src/app/pipeline/page.tsx`
- `/insights`: `src/app/insights/page.tsx`
- `/discovery/[id]`: `src/app/discovery/[id]/page.tsx`
- `/conversations`: `src/app/conversations/page.tsx`
- `/settings`: `src/app/settings/page.tsx`

API routes:
- `POST /api/analyze`
- `GET/POST /api/leads`
- `GET/PATCH /api/leads/[id]`
- `GET/POST /api/opportunities`
- `PATCH /api/opportunities/[id]`
- `GET/POST /api/research`
- `POST /api/research/extract`
- `POST /api/ai/extract-research-signals`
- `GET/POST /api/insights`
- `POST /api/ai/linkedin-strategy`
- `GET/POST /api/interactions`
- `GET /api/campaigns`
- `POST /api/discovery`
- `GET /api/settings/status`
- Gmail auth, callback, status, sync, and analyze routes under `/api/gmail/*`

Core modules:
- Shared types: `src/lib/types.ts`
- Claude prompts and parsers: `src/lib/claude.ts`
- Mock data: `src/lib/mock-data.ts`
- Sheets client and entity modules: `src/lib/sheets/*`
- Gmail client, sync, analysis, and types: `src/lib/gmail/*`

Key components:
- `src/components/layout/Sidebar.tsx`
- `src/components/leads/LeadActions.tsx`
- `src/components/leads/LeadEditForm.tsx`
- `src/components/leads/AddOpportunityForm.tsx`
- `src/components/leads/LinkedInPanel.tsx`
- `src/components/research/ResearchIngestForm.tsx`
- `src/components/conversations/SyncButton.tsx`
- `src/components/conversations/AnalyzeThreadButton.tsx`
- `src/components/settings/SettingsClient.tsx`
- `src/components/insights/InsightsClient.tsx`
- `src/components/discovery/DiscoveryClient.tsx`
- UI primitives under `src/components/ui/*`

## 5. Any broken flows

- Newly created leads in mock mode may reference companies that do not exist, because mock company creation is not stored.
- `/api/research` now validates `company_id` and `research_summary`.
- `/api/interactions` accepts missing `lead_id`, `company_id`, `channel`, and `direction`, which can create malformed timeline entries.
- Research extraction now checks opportunity save responses and reports failures.
- Gmail conversation data is volatile because it only lives in `sessionCache`.
- The app contains visible mojibake characters in several labels and comments, likely from UTF-8 text read or saved through the wrong encoding. This affects UI polish.
- This workspace is not currently a Git repository, so the roadmap instruction to commit changes cannot be followed here until git is initialized or the repo root is corrected.

## 6. Any duplicated logic

- Research and opportunity creation logic appears in both `ResearchIngestForm` and the lead detail `LeadActions` research form.
- Opportunity type lists are duplicated in multiple client components.
- Source type lists are duplicated, though now aligned.
- Relative date helpers exist in both `src/lib/utils.ts` and `src/app/conversations/page.tsx`.
- Lead context assembly in `src/lib/claude.ts` will need to be reused or generalized for LinkedIn strategy, stakeholder prioritization, and future automation recommendations.
- Manual interaction logging is generic today; LinkedIn-specific action logging should reuse one canonical helper instead of adding another disconnected form.

## 7. Any risky code

- `src/lib/gmail/client.ts` writes OAuth tokens to `gmail_tokens.json` in the project root. This is local-only and ignored by git, but it is still sensitive and should stay out of logs and artifacts.
- `src/lib/claude.ts` extracts JSON with a broad regex. If a model response includes extra braces, parsing can fail or capture the wrong object.
- API write routes have limited validation and mostly trust request bodies.
- `Date.now()` ids can collide under rapid writes. A UUID helper would be safer.
- Google Sheets update helpers silently return when rows or ids are missing, which can make failed updates look successful.
- Several pages use inline styles extensively, making future visual consistency and responsive QA harder.
- Gmail sync queries every lead with an email on each sync and can become slow as the lead list grows.

## 8. Recommended next implementation order

1. Finish Phase 4.5 polish: show LinkedIn actions in a more deliberate timeline treatment, add stricter API validation, and decide whether generated LinkedIn strategies should be saved as AI insights.
2. Stabilize foundations before larger phases: introduce a shared id helper, fix mock company creation, normalize source/opportunity constants, and clean visible mojibake.
3. Finish the remaining Phase 5 gap if needed: add company detail research history once a company detail page exists.
4. Build Phase 6 Strategic Visualization Layer after Phase 5 is stable.
