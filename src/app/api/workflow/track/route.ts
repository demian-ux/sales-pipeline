import { NextRequest, NextResponse } from 'next/server'
import { sessionCache } from '@/lib/sheets/cache'
import type { WorkflowAction, WorkflowActionType } from '@/lib/types'

// POST /api/workflow/track
// Body: { type, lead_id?, insight_id?, opportunity_id?, channel?, note? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const type: WorkflowActionType = body.type
    if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

    const action: WorkflowAction = {
      action_id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      lead_id: body.lead_id,
      insight_id: body.insight_id,
      opportunity_id: body.opportunity_id,
      channel: body.channel,
      note: body.note,
      recorded_at: new Date().toISOString(),
    }

    sessionCache.workflowActions.unshift(action)

    return NextResponse.json({ action })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

// GET /api/workflow/track — return recent actions
export async function GET() {
  return NextResponse.json({ actions: sessionCache.workflowActions.slice(0, 200) })
}
