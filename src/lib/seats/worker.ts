// Seats worker — the nightly pass that fills the approve queue (Gate 1).
//
// Per active pool firm without a seat, in order NY → value-lane by age:
//   1. BLOCKING dedup (blacklist / CRM / programados) — before any credit.
//   2. Cooldown: a firm value-touched < 3 weeks ago is skipped this run.
//   3. Free Apollo people/search by domain; title heuristic by firm category.
//   4. Paid match (1 credit) of the single chosen candidate only.
//   5. No verified email ⇒ async waterfall (the only retry; NEVER guess).
// Every spend hits credit_ledger at the moment of the call; the weekly budget
// is a hard stop. One seat per corporate house (sister entities = one touch).

import { getSupabaseAdmin } from '@/lib/supabase'
import { entityMatches } from '@/lib/discoveries/roster-match'
import { searchPeople, matchPerson, requestWaterfall, isApolloConfigured } from './apollo'
import { titlesForCategories, rankByTitle } from './titles'
import { checkFirm, isBlacklistedFirm, isPersonDuplicate, loadPersonDedupContext } from './dedup'
import { remainingBudget, recordSpend } from './ledger'

const COOLDOWN_DAYS = 21
const MAX_FIRMS_PER_RUN = 10   // bounds wall-clock; the cron comes back nightly

export interface SeatsRunSummary {
  processed: number
  queued: number
  waterfalls: number
  failed: number
  skipped: number
  halted_reason: string | null
  details: string[]
}

interface PoolFirm {
  firm_id: string
  name: string
  domain: string | null
  categories: string[]
  geo: string | null
  created_at: string
}

async function setSeat(firmId: string, fields: Record<string, unknown>): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('firm_seats')
    .upsert({ firm_id: firmId, ...fields, updated_at: new Date().toISOString() }, { onConflict: 'firm_id' })
  if (error) throw new Error(`firm_seats upsert failed: ${error.message}`)
}

