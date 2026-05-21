// PATCH /api/campaigns/[id] — update fields (notably status: Active/Paused/Archived)
// DELETE /api/campaigns/[id] — cascade:
//   1. clear campaign_id on every Lead row that references this campaign
//   2. clear campaign_id on every Opportunity row that references it
//   3. delete the Campaign row itself
//
// Cascade order: clearing references happens before the campaign row is
// removed so that, if the delete itself fails, the leads/opps are still
// safely unassigned (no orphan dangling references) and the user can retry.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  updateCampaign,
  deleteCampaign,
  clearLeadCampaign,
  clearOpportunityCampaign,
} from '@/lib/sheets'
import type { CampaignStatus } from '@/lib/types'

const STATUS_VALUES = ['Active', 'Paused', 'Archived'] as const satisfies readonly CampaignStatus[]

const PatchBody = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  cta: z.string().min(1).optional(),
  notes: z.string().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    await updateCampaign(id, {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/campaigns/[id] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  try {
    const leadsCleared = await clearLeadCampaign(id)
    const oppsCleared = await clearOpportunityCampaign(id)
    const deleted = await deleteCampaign(id)

    if (!deleted) {
      return NextResponse.json(
        { error: 'Campaign not found', leads_unassigned: leadsCleared.updated, opportunities_unassigned: oppsCleared.updated },
        { status: 404 },
      )
    }

    return NextResponse.json({
      ok: true,
      leads_unassigned: leadsCleared.updated,
      opportunities_unassigned: oppsCleared.updated,
    })
  } catch (err) {
    console.error('DELETE /api/campaigns/[id] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Delete failed' },
      { status: 500 },
    )
  }
}
