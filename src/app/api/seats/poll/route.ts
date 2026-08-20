// Waterfall polling (15-min cron). Resolves pending async email waterfalls:
// verified ⇒ seat_pending (review queue); completed-without-email ⇒
// seat_failed:no_email (benched — an address is never guessed).

import { type NextRequest } from 'next/server'
import { isSupabaseAdminConfigured } from '@/lib/supabase'
import { isIngestAuthorized } from '@/lib/auth'
import { pollWaterfalls } from '@/lib/seats/worker'

export const maxDuration = 120

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!(await isIngestAuthorized(request))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await pollWaterfalls()
    if (result.resolved || result.failed) console.log('[seats] waterfall poll:', JSON.stringify(result))
    return Response.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[seats] waterfall poll failed:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
