import { type NextRequest } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { generateLetter } from '@/lib/prompts/discoveries/generate-letter'
import type { DiscoveryClientType } from '@/lib/types'

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
  const { recipient_name, recipient_company, client_type } = body as {
    recipient_name?: string
    recipient_company?: string
    client_type?: DiscoveryClientType
  }

  if (!client_type) {
    return Response.json({ error: 'client_type required' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: discovery, error } = await supabase
    .from('discoveries')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !discovery) {
    return Response.json({ error: 'Discovery not found' }, { status: 404 })
  }

  let letter: string
  try {
    letter = await generateLetter(
      discovery,
      recipient_name || 'the lead contact',
      recipient_company || 'the recipient firm',
      client_type,
    )
  } catch (err) {
    console.error('[generate/letter] error:', err instanceof Error ? err.message : err)
    return Response.json({ error: 'Letter generation failed' }, { status: 500 })
  }

  await supabase.from('generated_outputs').insert({
    discovery_id: id,
    output_type: 'letter',
    recipient_name,
    recipient_company,
    client_type,
    content: letter,
  })

  return Response.json({ letter })
}
