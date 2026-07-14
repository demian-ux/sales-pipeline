// One-shot: repair leads whose company_id points at a Companies row that was
// never created (2026-07-14).
//
// Cause: POST /api/leads minted `comp_${uuid}` and wrote it onto the lead
// without ever creating the company. 114 of 185 leads carried a dangling ref.
// The route is fixed; this repairs the history it left behind.
//
// Two repair paths, chosen per lead so we never mint a second id for a firm that
// already has one:
//   • A company with the same name already exists → REPOINT the lead at it.
//   • No company by that name → CREATE the row, reusing the lead's existing
//     company_id so the reference it already carries resolves.
//
// Leads at the same firm are grouped, so one company row serves all of them.
//
//   npx tsx --env-file=.env.local scripts/repair-dangling-companies.ts [--apply]

import { getLeads, updateLead } from '@/lib/sheets/leads'
import { getCompanies, createCompany } from '@/lib/sheets/companies'

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase()

// Sheets allows 60 write requests/min/user; a straight loop over 100+ rows
// trips RESOURCE_EXHAUSTED halfway through. Throttle to stay under it.
const THROTTLE_MS = 1_100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const apply = process.argv.includes('--apply')

  const leads = await getLeads()
  const companies = await getCompanies()
  const byId = new Set(companies.map((c) => c.company_id))
  const byName = new Map(companies.map((c) => [norm(c.company_name), c]))

  const dangling = leads.filter((l) => l.company_id && !byId.has(l.company_id) && norm(l.company_name))
  const nameless = leads.filter((l) => l.company_id && !byId.has(l.company_id) && !norm(l.company_name))

  // Group by company name: one company row per firm, however many leads it has.
  const groups = new Map<string, typeof dangling>()
  for (const l of dangling) {
    const k = norm(l.company_name)
    groups.set(k, [...(groups.get(k) ?? []), l])
  }

  const repoint: { lead: (typeof leads)[number]; to: string; name: string }[] = []
  const create: { company_id: string; name: string; leads: typeof dangling }[] = []

  for (const [key, group] of groups) {
    const existing = byName.get(key)
    if (existing) {
      for (const l of group) repoint.push({ lead: l, to: existing.company_id, name: l.company_name ?? '' })
    } else {
      // Reuse the first lead's company_id so its ref resolves; repoint the rest.
      const canonical = group[0].company_id!
      create.push({ company_id: canonical, name: group[0].company_name ?? '', leads: group })
      for (const l of group.slice(1)) {
        if (l.company_id !== canonical) repoint.push({ lead: l, to: canonical, name: l.company_name ?? '' })
      }
    }
  }

  console.log(`leads: ${leads.length} | companies: ${companies.length} | dangling: ${dangling.length + nameless.length}`)
  console.log(`\n${create.length} company row(s) to CREATE (reusing the lead's existing id):`)
  for (const c of create) console.log(`   ${c.name}  [${c.leads.length} lead(s)]  ${c.company_id}`)
  console.log(`\n${repoint.length} lead(s) to REPOINT at an existing company (no duplicate row):`)
  for (const r of repoint) console.log(`   ${r.lead.full_name ?? r.lead.lead_id} @ ${r.name}  →  ${r.to}`)
  if (nameless.length) {
    console.log(`\n${nameless.length} lead(s) have a dangling company_id AND no company_name — cannot repair, left alone:`)
    for (const l of nameless) console.log(`   ${l.lead_id} (${l.full_name ?? 'no name'})`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  const now = new Date().toISOString()
  for (const c of create) {
    const seed = c.leads[0]
    await createCompany({
      company_id: c.company_id,
      company_name: c.name,
      website: seed.website || undefined,
      location: seed.location || undefined,
      notes: 'Row created 14 Jul 2026 to repair a dangling lead.company_id: the lead already referenced this id, but POST /api/leads never wrote the company.',
      created_at: now,
      updated_at: now,
    })
    console.log(`  created company: ${c.name}`)
    await sleep(THROTTLE_MS)
  }
  for (const r of repoint) {
    await updateLead(r.lead.lead_id, { company_id: r.to })
    console.log(`  repointed lead: ${r.lead.full_name ?? r.lead.lead_id} → ${r.to}`)
    await sleep(THROTTLE_MS)
  }
  console.log('\nDone.')
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
