// GET /api/dashboard/layout — returns the user's dashboard card layout.
//   When no row exists yet, returns the canonical default (all 6 cards
//   visible, in default order). The Today card is always present.
// PUT /api/dashboard/layout — body: { cards: [{ id, visible }, ...] }.
//   Upserts the single row keyed 'dashboard_layout' in app_secrets.
//
// Note: the Today card is permanent — even if the client sends a layout
// that omits it or marks it hidden, the server normalizes the response to
// keep Today present and visible.

import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { DashboardCardId, DashboardLayout } from '@/lib/types'

const LAYOUT_KEY = 'dashboard_layout'

const CARD_IDS: DashboardCardId[] = [
  'today',
  'send_queue',
  'opportunities',
  'attention',
  'conversations',
  'discoveries',
  'candidates',
]

const DEFAULT_LAYOUT: DashboardLayout = {
  cards: CARD_IDS.map((id) => ({ id, visible: true })),
}

const Body = z.object({
  cards: z
    .array(
      z.object({
        id: z.enum(CARD_IDS as [DashboardCardId, ...DashboardCardId[]]),
        visible: z.boolean(),
      }),
    )
    .min(1),
})

// Ensures the Today card stays visible and present in the array regardless
// of what the client sent, and that every known card id appears exactly once
// (hidden cards stay in the array with visible:false so they can be re-added).
function normalizeLayout(input: DashboardLayout): DashboardLayout {
  const seen = new Map<DashboardCardId, boolean>()
  for (const entry of input.cards) {
    if (!seen.has(entry.id)) {
      seen.set(entry.id, entry.id === 'today' ? true : entry.visible)
    }
  }
  if (!seen.has('today')) {
    seen.set('today', true)
  }
  // Preserve client-supplied order, then append any known cards the client omitted.
  const ordered: DashboardCardId[] = []
  for (const entry of input.cards) {
    if (!ordered.includes(entry.id)) ordered.push(entry.id)
  }
  for (const id of CARD_IDS) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return {
    // Cards absent from the stored layout are NEW features (the user never
    // explicitly hid them) — surface them visible by default.
    cards: ordered.map((id) => ({ id, visible: seen.get(id) ?? true })),
  }
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ layout: DEFAULT_LAYOUT })
  }
  const { data, error } = await getSupabaseAdmin()
    .from('app_secrets')
    .select('value')
    .eq('key', LAYOUT_KEY)
    .maybeSingle()
  if (error) {
    console.warn('[dashboard/layout] read error:', error.message)
    return Response.json({ layout: DEFAULT_LAYOUT })
  }
  const stored = (data?.value as DashboardLayout | null) ?? null
  return Response.json({ layout: stored ? normalizeLayout(stored) : DEFAULT_LAYOUT })
}

export async function PUT(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const normalized = normalizeLayout(parsed.data)
  const { error } = await getSupabaseAdmin()
    .from('app_secrets')
    .upsert(
      { key: LAYOUT_KEY, value: normalized, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) {
    console.error('[dashboard/layout] write error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
  return Response.json({ layout: normalized })
}