export async function runSeatsWorker(): Promise<SeatsRunSummary> {
  const summary: SeatsRunSummary = {
    processed: 0, queued: 0, waterfalls: 0, failed: 0, skipped: 0,
    halted_reason: null, details: [],
  }
  if (!isApolloConfigured()) {
    summary.halted_reason = 'APOLLO_API_KEY not configured'
    return summary
  }
  const supabase = getSupabaseAdmin()

  // Candidate firms: active, no seat row yet. NY first, then oldest-first.
  const [{ data: firms, error: fErr }, { data: seats, error: sErr }] = await Promise.all([
    supabase.from('firm_pool').select('firm_id, name, domain, categories, geo, created_at').eq('pool_status', 'active'),
    supabase.from('firm_seats').select('firm_id, seat_status'),
  ])
  if (fErr || sErr) throw new Error(`pool read failed: ${(fErr ?? sErr)!.message}`)

  const seatByFirm = new Map((seats ?? []).map((s) => [s.firm_id, s.seat_status]))
  // Names of firms that already have a live (non-failed) seat — the corporate-
  // house rule matches new firms against these.
  const { data: seatedFirms } = await supabase
    .from('firm_seats')
    .select('firm_id, seat_status, firm_pool(name)')
    .neq('seat_status', 'seat_failed')
  const seatedNames: string[] = (seatedFirms ?? [])
    .map((s) => (s.firm_pool as unknown as { name: string } | null)?.name)
    .filter((n): n is string => !!n)

  // Cooldown: firms with a value touch sent in the last 3 weeks.
  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 86_400_000).toISOString()
  const { data: recentTouches } = await supabase
    .from('value_touches').select('firm_id').gte('sent_at', cutoff)
  const cooled = new Set((recentTouches ?? []).map((t) => t.firm_id))

  const queue = ((firms ?? []) as PoolFirm[])
    .filter((f) => !seatByFirm.has(f.firm_id))
    .sort((a, b) => {
      const aNy = a.geo === 'nyc' ? 0 : 1
      const bNy = b.geo === 'nyc' ? 0 : 1
      return aNy - bNy || a.created_at.localeCompare(b.created_at)
    })

  if (queue.length === 0) {
    summary.halted_reason = 'no eligible firms'
    return summary
  }

  const ctx = await loadPersonDedupContext()

  for (const firm of queue) {
    if (summary.processed >= MAX_FIRMS_PER_RUN) { summary.halted_reason = 'per-run firm cap'; break }
    if ((await remainingBudget()) < 1) { summary.halted_reason = 'weekly credit budget exhausted'; break }

    // Silent skips: blacklist, cooldown, corporate house already seated.
    if (isBlacklistedFirm(firm.name)) { summary.skipped++; continue }
    if (cooled.has(firm.firm_id)) { summary.skipped++; summary.details.push(`${firm.name}: cooldown`); continue }
    if (seatedNames.some((n) => entityMatches(firm.name, n))) {
      summary.skipped++; summary.details.push(`${firm.name}: corporate house already seated`); continue
    }

    summary.processed++
    try {
      const firmVerdict = await checkFirm(firm.name)
      if (firmVerdict.blocked) {
        await setSeat(firm.firm_id, { seat_status: 'seat_failed', fail_reason: `excluded:${firmVerdict.reason}` })
        summary.failed++; summary.details.push(`${firm.name}: ${firmVerdict.reason}`)
        continue
      }
      const domain = firm.domain?.trim()
      if (!domain) {
        await setSeat(firm.firm_id, { seat_status: 'seat_failed', fail_reason: 'no_domain' })
        summary.failed++; summary.details.push(`${firm.name}: no_domain`)
        continue
      }

      const titles = titlesForCategories(firm.categories ?? [])
      const candidates = rankByTitle(await searchPeople(domain, titles), titles)
        .filter((p) => !isPersonDuplicate(ctx, p, firm.name).blocked)
      const pick = candidates[0]
      if (!pick) {
        await setSeat(firm.firm_id, { seat_status: 'seat_failed', fail_reason: 'no_candidate' })
        summary.failed++; summary.details.push(`${firm.name}: no_candidate`)
        continue
      }

      // Paid reveal of the chosen candidate only. Ledger first.
      await recordSpend(firm.firm_id, 'match', 1, `match ${pick.name ?? pick.id}`)
      const matched = await matchPerson(pick.id)
      const base = {
        candidate_name: matched?.name ?? pick.name,
        title: matched?.title ?? pick.title,
        apollo_person_id: pick.id,
        linkedin_url: matched?.linkedin_url ?? pick.linkedin_url,
        found_at: new Date().toISOString(),
      }

      if (matched?.email && matched.email_status === 'verified') {
        // Late person-level dedup on the now-revealed email.
        if (isPersonDuplicate(ctx, matched, firm.name).blocked) {
          await setSeat(firm.firm_id, { ...base, seat_status: 'seat_failed', fail_reason: 'duplicate_after_reveal', credits_spent: 1 })
          summary.failed++; summary.details.push(`${firm.name}: duplicate after reveal`)
          continue
        }
        await setSeat(firm.firm_id, {
          ...base, email: matched.email, email_status: 'verified',
          seat_status: 'seat_pending', seat_source: 'apollo_match', credits_spent: 1,
        })
        summary.queued++; summary.details.push(`${firm.name}: seat_pending (${matched.email})`)
        continue
      }

      // No verified email → async waterfall (only if budget allows).
      if ((await remainingBudget()) < 1) {
        await setSeat(firm.firm_id, { ...base, seat_status: 'seat_failed', fail_reason: 'no_email', credits_spent: 1 })
        summary.failed++
        summary.halted_reason = 'weekly credit budget exhausted'
        break
      }
      try {
        const requestId = await requestWaterfall(pick.id)
        await recordSpend(firm.firm_id, 'waterfall', 1, `waterfall ${pick.name ?? pick.id}`)
        await setSeat(firm.firm_id, {
          ...base, email_status: 'waterfall_pending', waterfall_request_id: requestId,
          seat_status: 'unworked', credits_spent: 2,
        })
        summary.waterfalls++; summary.details.push(`${firm.name}: waterfall pending`)
      } catch (e) {
        // Waterfall unavailable (plan/endpoint) ⇒ benched, never guessed.
        await setSeat(firm.firm_id, { ...base, seat_status: 'seat_failed', fail_reason: 'no_email', credits_spent: 1 })
        summary.failed++; summary.details.push(`${firm.name}: no_email (waterfall failed: ${e instanceof Error ? e.message : e})`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await setSeat(firm.firm_id, { seat_status: 'seat_failed', fail_reason: `error:${msg.slice(0, 200)}` }).catch(() => {})
      summary.failed++; summary.details.push(`${firm.name}: ERROR ${msg}`)
    }
  }

  return summary
}

/** 15-min cron: resolve pending waterfalls. */
export async function pollWaterfalls(): Promise<{ resolved: number; failed: number; pending: number }> {
  const supabase = getSupabaseAdmin()
  const { data: pending, error } = await supabase
    .from('firm_seats')
    .select('seat_id, firm_id, waterfall_request_id')
    .eq('email_status', 'waterfall_pending')
    .not('waterfall_request_id', 'is', null)
  if (error) throw new Error(`waterfall poll read failed: ${error.message}`)

  const out = { resolved: 0, failed: 0, pending: 0 }
  const { pollWaterfall } = await import('./apollo')
  for (const seat of pending ?? []) {
    try {
      const result = await pollWaterfall(seat.waterfall_request_id!)
      if (result.status === 'verified' && result.email) {
        await setSeat(seat.firm_id, {
          email: result.email, email_status: 'waterfall_verified',
          seat_status: 'seat_pending', seat_source: 'apollo_waterfall', waterfall_request_id: null,
        })
        out.resolved++
      } else if (result.status === 'failed') {
        await setSeat(seat.firm_id, {
          email_status: 'none', seat_status: 'seat_failed', fail_reason: 'no_email', waterfall_request_id: null,
        })
        out.failed++
      } else {
        out.pending++
      }
    } catch (e) {
      console.warn(`[seats] waterfall poll error for ${seat.firm_id}:`, e instanceof Error ? e.message : e)
      out.pending++
    }
  }
  return out
}
