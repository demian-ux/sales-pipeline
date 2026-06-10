// Supabase-backed persistence for workflow actions (sent/copied/dismissed
// tracking). Replaces sessionCache storage, which was wiped on every
// restart/redeploy — previously-sent drafts reappeared as unsent.
// Falls back to sessionCache when Supabase isn't configured or until the
// workflow_actions migration has run.

import { randomUUID } from 'crypto'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { sessionCache } from '@/lib/sheets/cache'
import type { WorkflowAction, WorkflowActionType } from '@/lib/types'

export function newWorkflowActionId(): string {
  return `wa_${randomUUID()}`
}

type ActionRow = {
  action_id: string
  type: string
  lead_id: string | null
  insight_id: string | null
  opportunity_id: string | null
  channel: string | null
  note: string | null
  recorded_at: string
}

function rowToAction(row: ActionRow): WorkflowAction {
  return {
    action_id: row.action_id,
    type: row.type as WorkflowActionType,
    lead_id: row.lead_id ?? undefined,
    insight_id: row.insight_id ?? undefined,
    opportunity_id: row.opportunity_id ?? undefined,
    channel: (row.channel as WorkflowAction['channel']) ?? undefined,
    note: row.note ?? undefined,
    recorded_at: row.recorded_at,
  }
}

export async function saveWorkflowAction(action: WorkflowAction): Promise<WorkflowAction> {
  if (isSupabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('workflow_actions').insert({
      action_id: action.action_id,
      type: action.type,
      lead_id: action.lead_id ?? null,
      insight_id: action.insight_id ?? null,
      opportunity_id: action.opportunity_id ?? null,
      channel: action.channel ?? null,
      note: action.note ?? null,
      recorded_at: action.recorded_at,
    })
    if (!error) return action
    console.error('saveWorkflowAction: Supabase write failed, using session memory:', error.message)
  }
  sessionCache.workflowActions.unshift(action)
  return action
}

export async function getRecentWorkflowActions(limit = 200): Promise<WorkflowAction[]> {
  if (isSupabaseAdminConfigured()) {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('workflow_actions')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit)
    if (!error) return ((data ?? []) as ActionRow[]).map(rowToAction)
    console.error('getRecentWorkflowActions: Supabase read failed, using session memory:', error.message)
  }
  return sessionCache.workflowActions.slice(0, limit)
}
