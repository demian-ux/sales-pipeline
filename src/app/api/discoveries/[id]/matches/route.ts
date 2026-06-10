import { NextResponse } from 'next/server'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { extractDiscoveryEntities, matchEntitiesToRoster } from '@/lib/discoveries/roster-match'

// GET /api/discoveries/[id]/matches — fuzzy-match the discovery's named
// entities against the Companies roster: "this discovery mentions {company};
// you have N contacts there".
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  try {
    const { id } = await params
    const { data: discovery, error } = await getSupabaseAdmin()
      .from('discoveries')
      .select('id, title, main_actors, developer, architect, government_body')
      .eq('id', id)
      .single()
    if (error || !discovery) return NextResponse.json({ error: 'Discovery not found' }, { status: 404 })

    const entities = extractDiscoveryEntities(discovery)
    const matches = await matchEntitiesToRoster(entities)
    return NextResponse.json({ matches, entities })
  } catch (err) {
    console.error('GET /api/discoveries/[id]/matches error:', err)
    return NextResponse.json({ error: 'Failed to compute matches' }, { status: 500 })
  }
}
