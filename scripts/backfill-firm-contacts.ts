// Backfill firm_pool_contacts from sources we already have (2026-07-14).
// Spends no Apollo credits.
//
// Sources, in priority order, per pool firm that has no contact yet:
//   1. The Leads sheet — a lead whose company matches the firm and that carries
//      an email. This gives name, title, email AND the lead_id link. The casino
//      batch's 11 NYC contacts and Dacra landed here as leads today.
//   2. decision-trail-2026-07-14-value-pilot.html — the casino send queue, which
//      records "<name> · <firm>" + "<title> · <email> (Apollo verified)". This
//      covers INC Architecture & Design, the 12th casino firm that never became
//      a lead.
//
// The 16 parked Miami firms are NOT recoverable: their emails were never written
// to a decision trail (the 10 Jul handoff says so explicitly), and the 16 Gmail
// drafts that held them have since been deleted — 1 draft remains. Per the
// handoff, those firms are left contactless; re-enrichment is Demi's call.
//
//   npx tsx --env-file=.env.local scripts/backfill-firm-contacts.ts [--apply]

import { readFileSync } from 'node:fs'
import { getLeads } from '@/lib/sheets/leads'
import { getSupabaseAdmin } from '@/lib/supabase'

const TRAIL =
  'C:/Users/dszkl/OneDrive/Documentos/Claude/Projects/Work Assitant/outreach/decision-trail-2026-07-14-value-pilot.html'

const norm = (s: string | undefined | null) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

interface Candidate {
  name: string
  title: string
  email: string
  lead_id?: string
  source: string
  enriched_at: string
}

