// POST /api/leads/bulk-assign-campaign
// Body: { lead_ids: string[], campaign_id: string | null }
//
// Sets the same campaign_id on N leads in one batched Sheets write.
// `null` (or empty string) unassigns. Uses bulkAssignCampaign which only
// touches the campaign_id + updated_at cells — much faster than N
// individual PATCH /api/leads/[id] calls (each of those re-reads the whole
// Leads tab).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { bulkAssignCampaign } from '@/lib/sheets'

const Body = z.object({
  lead_ids: z.array(z.string().min(1)).min(1, 'At least one lead_id is required'),
  campaign_id: z.string().nullable(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  try {
    const result = await bulkAssignCampaign(parsed.data.lead_ids, parsed.data.campaign_id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/leads/bulk-assign-campaign error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk assign failed' },
      { status: 500 },
    )
  }
}
