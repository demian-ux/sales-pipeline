import { NextResponse } from 'next/server'
import { z } from 'zod'
import { bulkUpdateLeads, bulkDeleteLeads, getLeads } from '@/lib/sheets'
import type { Lead } from '@/lib/types'
import { PIPELINE_STAGES, LEAD_STATUSES, TEMPERATURES } from '@/lib/vocab'

const UpdatableFields = z.object({
  pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
  relationship_temperature: z.enum(TEMPERATURES).optional(),
  lead_status: z.enum(LEAD_STATUSES).optional(),
  campaign_id: z.string().optional(),
  source: z.string().optional(),
  owner: z.string().optional(),
  next_action: z.string().optional(),
  next_followup_date: z.string().optional(),
  last_touch_date: z.string().optional(),
  notes: z.string().optional(),
  held_reason: z.string().optional(),
  held_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'held_until must be YYYY-MM-DD').optional(),
}).strict()
  // Same guard as the single-lead routes: a bulk move to Held without a reason
  // used to slip past — no silent parks (2026-07-28).
  .refine(
    (f) => f.pipeline_stage !== 'Held' || !!f.held_reason?.trim(),
    { message: 'held_reason is required when setting stage Held' },
  )

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1, 'ids is required').max(500, 'Max 500 ids per call'),
  action: z.enum(['update', 'delete']),
  fields: UpdatableFields.optional(),
})

// POST /api/leads/bulk — one call instead of N sequential PATCH/DELETEs.
// { ids: [], action: 'update' | 'delete', fields?: {...} } → per-id results.
export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = Body.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const { ids, action, fields } = parsed.data

    if (action === 'update') {
      const updates = Object.fromEntries(
        Object.entries(fields ?? {}).filter(([, v]) => v !== undefined)
      ) as Partial<Lead>
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'fields is required for action: update' }, { status: 400 })
      }
      const result = await bulkUpdateLeads(ids, updates)
      return NextResponse.json({
        action,
        results: ids.map((id) => ({ id, ok: result.updated.includes(id), error: result.updated.includes(id) ? undefined : 'not found' })),
        updated: result.updated.length,
        not_found: result.not_found,
      })
    }

    // delete
    const existing = new Set((await getLeads()).map((l) => l.lead_id))
    const { deleted } = await bulkDeleteLeads(ids)
    return NextResponse.json({
      action,
      results: ids.map((id) => ({ id, ok: existing.has(id), error: existing.has(id) ? undefined : 'not found' })),
      deleted,
    })
  } catch (err) {
    console.error('POST /api/leads/bulk error:', err)
    return NextResponse.json({ error: 'Bulk operation failed' }, { status: 500 })
  }
}
