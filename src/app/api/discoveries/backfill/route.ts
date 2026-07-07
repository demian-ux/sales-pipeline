// One-off backfill endpoint for the 2026-06-25 discovery overhaul.
//
//   POST /api/discoveries/backfill { "mode": "gate", "limit": 12, "dry_run": true }
//     Re-analyzes legacy rows (icp_fit_score IS NULL): recomputes scores +
//     signal_type + ICP fit, auto-archives off-type events. Processes `limit`
//     rows per call (Claude-bound) — call repeatedly until remaining is 0.
//
//   POST /api/discoveries/backfill { "mode": "links", "dry_run": true }
//     Writes promoted_to_opportunity_id back onto discoveries from the Sheets
//     Opportunities' discovered_from_id. Cheap; one call.
//
//   POST /api/discoveries/backfill { "mode": "engaged", "limit": 500, "dry_run": true }
//     Cross-refs the whole active board (developer / verified_principal /
//     suggested firms / main actors) against the combined companies+leads
//     roster and flags matches already_engaged (+ work_status). Clears the
//     "phantom" already-in-CRM rows off the new-signal board. Cheap; one call.
//
//   POST /api/discoveries/backfill { "mode": "excavate", "limit": 5, "dry_run": true }
//     Resolves developer-of-record for active, above-weak, never-attempted rows
//     and writes verified_principal + excavation_status (cross-refs a resolved
//     principal to already_engaged). Claude+Tavily-bound — `limit` rows/call;
//     call until remaining is 0. dry_run reports the candidate count only.
//
//   POST /api/discoveries/backfill { "mode": "ageout", "max_age_days": 120, "dry_run": true }
//     Rejects stale project_launch signals (older than max_age_days, no verified
//     principal, still unworked). Reversible — flips work_status, deletes nothing.
//
// Same auth as ingest (lib/auth.ts: isIngestAuthorized) — Bearer ${INGEST_SECRET}
// or a valid session cookie. Start with dry_run:true to preview.

import { type NextRequest } from 'next/server'
import { isSupabaseAdminConfigured } from '@/lib/supabase'
import { isIngestAuthorized } from '@/lib/auth'
import {
  backfillGate,
  backfillPromotedLinks,
  backfillEngaged,
  backfillExcavate,
  backfillAgeout,
} from '@/lib/discoveries/backfill'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const mode: string = body.mode ?? 'gate'
  const dryRun: boolean = body.dry_run === true
  const limit = Math.min(Math.max(parseInt(String(body.limit ?? 12), 10) || 12, 1), 40)

  try {
    if (mode === 'links') {
      return Response.json(await backfillPromotedLinks(dryRun))
    }
    if (mode === 'gate') {
      return Response.json(await backfillGate(limit, dryRun))
    }
    if (mode === 'engaged') {
      // Cross-ref the whole active board against companies+leads. Cheap (no
      // Claude), so process a large slice per call — its own higher bound
      // (the shared `limit` above is capped at 40 for the Claude-bound modes).
      const engagedLimit = Math.min(Math.max(parseInt(String(body.limit ?? 500), 10) || 500, 1), 1000)
      return Response.json(await backfillEngaged(engagedLimit, dryRun))
    }
    if (mode === 'excavate') {
      // Claude+Tavily-bound; small default slice. Pass limit to raise it.
      return Response.json(await backfillExcavate(Math.min(Math.max(limit, 1), 20), dryRun))
    }
    if (mode === 'ageout') {
      const maxAgeDays = Math.min(Math.max(parseInt(String(body.max_age_days ?? 120), 10) || 120, 30), 730)
      return Response.json(await backfillAgeout(maxAgeDays, dryRun))
    }
    return Response.json(
      { error: `Unknown mode "${mode}" — use "gate" | "links" | "engaged" | "excavate" | "ageout"` },
      { status: 400 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[backfill] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
