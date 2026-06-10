import { NextRequest, NextResponse } from 'next/server'
import {
  saveWorkflowAction,
  getRecentWorkflowActions,
  newWorkflowActionId,
} from '@/lib/workflow/store'
import type { WorkflowAction, WorkflowActionType } from '@/lib/types'

// POST /api/workflow/track
// Body: { type, lead_id?, insight_id?, opportunity_id?, channel?, note? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type: WorkflowActionType = body.type
    if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

    const action: WorkflowAction = {
      action_id: newWorkflowActionId(),
      type,
      lead_id: body.lead_id,
      insight_id: body.insight_id,
      opportunity_id: body.opportunity_id,
      channel: body.channel,
      note: body.note,
      recorded_at: new Date().toISOString(),
    }

    await saveWorkflowAction(action)

    return NextResponse.json({ action })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

// GET /api/workflow/track — return recent actions
export async function GET() {
  const actions = await getRecentWorkflowActions(200)
  return NextResponse.json({ actions })
}
