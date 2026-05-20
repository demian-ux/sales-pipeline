# Audit — UI & design system

## TL;DR

- **Relations is the only one with a real design system.** Dark + gold (`#c8a96e`), 40+ CSS variables, a working sidebar shell, consistent border/text token system. Keep as canonical.
- **Terminal has a competent but generic dark theme** (zinc-950 + blue selection). Compatible with Relations stylistically — needs to be reskinned to gold-on-dark.
- **Fase B web is the outlier.** Vanilla CSS, light theme, 860px centered container, no design tokens. Cannot be merged visually as-is. The Vite SPA should be discarded and the UX rebuilt inside Relations' shell.
- **No shadcn/ui anywhere.** Each project rolled its own primitives.

---

## UI area comparison

| UI area | Relations | Opportunity Terminal | Fase B web | Reusable in merge? | Conflict | Recommendation |
|---|---|---|---|---|---|---|
| **Tailwind** | v4 | v4 | none (vanilla CSS) | Yes (Relations + Terminal) | none | Adopt Tailwind v4 in merged app — same as both Next.js projects |
| **PostCSS** | `@tailwindcss/postcss` v4 | `@tailwindcss/postcss` v4 | n/a | yes | none | — |
| **Design tokens** | 40+ CSS custom properties in `src/app/globals.css` (`--bg`, `--surface`, `--accent`, etc.) | 4 CSS variables (`--background`, `--foreground`, `--font-sans`, `--font-mono`) | none | Relations' set is canonical | Terminal's `--background #09090b` ≠ Relations' `--bg #080808` (close but not identical) | Adopt Relations tokens; remap Terminal's two color tokens to point at Relations' equivalents |
| **Accent color** | `--accent #c8a96e` (Oaki gold) | blue selection only (`rgba(59, 130, 246, 0.15)`) | none | yes | Terminal uses blue for selection; Fase B uses no accent | Standardize on Oaki gold for selection + focus + primary actions |
| **Dark mode** | Dark-only (no light mode) | Dark-only (no light mode) | Light-only | yes (two of three) | Fase B is light | Merged app is dark-only. No mode switcher needed (matches Relations' "calm, compact" principle) |
| **Font** | Default (not examined deeply; `globals.css` doesn't import a custom font) | Geist Sans + Geist Mono (Next.js defaults via `--font-sans`/`--font-mono`) | system sans | Adopt Geist | minor | Geist is the cleanest cross-app default |
| **App shell** | ✅ Sidebar (`src/components/layout/Sidebar.tsx`) + main content (`src/app/layout.tsx`, flex layout) | none (header on detail page only) | none (single-page form) | Relations is canonical | Terminal will inherit Relations' shell; new sidebar entries for Discoveries and Prospecting | Use Relations' Sidebar; add nav items for new modules |
| **Card component** | custom in `src/components/today/*`, `src/components/leads/*` (multiple variants — Opportunity card, Lead card, Insight card, etc.) | `OpportunityCard.tsx` (single, list-item shape) | `FirmCard.tsx`, `ArticleSummaryCard.tsx` | partial | each project has its own card style | Build a generic `<Card>` primitive in `components/ui/`; specialize per entity |
| **Badge** | `components/ui/Badge.tsx` (variant prop) | `ScoreBadge.tsx` (numeric score, color-coded tier) | inline span styles with `.score-badge.high/.good/.mid/.low` classes | yes | Three badge implementations, three styles | Keep Relations' `Badge`. Add a `ScoreBadge` variant that wraps it with the score tier colorization. |
| **Buttons** | informal — inline `<button>` with utility classes; `CopyButton.tsx` is the only primitive | inline buttons | inline buttons | Relations' `CopyButton` is reusable | no formal `Button` primitive anywhere | Add a `Button` primitive to `components/ui/` during merge (low cost, high consistency benefit) |
| **Tables** | inline `<table>` markup in pages | none | none | n/a | n/a | No need for a Table primitive yet |
| **Forms** | custom forms (`LeadEditForm`, `AddOpportunityForm`, `LeadActions`, `ResearchIngestForm`, `SettingsClient`) — each one inline-styled | filter dropdowns in `FilterPanel.tsx`; letter form in `LetterGenerator.tsx` | `UrlForm.tsx` (single text input + submit) | most reusable bits live in Relations | inconsistent input styling across projects | Add `<Input>`, `<Select>`, `<Textarea>` primitives in `components/ui/` |
| **Navigation** | sidebar with route links | header back-link only (`/opportunity/[id]` page) | none | Relations canonical | — | Use Relations' sidebar |
| **Layouts** | `src/app/layout.tsx` — root layout with flex sidebar + main, inline styles | `src/app/layout.tsx` — Geist font setup, no shell | Vite `App.tsx` — centered 860px container | Relations canonical | — | Discard Terminal/Fase B layouts on merge |
| **Modals** | none found | none | none | n/a | n/a | None needed yet |
| **Icons** | none — no icon component or library found | `components/icons.tsx` — custom SVG library (refresh, loader, trending-up, calendar, arrow-left, external-link) | none | Terminal's icons are reusable | none | **Adopt Terminal's `icons.tsx`** — it's the only icon library in the bundle. Move to `components/ui/icons.tsx`. |
| **Charts** | none | none | none | n/a | n/a | If Strategic Map ever ships, that's when charts come in — out of scope for merge |
| **Loading states** | inline (varies per page) | inline | `LoadingState.tsx` (skeleton/spinner) | yes | each one different | Add a `<Loading>` primitive borrowing from Fase B's approach |
| **Error display** | inline / console only | inline | `ErrorBanner.tsx` (dedicated banner component) | yes | inconsistent | Adopt Fase B's `ErrorBanner` pattern as a `<Banner>` primitive in `components/ui/` |

---

## Design system: Relations tokens (canonical)

Located in `src/app/globals.css`:

**Backgrounds**: `--bg` `#080808`, `--surface` `#101010`, `--surface-2`, `--surface-3`

**Borders**: `--border`, `--border-subtle`, `--border-hover`, `--border-focus` (gold)

**Text**: `--text`, `--text-muted`, `--text-faint`

**Accent (Oaki gold)**: `--accent` `#c8a96e`, `--accent-dim`, `--accent-mid`

**Semantic**: `--green` `#4caf86`, `--red` `#e05c5c`, `--yellow` `#d4a843`, `--blue` `#5c8ed4` (+ each has a `-dim` variant)

**Radius**: `--r-xs`, `--r-sm`, `--r-md`, `--r-lg`, `--r-xl` (4–16px)

**Shadows**: `--shadow-sm`, `--shadow-md`

**Transitions**: `--t-fast`, `--t-base`, `--t-slow` (0.10s–0.25s)

**Coverage assessment:** comprehensive — covers everything the merged app needs. No tokens missing.

---

## Component inventory by project

### Relations (`src/components/`, 11 sub-folders)
- **conversations/** — AnalyzeThreadButton, SyncButton
- **discovery/** — DiscoveryClient
- **draft-queue/** — DraftQueueClient
- **import/** — ApolloImportClient
- **insights/** — InsightsClient
- **layout/** — Sidebar
- **leads/** — LeadActions, LeadEditForm, AddOpportunityForm, LinkedInPanel
- **research/** — ResearchIngestForm
- **settings/** — SettingsClient
- **strategic-map/** — StrategicMapClient (placeholder)
- **today/** — TodayClient + card components
- **ui/** — Badge, CopyButton (and ~4 others not enumerated)

### Opportunity Terminal (`src/components/`)
- FilterPanel
- LetterGenerator
- OpportunityCard
- ScoreBadge
- icons (custom SVG library)

### Fase B web (`apps/web/src/components/`)
- UrlForm
- ArticleSummaryCard
- FirmCard
- FirmList
- ExportBar
- CostEstimateCard
- LoadingState
- ErrorBanner

---

## Merge cost & approach

**For Terminal:**
- Replace `globals.css` two-token system with Relations' full token import
- Re-skin `OpportunityCard`/`ScoreBadge`/`FilterPanel`/`LetterGenerator` to use Relations tokens
- Wrap pages in Relations' app shell
- Adopt Terminal's `icons.tsx` upward into the shared `components/ui/`
- **Estimated effort:** ~1 day; mostly CSS

**For Fase B web:**
- **Do not port the Vite app.** Rebuild the prospecting UX inside Relations as a new page (`/prospecting` per `audit-routes.md`)
- Reuse the *components' shape* (URL form, article summary, firm list with score badges, export bar) but rebuilt with Relations' tokens + Tailwind v4
- The Fase B api server remains the backend (or its logic ports into Relations API routes — see `audit-recommendation.md`)
- **Estimated effort:** ~1–2 days for UI rebuild; logic moves separately

---

## Consistency wins to capture during merge

1. **One `<Button>` primitive** — none of the three projects has one. Add it during merge to lock in consistent hover/focus/disabled styling.
2. **One `<Card>` primitive** — Relations has multiple card variants per entity; consolidate the shell into one primitive with a `children`-driven content area.
3. **One icon source** — Terminal's `icons.tsx`. Avoid mixing icon libraries.
4. **One loading state shape + one error banner shape** — Fase B's components are the right starting point.
5. **One layout file** — `src/app/layout.tsx` from Relations. Don't carry over Terminal's or Fase B's.

---

## What to NOT preserve from each project (UI-wise)

| From | What to drop |
|---|---|
| Terminal | The `--background`/`--foreground` two-token system — too thin; would block design evolution |
| Terminal | Blue selection accent — replace with Oaki gold |
| Fase B web | All of `apps/web/` — the Vite app entirely. Components inform the rebuild but aren't ported. |
| Fase B web | Light theme, 860px container, system font — incompatible |
| Relations | Inline-styled layout in `src/app/layout.tsx` — refactor to Tailwind utilities during merge for consistency with the rest of the codebase |
