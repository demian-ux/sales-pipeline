// GET /api/snoozed-signals — returns only non-expired entries (lazy filter).
// PUT /api/snoozed-signals — body: { signal_key, snoozed_until }.
//   Upserts the entry into the JSONB blob at app_secrets['snoozed_signals'].
//   Strips expired entries on each write (lazy cleanup).
// DELETE /api/snoozed-signals?signal_key=… — removes a specific entry
//   (manual unsnooze). Without signal_key, clears all expired entries only.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { SnoozedSignal, SnoozedSignalsBlob } from '@/lib/types'

const SIGNALS_KEY = 'snoozed_signals'

const PutBody = z.object({
  signal_key:    z.string().min(1),
  snoozed_until: z.string().datetime({ offset: true }),
})

async function readBlob(): Promise<SnoozedSignalsBlob> {
  if (!isSupabaseAdminConfigured()) return { signals: [] }
  const { data, error } = await getSupabaseAdmin()
    .from('app_secrets')
    .select('value')
    .eq('key', SIGNALS_KEY)
    .maybeSingle()
  if (error) {
    console.warn('[snoozed-signals] read error:', error.message)
    return { signals: [] }
  }
  return (data?.value as SnoozedSignalsBlob | null) ?? { signals: [] }
}

async function writeBlob(blob: SnoozedSignalsBlob): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('app_secrets')
    .upsert(
      { key: SIGNALS_KEY, value: blob, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) throw new Error(error.message)
}

function stripExpired(signals: SnoozedSignal[]): SnoozedSignal[] {
  const now = Date.now()
  return signals.filter((s) => new Date(s.snoozed_until).getTime() > now)
}

export async function GET() {
  const blob = await readBlob()
  return Response.json({ signals: stripExpired(blob.signals) })
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
  const parsed = PutBody.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const blob = await readBlob()
  const cleaned = stripExpired(blob.signals).filter((s) => s.signal_key !== parsed.data.signal_key)
  cleaned.push({ signal_key: parsed.data.signal_key, snoozed_until: parsed.data.snoozed_until })

  try {
    await writeBlob({ signals: cleaned })
  } catch (err) {
    console.error('[snoozed-signals] write error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Write failed' }, { status: 500 })
  }
  return Response.json({ signals: cleaned })
}

export async function DELETE(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  const key = request.nextUrl.searchParams.get('signal_key')
  const blob = await readBlob()
  let next = stripExpired(blob.signals)
  if (key) {
    next = next.filter((s) => s.signal_key !== key)
  }

  try {
    await writeBlob({ signals: next })
  } catch (err) {
    console.error('[snoozed-signals] write error:', err)
    return Response.json({ error: err instanceof Error ? err.message : 'Write failed' }, { status: 500 })
  }
  return Response.json({ signals: next })
}
