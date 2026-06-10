import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const Body = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(['active', 'saved', 'archived']),
})

// POST /api/discoveries/bulk-status — set the same status on N discoveries
// in one query. Powers bulk triage (e.g. "archive everything selected").
export async function POST(req: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid body' },
      { status: 400 },
    )
  }

  const { ids, status } = parsed.data
  const { data, error } = await getSupabaseAdmin()
    .from('discoveries')
    .update({ status })
    .in('id', ids)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ updated: data?.length ?? 0 })
}
