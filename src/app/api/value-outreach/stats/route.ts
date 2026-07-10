// GET /api/value-outreach/stats — value-lane metrics (feeds the monthly audit,
// Motor comercial). Pool size by category/geo/status, % touched, reply rate per
// signal and overall, and the touch→reply→call→brief progression. Baseline to
// beat: ~6.7% (news-cold week-1).

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { FirmPool, ValueTouch } from '@/lib/types'

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const supabase = getSupabaseAdmin()
  const [{ data: firmData, error: fErr }, { data: touchData, error: tErr }] = await Promise.all([
    supabase.from('firm_pool').select('firm_id, categories, geo, pool_status'),
    supabase.from('value_touches').select('firm_id, signal_ref, sent_at, reply_status'),
  ])
  if (fErr) {
    if (fErr.code === '42P01') {
      return Response.json({ error: 'firm_pool table missing — apply supabase/migrations/2026-07-10_firm_pool.sql', code: '42P01' }, { status: 503 })
    }
    return Response.json({ error: fErr.message }, { status: 500 })
  }
  if (tErr) return Response.json({ error: tErr.message }, { status: 500 })

  const firms = (firmData ?? []) as Pick<FirmPool, 'firm_id' | 'categories' | 'geo' | 'pool_status'>[]
  const touches = (touchData ?? []) as Pick<ValueTouch, 'firm_id' | 'signal_ref' | 'sent_at' | 'reply_status'>[]

  const tally = <T extends string>(items: (T | null | undefined)[]): Record<string, number> => {
    const m: Record<string, number> = {}
    for (const it of items) { const k = it || 'unknown'; m[k] = (m[k] ?? 0) + 1 }
    return m
  }

  const pool_by_status = tally(firms.map((f) => f.pool_status))
  const pool_by_geo = tally(firms.map((f) => f.geo))
  const pool_by_category = tally(firms.flatMap((f) => f.categories ?? []))

  // A firm counts as "touched" once it has a SENT touch.
  const sentTouches = touches.filter((t) => t.sent_at)
  const touchedFirmIds = new Set(sentTouches.map((t) => t.firm_id))
  const isProgressed = (s: string | undefined) => s === 'replied' || s === 'call' || s === 'brief'

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

  // Per-signal reply rate (sent + progressed).
  const bySignal: Record<string, { sent: number; replied: number }> = {}
  for (const t of sentTouches) {
    const s = (bySignal[t.signal_ref] ??= { sent: 0, replied: 0 })
    s.sent++
    if (isProgressed(t.reply_status)) s.replied++
  }
  const per_signal = Object.entries(bySignal)
    .map(([signal_ref, v]) => ({ signal_ref, sent: v.sent, replied: v.replied, reply_rate_pct: rate(v.replied, v.sent) }))
    .sort((a, b) => b.sent - a.sent)

  const progression = tally(sentTouches.map((t) => t.reply_status))
  const progressedCount = sentTouches.filter((t) => isProgressed(t.reply_status)).length

  return Response.json({
    pool: {
      total: firms.length,
      by_status: pool_by_status,
      by_geo: pool_by_geo,
      by_category: pool_by_category,
    },
    outreach: {
      firms_touched: touchedFirmIds.size,
      pct_pool_touched: rate(touchedFirmIds.size, firms.length),
      touches_sent: sentTouches.length,
      touches_drafted_unsent: touches.length - sentTouches.length,
      reply_rate_pct: rate(progressedCount, sentTouches.length),
      progression,             // { none, replied, call, brief }
      baseline_news_cold_pct: 6.7,
    },
    per_signal,
  })
}
