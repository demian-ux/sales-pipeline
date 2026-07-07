// GET single Discovery; PATCH board status (active | saved | archived) and/or
// work_status (unworked | drafted | held | rejected | already_engaged).

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { WORK_STATUSES, DISCOVERY_BOARD_STATUSES } from '@/lib/vocab'

const ALLOWED_STATUS = DISCOVERY_BOARD_STATUSES
const ALLOWED_WORK_STATUS = WORK_STATUSES

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
    update.work_status = body.work_status
    // Stamp when a run acted on the row; 'unworked' clears the stamp (re-armed).
    update.worked_at = body.work_status === 'unworked' ? null : new Date().toISOString()
    if (body.work_reason !== undefined) {
      update.work_reason = body.work_reason === null ? null : String(body.work_reason)
    }
  } else if (body.work_reason !== undefined) {
    // Allow updating just the reason without changing the state.
    update.work_reason = body.work_reason === null ? null : String(body.work_reason)
  }

  if (Object.keys(update).length === 0) {
    return Response.json(
      { error: 'Nothing to update — provide status and/or work_status' },
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
