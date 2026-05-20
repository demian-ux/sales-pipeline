import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { generateLinkedIn } from '@/lib/prompts/discoveries/generate-linkedin'

export const maxDuration = 120

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { recipient_name } = body as { recipient_name?: string }

  const supabase = getSupabaseAdmin()
  const { data: discovery, error } = await supabase
    .from('discoveries')
    .select('title')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  let linkedin: string
  try {
    linkedin = await generateLinkedIn(discovery.title, recipient_name ?? 'there')
  } catch (err) {
    console.error('[generate/linkedin] error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'LinkedIn generation failed' }, { status: 500 })
  }

  await supabase.from('generated_outputs').insert({
    discovery_id: id,
    output_type: 'linkedin',
    recipient_name,
    content: linkedin,
  })

  return Response.json({ linkedin })
}
