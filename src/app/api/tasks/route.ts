// GET /api/tasks — list tasks for the Dashboard's Today card.
//   ?status=open|done|snoozed   (defaults to 'open')
//   ?include_snoozed=true       (when 'open' is selected, also return snoozed
//                                tasks whose snoozed_until has expired)
//
// POST /api/tasks — create a manual task. Body:
//   { title, body?, due_date?, link_type?, link_id? }

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const TASK_LINK_TYPES = ['lead', 'opportunity', 'discovery', 'candidate', 'conversation'] as const

const CreateBody = z.object({
  title:     z.string().min(1, 'Title is required'),
  body:      z.string().optional(),
  due_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be YYYY-MM-DD').optional(),
  link_type: z.enum(TASK_LINK_TYPES).optional(),
  link_id:   z.string().optional(),
})

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const status = request.nextUrl.searchParams.get('status') ?? 'open'
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (status === 'open') {
    // 'open' bucket also includes snoozed tasks whose snooze has expired
    const today = new Date().toISOString().slice(0, 10)
    query = query.or(`status.eq.open,and(status.eq.snoozed,snoozed_until.lte.${today})`)
  } else if (status === 'done' || status === 'snoozed') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    console.error('GET /api/tasks error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ tasks: data ?? [] })
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title:     parsed.data.title,
      body:      parsed.data.body ?? null,
      due_date:  parsed.data.due_date ?? null,
      link_type: parsed.data.link_type ?? null,
      link_id:   parsed.data.link_id ?? null,
      status:    'open',
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/tasks error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ task: data }, { status: 201 })
}
