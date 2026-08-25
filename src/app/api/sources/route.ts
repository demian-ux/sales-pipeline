// GET  /api/sources — list feeds with their health (2026-08-25). Filters:
//   ?discovery_kind= (accepts upstream_signal alias), ?active=true|false,
//   ?health=ok|degraded|dead.
// POST /api/sources — create a source. The URL is test-fetched first and the
//   create is rejected if it doesn't respond/parse (pass skip_validation: true
//   to override — e.g. a feed that blocks non-Vercel IPs).
//
// Exists so the next moved RSS endpoint gets fixed from the sandbox by API,
// not by opening the UI.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { normalizeDiscoveryKind } from '@/lib/discoveries/kind'
import { probeSourceUrl } from '@/lib/discoveries/source-health'

const SOURCE_TYPES = ['rss', 'api', 'manual', 'socrata_dob', 'socrata_zap', 'ag_offering_plans'] as const
const KINDS = ['project_launch', 'opportunity_signal', 'upstream_signal', 'offering_plan', 'permit_filing'] as const

export async function GET(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const sp = request.nextUrl.searchParams
  const kind   = sp.get('discovery_kind') ?? sp.get('kind') ?? ''
  const active = sp.get('active') ?? ''
  const health = sp.get('health') ?? ''

  let query = getSupabaseAdmin().from('sources').select('*').order('sort_order', { ascending: true })
  if (kind)             query = query.eq('discovery_kind', normalizeDiscoveryKind(kind) ?? kind)
  if (active === 'true')  query = query.eq('active', true)
  if (active === 'false') query = query.eq('active', false)
  if (health)           query = query.eq('health', health)

  const { data, error } = await query
  if (error) {
    // Pre-migration schema: 'health' column missing. Retry without the filter
    // rather than 500ing the whole listing.
    if (error.code === '42703' && health) {
      return Response.json(
        { error: 'Source health columns missing — apply supabase/migrations/2026-08-25_source_health.sql before filtering by health' },
        { status: 503 },
      )
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ sources: data, total: data?.length ?? 0 })
}

const CreateBody = z.object({
  name:            z.string().min(1, 'name is required'),
  url:             z.string().url('url must be a valid URL'),
  source_type:     z.enum(SOURCE_TYPES).default('rss'),
  discovery_kind:  z.enum(KINDS).default('project_launch'),
  region:          z.string().optional(),
  sector:          z.string().optional(),
  active:          z.boolean().default(true),
  sort_order:      z.number().int().optional(),
  // Escape hatch: save without the test fetch (documented reason in the 400).
  skip_validation: z.boolean().default(false),
}).strict()

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  let json: unknown
  try { json = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = CreateBody.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return Response.json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}` }, { status: 400 })
  }
  const b = parsed.data

  let probe: { ok: boolean; items?: number; error?: string } | null = null
  if (!b.skip_validation) {
    probe = await probeSourceUrl(b.url, b.source_type)
    if (!probe.ok) {
      return Response.json(
        { error: `URL failed the test fetch (${probe.error}) — a source saved dead costs supply in silence. Fix the URL, or pass skip_validation: true if the endpoint only works from production.` },
        { status: 400 },
      )
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('sources')
    .insert({
      name: b.name,
      url: b.url,
      source_type: b.source_type,
      discovery_kind: normalizeDiscoveryKind(b.discovery_kind) ?? b.discovery_kind,
      region: b.region ?? null,
      sector: b.sector ?? null,
      active: b.active,
      ...(b.sort_order !== undefined ? { sort_order: b.sort_order } : {}),
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: `A source with url ${b.url} already exists` }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ source: data, ...(probe ? { probe } : {}) }, { status: 201 })
}
