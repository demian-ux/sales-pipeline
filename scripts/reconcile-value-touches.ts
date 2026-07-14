// Reconcile value_touches against Gmail Sent (2026-07-14).
//
// The 12 casino touches carried sent_at = null and gmail_thread_id = null, so
// the ledger believed nothing had gone out. Gmail says otherwise: all 12 were
// sent on 14 Jul 2026 between 11:30 and 12:25 (-0300), each with a thread.
//
// This is not cosmetic. `GET /api/firm-pool?untouched_since=` filters on
// sent_at, so a null there means "never touched" — those 12 firms were eligible
// to be emailed again immediately, and the 3-week cooldown was silently off.
//
// Rule 4 is preserved: sent_at is only written together with the real
// gmail_thread_id it was confirmed from. bump_due = sent_at + 7d.
//
//   npx tsx --env-file=.env.local scripts/reconcile-value-touches.ts [--apply]

import { getGmailClient } from '@/lib/gmail/client'
import { getSupabaseAdmin } from '@/lib/supabase'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()
  const gmail = await getGmailClient()

  const { data: touches, error } = await db
    .from('value_touches')
    .select('touch_id, firm_id, signal_ref, sent_at, gmail_thread_id, bump_due')
  if (error) throw error

  const { data: firms } = await db.from('firm_pool').select('firm_id, name')
  const firmName = new Map((firms ?? []).map((f) => [f.firm_id, f.name]))
  const { data: contacts } = await db.from('firm_pool_contacts').select('firm_id, email')
  const emailByFirm = new Map((contacts ?? []).filter((c) => c.email).map((c) => [c.firm_id, c.email as string]))

  const planned: { touch_id: string; firm: string; email: string; sent_at: string; thread: string; bump_due: string }[] = []
  const unresolved: string[] = []

  for (const t of touches ?? []) {
    if (t.sent_at) continue // already reconciled
    const firm = firmName.get(t.firm_id) ?? t.firm_id
    const email = emailByFirm.get(t.firm_id)
    if (!email) {
      unresolved.push(`${firm} — no contact email on file, cannot search Gmail`)
      continue
    }

    const res = await gmail.users.messages.list({ userId: 'me', q: `in:sent to:${email}`, maxResults: 10 })
    const msgs = res.data.messages ?? []
    let best: { date: number; thread: string } | null = null
    for (const m of msgs) {
      const full = await gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'metadata' })
      const hs = full.data.payload?.headers ?? []
      const dateStr = hs.find((x) => x.name?.toLowerCase() === 'date')?.value
      const ms = dateStr ? Date.parse(dateStr) : NaN
      if (Number.isNaN(ms)) continue
      // The touch is the send that followed the batch being staged — take the
      // most recent send to this address.
      if (!best || ms > best.date) best = { date: ms, thread: full.data.threadId! }
    }
    if (!best) {
      unresolved.push(`${firm} (${email}) — no sent message found; leaving sent_at null (correct: it never went out)`)
      continue
    }
    const sent = new Date(best.date).toISOString()
    planned.push({
      touch_id: t.touch_id,
      firm,
      email,
      sent_at: sent,
      thread: best.thread,
      bump_due: new Date(best.date + 7 * 86_400_000).toISOString().slice(0, 10),
    })
  }

  console.log(`touches: ${touches?.length} | to reconcile: ${planned.length}\n`)
  for (const p of planned) {
    console.log(`  ${p.firm.padEnd(28)} sent ${p.sent_at.slice(0, 16)}  bump ${p.bump_due}  thread ${p.thread}`)
  }
  if (unresolved.length) {
    console.log(`\n${unresolved.length} unresolved:`)
    for (const u of unresolved) console.log(`  ${u}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  for (const p of planned) {
    const { error: uErr } = await db
      .from('value_touches')
      .update({
        sent_at: p.sent_at,
        gmail_thread_id: p.thread,
        bump_due: p.bump_due,
        updated_at: new Date().toISOString(),
      })
      .eq('touch_id', p.touch_id)
    if (uErr) console.error(`  FAILED ${p.firm}: ${uErr.message}`)
    else console.log(`  reconciled: ${p.firm}`)
  }
  console.log('\nDone.')
}

main().catch((e) => { console.error('ERR', e.message ?? e); process.exit(1) })
