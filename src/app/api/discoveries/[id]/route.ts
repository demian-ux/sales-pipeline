// GET single Discovery; PATCH board status (active | saved | archived), and/or
// work_status (unworked | benched | drafted | held | rejected | already_engaged),
// and/or re_arm_at (the date a held row returns to the active board).

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { WORK_STATUSES, DISCOVERY_BOARD_STATUSES } from '@/lib/vocab'
import { CONSUMING_STATUSES, type WorkStatus } from '@/lib/types'
import { rejectUnknownKeys } from '@/lib/api/strict-body'

const ALLOWED_STATUS = DISCOVERY_BOARD_STATUSES
const ALLOWED_WORK_STATUS = WORK_STATUSES
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const WRITABLE = ['status', 'work_status', 'work_reason', 're_arm_at'] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  const { data, error } = await getSupabaseAdmin()
    .from('discoveries')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 404 })
  }
  return Response.json({ discovery: data })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const unknown = rejectUnknownKeys(body, WRITABLE)
  if (unknown) return unknown

  // Build the update from whichever of status / work_status is present. Invalid
  // values return an explicit 400 — never a silent no-op, since the automation
  // relies on distinguishing "landed" from "dropped".
  const update: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      return Response.json({ error: `Invalid status: ${body.status}` }, { status: 400 })
    }
    update.status = body.status
  }

  if (body.work_status !== undefined) {
    if (!ALLOWED_WORK_STATUS.includes(body.work_status)) {
      return Response.json({ error: `Invalid work_status: ${body.work_status}` }, { status: 400 })
    }
    const ws = body.work_status as WorkStatus
    const now = new Date().toISOString()
    update.work_status = ws
    // Two different clocks, and the distinction is the whole point (2026-07-14):
    //   reviewed_at — a verdict was written. 'benched' sets it; that's what makes
    //     a benched row "reviewed and kept" rather than untouched backlog.
    //   worked_at   — a run CONSUMED the row (drafted/held/rejected/already_engaged).
    // 'unworked' means never reviewed, so it clears both (an explicit re-arm).
    update.reviewed_at = ws === 'unworked' ? null : now
    update.worked_at = CONSUMING_STATUSES.includes(ws) ? now : null
    if (body.work_reason !== undefined) {
      update.work_reason = body.work_reason === null ? null : String(body.work_reason)
    }
  } else if (body.work_reason !== undefined) {
    // Allow updating just the reason without changing the state.
    update.work_reason = body.work_reason === null ? null : String(body.work_reason)
  }

  // re_arm_at: the date a held row comes back to the active board. null clears it.
  if (body.re_arm_at !== undefined) {
    if (body.re_arm_at === null) {
      update.re_arm_at = null
    } else if (typeof body.re_arm_at === 'string' && ISO_DATE.test(body.re_arm_at)) {
      update.re_arm_at = body.re_arm_at
    } else {
      return Response.json(
        { error: `Invalid re_arm_at: ${body.re_arm_at} — expected YYYY-MM-DD or null` },
        { status: 400 },
      )
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json(
      { error: 'Nothing to update — provide status, work_status, work_reason and/or re_arm_at' },
      { status: 400 },
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('discoveries')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ discovery: data })
}