/** Parse "<name> · <firm>" / "<title> · <email> (Apollo verified)" out of the trail. */
function parseTrail(): Map<string, Candidate> {
  const out = new Map<string, Candidate>()
  let text: string
  try {
    text = readFileSync(TRAIL, 'utf8')
  } catch {
    console.warn('trail not readable — skipping trail source')
    return out
  }
  const lines = text
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map((l) => l.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)

  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(/^(.+?)\s·\s(.+)$/)
    if (!head) continue
    // Look ahead a few lines for the "<title> · <email> (Apollo verified)" line.
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const detail = lines[j].match(/^(.+?)\s·\s([\w.%+-]+@[\w.-]+\.[a-z]{2,})\s*\(([^)]*)\)/i)
      if (!detail) continue
      const firmKey = norm(head[2])
      if (!out.has(firmKey)) {
        out.set(firmKey, {
          name: head[1].trim(),
          title: detail[1].trim(),
          email: detail[2].trim(),
          source: 'Value-lane pilot v2 10 Jul (casino signal)',
          enriched_at: '2026-07-10T00:00:00Z',
        })
      }
      break
    }
  }
  return out
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const { data: firms, error } = await db.from('firm_pool').select('firm_id, name, pool_status, geo')
  if (error) throw error
  const { data: existing, error: cErr } = await db
    .from('firm_pool_contacts')
    .select('contact_id, firm_id, name, email, lead_id, enriched_at, source')
  if (cErr) {
    if (cErr.code === '42703') {
      console.error('Missing columns — apply supabase/migrations/2026-07-14b_contact_provenance.sql first.')
      process.exit(1)
    }
    throw cErr
  }
  const hasContact = new Set((existing ?? []).map((c) => c.firm_id))

  const leads = await getLeads()
  const trail = parseTrail()
  console.log(`firms: ${firms?.length} | firms with a contact already: ${hasContact.size} | trail contacts parsed: ${trail.size}`)

  const planned: { firm: { firm_id: string; name: string }; c: Candidate }[] = []
  const uncovered: string[] = []

  for (const f of firms ?? []) {
    if (hasContact.has(f.firm_id)) continue
    // Excluded firms are engaged/warm CRM accounts. Their people already live in
    // the Leads sheet; copying them into the cold-outreach pool's contact store
    // would only invite someone to treat them as touchable. Skip.
    if (f.pool_status === 'excluded') continue
    const key = norm(f.name)

    // 1. A lead at this firm with an email.
    const lead = leads.find(
      (l) => l.email && (norm(l.company_name) === key || norm(l.company_name).startsWith(key) || key.startsWith(norm(l.company_name))),
    )
    if (lead) {
      planned.push({
        firm: f,
        c: {
          name: lead.full_name ?? '',
          title: lead.title ?? '',
          email: lead.email!,
          lead_id: lead.lead_id,
          source: lead.source ?? 'Leads sheet',
          // The lead's creation is when the credit was actually spent — don't
          // stamp everything 10 Jul, or a later re-enrichment reads as free.
          enriched_at: lead.created_at ?? '2026-07-10T00:00:00Z',
        },
      })
      continue
    }
    // 2. The casino trail.
    const t = trail.get(key)
    if (t) {
      planned.push({ firm: f, c: t })
      continue
    }
    uncovered.push(`${f.name} (${f.pool_status}, ${f.geo})`)
  }

  console.log(`\n${planned.length} contact(s) to insert:`)
  for (const p of planned) {
    console.log(`  ${p.firm.name.padEnd(32)} ${p.c.name.padEnd(22)} ${p.c.email.padEnd(32)} ${p.c.lead_id ? 'lead✓' : 'trail'}`)
  }
  console.log(`\n${uncovered.length} firm(s) with NO recoverable contact — left contactless (re-enrichment is Demi's call):`)
  for (const u of uncovered) console.log(`  ${u}`)

  // The 27 contacts that already exist were POSTed with lead_id / enriched_at /
  // source, and the route dropped all three (that's the bug this fixes). Restore
  // them from the same sources: the lead with that email, else the casino trail.
  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), l]))
  const trailByEmail = new Map([...trail.values()].map((c) => [c.email.toLowerCase(), c]))
  const repairs: { contact_id: string; patch: Record<string, string> }[] = []
  const firmNameById = new Map((firms ?? []).map((f) => [f.firm_id, f.name]))
  for (const c of existing ?? []) {
    if (c.lead_id && c.enriched_at && c.source) continue
    const email = (c.email ?? '').toLowerCase()
    // Email is the reliable key, but a LinkedIn-only contact has none (e.g.
    // REARDONSMITH's). Fall back to person-name + firm-name, which is exactly how
    // the contact was matched to its firm in the first place.
    const lead =
      byEmail.get(email) ??
      leads.find(
        (l) =>
          norm(l.full_name) === norm(c.name) &&
          norm(l.company_name) === norm(firmNameById.get(c.firm_id)),
      )
    const t = trailByEmail.get(email)
    const patch: Record<string, string> = {}
    if (!c.lead_id && lead) patch.lead_id = lead.lead_id
    if (!c.enriched_at) {
      const at = lead?.created_at ?? t?.enriched_at
      if (at) patch.enriched_at = at
    }
    if (!c.source) {
      const s = lead?.source ?? t?.source
      if (s) patch.source = s
    }
    if (Object.keys(patch).length) repairs.push({ contact_id: c.contact_id, patch })
  }
  console.log(`\n${repairs.length} existing contact(s) missing provenance (the dropped lead_id/enriched_at/source) — restoring.`)

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  for (const r of repairs) {
    const { error: uErr } = await db.from('firm_pool_contacts').update(r.patch).eq('contact_id', r.contact_id)
    if (uErr) console.error(`  FAILED provenance ${r.contact_id}: ${uErr.message}`)
  }
  if (repairs.length) console.log(`  provenance restored on ${repairs.length} contact(s).`)

  for (const p of planned) {
    const { error: iErr } = await db.from('firm_pool_contacts').insert({
      firm_id: p.firm.firm_id,
      name: p.c.name || null,
      title: p.c.title || null,
      email: p.c.email,
      email_status: 'verified',
      is_primary: true,
      lead_id: p.c.lead_id ?? null,
      enriched_at: p.c.enriched_at,
      source: p.c.source,
    })
    if (iErr) {
      if (iErr.code === '42703') {
        console.error('\nMissing columns — apply supabase/migrations/2026-07-14b_contact_provenance.sql first.')
        process.exit(1)
      }
      console.error(`  FAILED ${p.firm.name}: ${iErr.message}`)
    } else {
      console.log(`  inserted: ${p.firm.name} → ${p.c.email}`)
    }
  }
  console.log('\nDone.')
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
