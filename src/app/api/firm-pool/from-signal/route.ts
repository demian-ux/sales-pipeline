// POST /api/firm-pool/from-signal — copy an upstream signal's example firms
// (suggested_target_firms) into the pool as pool_status='candidate' rows, tagged
// with the signal's work_categories + geo and signal_ref provenance.
//
// Per the firm-pool handoff addendum: example firms are LLM hints — unverified,
// exclusion-blind, stateless. They NEVER go straight into a batch. They enter as
// candidates (verified later by the weekly run to the same bar as any Apollo
// firm), and the exclusion sync still applies at insert (an excluded name like
// AvroKO auto-flips). Existing pool firms are left untouched (no downgrade).

import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { computeExclusions } from '@/lib/firm-pool/exclusion'
import type { WorkCategory, Geo } from '@/lib/types'

const Body = z.object({
  // A discovery id (the upstream signal whose example firms to import).
  signal_ref: z.string().min(1, 'signal_ref (discovery id) is required'),
})

interface ExampleFirm { firm?: string }

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }
  const signalId = parsed.data.signal_ref
  const supabase = getSupabaseAdmin()

  const { data: signal, error: sigErr } = await supabase
    .from('discoveries')
    .select('id, discovery_kind, suggested_target_firms, work_categories, geo')
    .eq('id', signalId)
    .maybeSingle()
  if (sigErr) return Response.json({ error: sigErr.message }, { status: 500 })
  if (!signal) return Response.json({ error: 'Signal (discovery) not found — signal_ref must be a discovery id' }, { status: 404 })

  const categories = (signal.work_categories ?? []) as WorkCategory[]
  const geo = (signal.geo ?? null) as Geo | null
  const examples = (signal.suggested_target_firms ?? []) as ExampleFirm[]
  const names = [...new Set(examples.map((f) => f.firm?.trim()).filter((n): n is string => !!n))]
  if (names.length === 0) {
    return Response.json({ added: 0, excluded: 0, skipped_existing: 0, note: 'Signal has no example firms' })
  }

  // Skip names already in the pool (never downgrade an active/parked/excluded
  // firm to a candidate).
  const { data: existing } = await supabase.from('firm_pool').select('name').in('name', names)
  const existingSet = new Set((existing ?? []).map((r) => (r.name as string).toLowerCase()))
  const fresh = names.filter((n) => !existingSet.has(n.toLowerCase()))
  if (fresh.length === 0) {
    return Response.json({ added: 0, excluded: 0, skipped_existing: names.length })
  }

  const verdicts = await computeExclusions(fresh)
  const rows = fresh.map((name) => {
    const v = verdicts.get(name) ?? { excluded: false }
    return {
      name,
      categories,
      geo,
      pool_status: v.excluded ? 'excluded' : 'candidate',
      exclusion_reason: v.excluded ? v.reason ?? 'engaged CRM account' : null,
      linked_company_id: v.linked_company_id ?? null,
      signal_ref: signalId,
      icp_notes: 'Example firm from signal — verify before batching',
    }
  })

  // Guard the race where a concurrent insert claimed a name between the check
  // and here: ignore duplicates rather than fail the whole import.
  const { data, error } = await supabase
    .from('firm_pool')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
    .select('firm_id, name, pool_status')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const added = data ?? []
  const excludedCount = added.filter((r) => r.pool_status === 'excluded').length
  return Response.json(
    {
      added: added.length,
      candidates: added.length - excludedCount,
      excluded: excludedCount,
      skipped_existing: names.length - fresh.length,
      firms: added,
    },
    { status: 201 },
  )
}
