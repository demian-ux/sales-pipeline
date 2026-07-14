// One-shot: put the 14 Jul Nammos value-lane batch into the firm pool (2026-07-14).
//
// The batch created 15 leads but no firm_pool rows, so the firms it touched were
// invisible to the pool's dedup / cooldown / "who's been touched with what"
// logic — the whole reason the pool exists. It also wrote each lead with a
// company_id pointing at a Companies row that was never created, so all 15
// references dangle.
//
// This does three things, idempotently:
//   1. Creates the missing Companies rows, reusing the EXACT company_id each
//      lead already references (repairs the dangling ref rather than minting a
//      second id for the same firm).
//   2. Inserts each firm into firm_pool — geo from the lead's location, active,
//      signal_ref = the Nammos signal, linked_company_id = that company_id.
//   3. Leaves contacts alone: firm_pool_contacts stays empty until the July 10
//      enrichment is re-imported or re-run.
//
// Categories are derived from each firm's name/title and are a starting point,
// not gospel — they're the join key against a signal's work_categories, so
// correct them in the pool if a match ever looks wrong.
//
//   npx tsx --env-file=.env.local scripts/backfill-nammos-pool.ts [--apply]

import { getLeads } from '@/lib/sheets/leads'
import { getCompanies, createCompany } from '@/lib/sheets/companies'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { WorkCategory, Geo } from '@/lib/types'

const BATCH_SOURCE = 'Value-lane batch 14 Jul 2026 (Nammos Montenegro)'
const SIGNAL_REF = 'Nammos Resort Montenegro jul-2026'

// name → work-category tokens (must match a signal's work_categories exactly).
const CATEGORIES: Record<string, WorkCategory[]> = {
  'block722':                                 ['architecture', 'interior_design'],
  'AW2 architecture & interiors':             ['architecture', 'interior_design'],
  'MKV Design':                               ['interior_design', 'hospitality_design'],
  'David Collins Studio':                     ['interior_design', 'hospitality_design'],
  'Pierre-Yves Rochon (PYR)':                 ['interior_design', 'hospitality_design'],
  'KCA International':                        ['interior_design', 'hospitality_design'],
  'Ica Hospitality Architecture & Interiors': ['architecture', 'interior_design', 'hospitality_design'],
  '1508 London':                              ['interior_design', 'hospitality_design'],
  'Bergman Design House':                     ['interior_design', 'hospitality_design'],
  'Vudafieri-Saverino Partners':              ['architecture', 'interior_design'],
  'Spagnulo & Partners':                      ['architecture', 'interior_design'],
  'Studio Marco Piva':                        ['architecture', 'interior_design'],
  'ILMIODESIGN':                              ['interior_design', 'hospitality_design'],
  'PROMONTORIO':                              ['architecture'],
  'REARDONSMITH ARCHITECTS':                  ['architecture', 'hospitality_design'],
}

// Dubai is not Europe. The geo token is half the value-outreach join key, so a
// wrong one here would silently match this firm to the wrong signals.
function geoFor(location: string): Geo {
  return /United Arab Emirates|UAE|Dubai|Abu Dhabi|Riyadh|Doha/i.test(location) ? 'middle_east' : 'europe'
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const leads = await getLeads()
  const batch = leads.filter((l) => (l.source ?? '').includes(BATCH_SOURCE))
  if (batch.length !== 15) console.warn(`WARNING: expected 15 batch leads, found ${batch.length}`)

  const companies = await getCompanies()
  const companyIds = new Set(companies.map((c) => c.company_id))
  const { data: pool } = await db.from('firm_pool').select('name')
  const inPool = new Set((pool ?? []).map((f) => f.name))

  const plan = batch.map((l) => {
    const name = (l.company_name ?? '').trim()
    return {
      name,
      lead_id: l.lead_id,
      company_id: l.company_id ?? '',
      location: l.location ?? '',
      geo: geoFor(l.location ?? ''),
      categories: CATEGORIES[name] ?? ['hospitality_design'],
      needsCompany: !!l.company_id && !companyIds.has(l.company_id),
      needsPool: !inPool.has(name),
      icp_notes: `Value-lane batch 14 Jul 2026 · ${l.title ?? ''} · ${l.location ?? ''}`.trim(),
    }
  })

  for (const p of plan) {
    console.log(
      p.name.padEnd(42),
      p.geo.padEnd(12),
      p.categories.join('+').padEnd(42),
      `${p.needsPool ? 'POOL+' : 'pool ok'} ${p.needsCompany ? 'COMPANY+' : 'company ok'}`,
    )
  }
  console.log(`\n${plan.filter((p) => p.needsPool).length} firm(s) to add to the pool, ` +
    `${plan.filter((p) => p.needsCompany).length} Companies row(s) to create (repairing dangling lead.company_id refs).`)

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }

  for (const p of plan) {
    if (p.needsCompany) {
      const now = new Date().toISOString()
      await createCompany({
        company_id: p.company_id,
        company_name: p.name,
        location: p.location,
        industry: 'Architecture / Interior Design',
        notes: `Created 14 Jul 2026 to repair the Nammos value-lane batch: the batch's leads already referenced this company_id, but the row was never written.`,
        created_at: now,
        updated_at: now,
      })
      console.log(`  company created: ${p.name}`)
    }
    if (p.needsPool) {
      const { error } = await db.from('firm_pool').insert({
        name: p.name,
        categories: p.categories,
        geo: p.geo,
        pool_status: 'active',
        signal_ref: SIGNAL_REF,
        linked_company_id: p.company_id || null,
        icp_notes: p.icp_notes,
      })
      if (error) console.error(`  FAILED pool insert ${p.name}: ${error.message}`)
      else console.log(`  pool added: ${p.name}`)
    }
  }
  console.log('\nDone.')
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
