// PATCH /api/tasks/[id] — update a task. Status transitions trigger
//   side-effects: done → set completed_at; snoozed → require snoozed_until.
// DELETE /api/tasks/[id] — permanent.

import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const TASK_STATUSES = ['open', 'done', 'snoozed'] as const
const TASK_LINK_TYPES = ['lead', 'opportunity', 'discovery', 'candidate', 'conversation'] as const

const PatchBody = z.object({
  title:         z.string().min(1).optional(),
  body:          z.string().nullable().optional(),
  due_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status:        z.enum(TASK_STATUSES).optional(),
  snoozed_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  link_type:     z.enum(TASK_LINK_TYPES).nullable().optional(),
  link_id:       z.string().nullable().optional(),
}).strict()   // unknown key → 400, never a 200 that quietly drops it

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = PatchBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  if (parsed.data.status === 'snoozed' && !parsed.data.snoozed_until) {
    return Response.json({ error: 'snoozed status requires snoozed_until' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  }
  if (parsed.data.status === 'done') {
    updates.completed_at = new Date().toISOString()
  } else if (parsed.data.status === 'open') {
    updates.completed_at = null
    updates.snoozed_until = null
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return Response.json({ error: 'Task not found' }, { status: 404 })
    }
    console.error('PATCH /api/tasks/[id] error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ task: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const { id } = await params
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ ok: true })
}
