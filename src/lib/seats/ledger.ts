// Credit ledger — every Apollo credit is recorded the moment it is spent, and
// the weekly budget is a HARD stop: budget exhausted ⇒ the worker halts until
// the following Monday (weeks are Mon 00:00 UTC).

import { getSupabaseAdmin } from '@/lib/supabase'
import { env } from '@/lib/env'

/** Monday 00:00 UTC of the current week. */
export function weekStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() // 0=Sun
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
  return d
}

export async function creditsSpentThisWeek(): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from('credit_ledger')
    .select('credits')
    .gte('created_at', weekStart().toISOString())
  if (error) throw new Error(`credit_ledger read failed: ${error.message}`)
  return (data ?? []).reduce((s, r) => s + Number(r.credits), 0)
}

export function weeklyBudget(): number {
  return env.SEATS_WEEKLY_CREDIT_BUDGET
}

export async function remainingBudget(): Promise<number> {
  return weeklyBudget() - (await creditsSpentThisWeek())
}

/** Record a spend. Call at the moment of the paid API call, never batched. */
export async function recordSpend(
  firmId: string | null,
  action: 'match' | 'waterfall',
  credits: number,
  note?: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('credit_ledger')
    .insert({ firm_id: firmId, action, credits, note: note ?? null })
  if (error) throw new Error(`credit_ledger write failed: ${error.message}`)
}
