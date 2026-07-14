// One-shot backfill: firm_pool.signal_ref (2026-07-14).
//
// signal_ref was empty on all 39 pool firms, so no firm could be traced back to
// the signal that put it in the pool. The value_touches table already records
// that link (firm_id → signal_ref → batch_date) for every firm that was actually
// touched, so this derives the value rather than guessing it.
//
// Idempotent: only fills rows where signal_ref is null. Firms with no recorded
// touch (the parked Miami pool) keep signal_ref null — they were never batched
// against a signal, and inventing one would be worse than leaving it empty.
//
//   npx tsx --env-file=.env.local scripts/backfill-firm-signal-ref.ts [--apply]
//
// Without --apply it prints the plan and writes nothing.

import { getSupabaseAdmin } from '@/lib/supabase'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const { data: firms, error: fErr } = await db
    .from('firm_pool')
    .select('firm_id, name, pool_status, geo, signal_ref')
  if (fErr) throw fErr

  const { data: touches, error: tErr } = await db
    .from('value_touches')
    .select('firm_id, signal_ref, batch_date')
  if (tErr) throw tErr

  // firm_id → signal_ref, from the earliest recorded touch for that firm.
  const signalByFirm = new Map<string, string>()
  for (const t of (touches ?? []).slice().sort((a, b) => String(a.batch_date).localeCompare(String(b.batch_date)))) {
    if (t.firm_id && t.signal_ref && !signalByFirm.has(t.firm_id)) {
      signalByFirm.set(t.firm_id, t.signal_ref)
    }
  }

  const planned = (firms ?? []).filter((f) => !f.signal_ref && signalByFirm.has(f.firm_id))
  const unmatched = (firms ?? []).filter((f) => !f.signal_ref && !signalByFirm.has(f.firm_id))

  console.log(`firms: ${firms?.length} | value_touches: ${touches?.length} | firms with a recorded touch: ${signalByFirm.size}`)
  console.log(`\nWill set signal_ref on ${planned.length} firm(s):`)
  for (const f of planned) console.log(`  ${f.pool_status.padEnd(9)} ${String(f.geo).padEnd(14)} ${f.name}  →  "${signalByFirm.get(f.firm_id)}"`)

  console.log(`\nLeaving ${unmatched.length} firm(s) null — no touch recorded, so no signal to attribute:`)
  for (const f of unmatched) console.log(`  ${f.pool_status.padEnd(9)} ${String(f.geo).padEnd(14)} ${f.name}`)

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  let updated = 0
  for (const f of planned) {
    const { error } = await db
      .from('firm_pool')
      .update({ signal_ref: signalByFirm.get(f.firm_id) })
      .eq('firm_id', f.firm_id)
      .is('signal_ref', null)
    if (error) console.error(`  FAILED ${f.name}: ${error.message}`)
    else updated++
  }
  console.log(`\nUpdated ${updated} firm(s).`)
}

main().catch((e) => {
  console.error('ERR', e)
  process.exit(1)
})
