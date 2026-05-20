// GET single Discovery; PATCH status (active | saved | archived).

import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

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
  const body = await request.json()

  const allowed = ['active', 'saved', 'archived']
  if (!allowed.includes(body.status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data, error } = await getSupabaseAdmin()
    .from('discoveries')
    .update({ status: body.status })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ discovery: data })
}
