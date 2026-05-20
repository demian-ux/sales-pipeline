# Miro Integration Plan

## Goal

Export strategic views from Oaki Relations into Miro boards for async review, client presentations, and visual planning sessions.

## What to export

### 1. Relationship Health Map
A spatial map showing all active leads grouped by health status (Strong / Warm / Cooling / Dormant / At Risk). Each card shows the lead name, company, pipeline stage, and key signal. Cards are color-coded by health group.

Miro layout: sticky notes in five vertical swim lanes.

### 2. Opportunity Board
All open opportunities arranged by urgency (High / Medium / Low). Each card shows lead, opportunity type, why-now signal, confidence score, and recommended action.

Miro layout: three-column kanban. Each card links back to the lead detail page.

### 3. Discovery Pipeline
Visual pipeline of leads moving through discovery stages (Candidates → Scheduled → In Discovery → Needs Proposal → Follow-up). Each card shows lead name, days since touch, and next action.

Miro layout: horizontal swimlane with stage columns.

### 4. Strategic Timeline
A timeline strip of the last 90 days showing interactions, research findings, opportunity creation, and AI insights. Useful for presentations showing relationship momentum.

Miro layout: horizontal timeline with colored event dots by type.

## Technical approach

### Phase 1 (manual export)
Add an "Export to Miro" button on the Strategic Map page that generates a JSON payload compatible with the Miro REST API (or downloadable CSV/JSON for manual import). No OAuth required.

### Phase 2 (direct Miro API)
Use the Miro OAuth2 flow to write directly to a user-specified board. Requires `MIRO_CLIENT_ID`, `MIRO_CLIENT_SECRET`, `MIRO_REDIRECT_URI` env vars.

API reference: https://developers.miro.com/docs/rest-api-reference

Relevant endpoints:
- `POST /v2/boards` — create a new board
- `POST /v2/boards/{board_id}/sticky_notes` — add sticky note cards
- `POST /v2/boards/{board_id}/connectors` — draw arrows between cards
- `POST /v2/boards/{board_id}/frames` — group cards into labeled frames

### Phase 3 (auto-sync)
Webhook or cron-triggered sync: when a lead's health group changes, a new opportunity is created, or a research finding is saved, the relevant Miro card is updated automatically.

## Data mapping

| App concept         | Miro element        | Color                |
|---------------------|---------------------|----------------------|
| Strong relationship | Sticky note         | #50b478 (green)      |
| Warm relationship   | Sticky note         | #e6b450 (yellow)     |
| Cooling relationship| Sticky note         | #c8a96e (accent)     |
| Dormant             | Sticky note         | #787882 (gray)       |
| At Risk             | Sticky note         | #e05c5c (red)        |
| High urgency opp    | Card with red tag   | #e05c5c              |
| Medium urgency opp  | Card with yellow tag| #e6b450              |
| Low urgency opp     | Card with gray tag  | #787882              |
| Interaction         | Small dot / event   | #c8a96e              |
| Research finding    | Document icon       | #e6b450              |
| AI Insight          | Star icon           | #9b8be0 (purple)     |

## Implementation order

1. Build export payload generator in `src/lib/miro/export.ts`
2. Add export button to `StrategicMapClient.tsx` (downloads JSON)
3. Add `POST /api/miro/sync` route that pushes to Miro API when credentials exist
4. Add Miro connection panel to Settings page (alongside Gmail)

## Environment variables needed

```
MIRO_CLIENT_ID=
MIRO_CLIENT_SECRET=
MIRO_REDIRECT_URI=http://localhost:3000/api/miro/callback
MIRO_DEFAULT_BOARD_ID=   # optional, pre-select a board
```
