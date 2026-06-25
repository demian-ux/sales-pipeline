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
// Same auth as ingest (lib/auth.ts: isIngestAuthorized) — Bearer ${INGEST_SECRET}
// or a valid session cookie. Start with dry_run:true to preview.

import { type NextRequest } from 'next/server'
import { isSupabaseAdminConfigured } from '@/lib/supabase'
import { isIngestAuthorized } from '@/lib/auth'
import { backfillGate, backfillPromotedLinks } from '@/lib/discoveries/backfill'

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
    return Response.json({ error: `Unknown mode "${mode}" — use "gate" or "links"` }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[backfill] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
