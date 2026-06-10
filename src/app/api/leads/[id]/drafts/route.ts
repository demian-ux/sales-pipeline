import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeadById } from '@/lib/sheets'
import { DRAFT_CHANNELS, DRAFT_STATUSES } from '@/lib/vocab'

// GET /api/leads/[id]/drafts — all stored drafts for one lead.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  try {
    const { id } = await params
    const { data, error } = await getSupabaseAdmin()
      .from('lead_drafts')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ drafts: data ?? [] })
  } catch (err) {
    console.error('GET /api/leads/[id]/drafts error:', err)
    return NextResponse.json({ error: 'Failed to fetch drafts' }, { status: 500 })
  }
}

const PostBody = z.object({
  channel: z.enum(DRAFT_CHANNELS),
  subject: z.string().optional(),
  body: z.string().min(1, 'body is required'),
  status: z.enum(DRAFT_STATUSES).optional(),
  created_by: z.string().optional(),
}).strict()

// POST /api/leads/[id]/drafts — store a draft on the lead.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = PostBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }

    const { data, error } = await getSupabaseAdmin()
      .from('lead_drafts')
      .insert({
        lead_id: id,
        company_id: lead.company_id,
        channel: parsed.data.channel,
        subject: parsed.data.subject ?? null,
        body: parsed.data.body,
        status: parsed.data.status ?? 'draft',
        created_by: parsed.data.created_by ?? null,
      })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ draft: data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads/[id]/drafts error:', err)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}
