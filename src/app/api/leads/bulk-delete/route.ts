// POST /api/leads/bulk-delete
// Body: { lead_ids: string[] }
//
// Permanent. Uses one batched Sheets deleteDimension request — rows are
// removed from the underlying spreadsheet, not soft-archived.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { bulkDeleteLeads } from '@/lib/sheets'

const Body = z.object({
  lead_ids: z.array(z.string().min(1)).min(1, 'At least one lead_id is required'),
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
    const result = await bulkDeleteLeads(parsed.data.lead_ids)
    return NextResponse.json(result)
  } catch (err) {
    console.error('POST /api/leads/bulk-delete error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk delete failed' },
      { status: 500 },
    )
  }
}
