import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { generateEmail } from '@/lib/prompts/discoveries/generate-email'
import type { SequencePosition } from '@/lib/prompts/brand'
import type { DiscoveryClientType } from '@/lib/types'

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
  const { recipient_name, recipient_company, client_type, sequence_position } = body as {
    recipient_name?: string
    recipient_company?: string
    client_type?: DiscoveryClientType
    sequence_position?: SequencePosition
  }

  if (!client_type) {
    return Response.json({ error: 'client_type required' }, { status: 400 })
  }
  const position: SequencePosition = SEQUENCE_POSITIONS.includes(sequence_position as SequencePosition)
    ? (sequence_position as SequencePosition)
    : 'after_letter'

  const supabase = getSupabaseAdmin()
  const { data: discovery, error } = await supabase
    .from('discoveries')
    .select('title, brief_summary, deep_analysis, city, country, sector, investment_size, main_actors, source_url')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  let email: string
  try {
    email = await generateEmail(
      discovery,
      recipient_name || 'the lead contact',
      recipient_company || 'the recipient firm',
      client_type,
      position,
    )
  } catch (err) {
    console.error('[generate/email] error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Email generation failed' }, { status: 500 })
  }

  await supabase.from('generated_outputs').insert({
    discovery_id: id,
    output_type: 'email',
    recipient_name,
    recipient_company,
    client_type,
    content: email,
  })

  return Response.json({ email })
}
