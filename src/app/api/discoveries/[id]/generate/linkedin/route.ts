import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { generateLinkedIn } from '@/lib/prompts/discoveries/generate-linkedin'
import type { SequencePosition } from '@/lib/prompts/brand'

const SEQUENCE_POSITIONS: SequencePosition[] = ['first_touch', 'after_letter', 'after_letter_email']

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
  const { recipient_name, sequence_position } = body as {
    recipient_name?: string
    sequence_position?: SequencePosition
  }
  const position: SequencePosition = SEQUENCE_POSITIONS.includes(sequence_position as SequencePosition)
    ? (sequence_position as SequencePosition)
    : 'after_letter_email'

  const supabase = getSupabaseAdmin()
  const { data: discovery, error } = await supabase
    .from('discoveries')
    .select('title, brief_summary, city, country, sector')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  let linkedin: string
  try {
    linkedin = await generateLinkedIn(discovery, recipient_name || 'the lead contact', position)
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
