// GET   /api/sources/[id] — one source with its health.
// PATCH /api/sources/[id] — edit url / name / active / discovery_kind /
//   sort_order / region / sector. A changed URL is test-fetched first and the
//   edit rejected if it doesn't respond/parse (skip_validation: true overrides).
//   A successful URL change also resets the health counters — the new endpoint
//   deserves a clean slate.
// No DELETE — deactivate with { active: false }; source rows carry history.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { normalizeDiscoveryKind } from '@/lib/discoveries/kind'
import { probeSourceUrl } from '@/lib/discoveries/source-health'

const SOURCE_TYPES = ['rss', 'api', 'manual', 'socrata_dob', 'socrata_zap', 'ag_offering_plans'] as const
const KINDS = ['project_launch', 'opportunity_signal', 'upstream_signal', 'offering_plan', 'permit_filing'] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  const { data, error } = await getSupabaseAdmin().from('sources').select('*').eq('id', id).single()
  if (error) return Response.json({ error: `No source ${id}` }, { status: 404 })
  return Response.json({ source: data })
}

const PatchBody = z.object({
  name:            z.string().min(1).optional(),
  url:             z.string().url('url must be a valid URL').optional(),
  source_type:     z.enum(SOURCE_TYPES).optional(),
  discovery_kind:  z.enum(KINDS).optional(),
  region:          z.string().nullable().optional(),
  sector:          z.string().nullable().optional(),
  active:          z.boolean().optional(),
  sort_order:      z.number().int().optional(),
  skip_validation: z.boolean().default(false),
}).strict()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { id } = await params
  let json: unknown
  try { json = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = PatchBody.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return Response.json({ error: `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}` }, { status: 400 })
  }
  const b = parsed.data

  const supabase = getSupabaseAdmin()
  const { data: current, error: readErr } = await supabase.from('sources').select('*').eq('id', id).single()
  if (readErr || !current) return Response.json({ error: `No source ${id}` }, { status: 404 })

  const update: Record<string, unknown> = {}
  if (b.name !== undefined)           update.name = b.name
  if (b.source_type !== undefined)    update.source_type = b.source_type
  if (b.discovery_kind !== undefined) update.discovery_kind = normalizeDiscoveryKind(b.discovery_kind) ?? b.discovery_kind
  if (b.region !== undefined)         update.region = b.region
  if (b.sector !== undefined)         update.sector = b.sector
  if (b.active !== undefined)         update.active = b.active
  if (b.sort_order !== undefined)     update.sort_order = b.sort_order

  let probe: { ok: boolean; items?: number; error?: string } | null = null
  if (b.url !== undefined && b.url !== current.url) {
    const effectiveType = (b.source_type ?? current.source_type ?? 'rss') as string
    if (!b.skip_validation) {
      probe = await probeSourceUrl(b.url, effectiveType)
      if (!probe.ok) {
        return Response.json(
          { error: `New URL failed the test fetch (${probe.error}) — fix the URL, or pass skip_validation: true if the endpoint only works from production.` },
          { status: 400 },
        )
      }
    }
    update.url = b.url
    // Clean slate for the new endpoint (columns may not exist pre-migration —
    // retried without them below).
    update.consecutive_failures = 0
    update.health = 'ok'
    update.last_error = null
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  let { data, error } = await supabase.from('sources').update(update).eq('id', id).select().single()
  if (error?.code === '42703') {
    // Pre-migration schema: drop the health-reset fields and retry.
    delete update.consecutive_failures
    delete update.health
    delete update.last_error
    ;({ data, error } = await supabase.from('sources').update(update).eq('id', id).select().single())
  }
  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: `A source with url ${b.url} already exists` }, { status: 409 })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ source: data, ...(probe ? { probe } : {}) })
}
