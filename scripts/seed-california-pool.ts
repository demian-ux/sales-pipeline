// One-shot: seed California into the firm pool (2026-11-26, firm-geography change).
//
// California is a focus firm geo for 2027 and had no firms in the pool. Source:
// Cowork/Work Assitant/research/plan-2027/B7-firmas-verificadas.md (verified
// 25-Nov-2026). Only firms where at least one person was VERIFIED on the firm's
// own page are loaded — the "sin abrir" (site did not open) and "sin nombres"
// (no people listed) rows are left out, per the handoff:
//
//   left out: RVD Associates, Kay Lang + Associates, Dyelot, Commune Design,
//   Electric Bowery, Anacapa Architecture, THG Creative, Hatch Design Group,
//   Kovac Design Studio, Standard Architecture, Assembledge+, Appleton Partners,
//   Signum Architecture, Wade Design Architects, Studio Shamshiri, Terremoto,
//   Lifescapes International, Arterra, Andrea Cochran.
//
// Firms only — no contacts. B7 records names and titles but no emails, and
// writing to three people per firm is a separate change (seats / prospecting).
//
// The exclusion sync runs exactly as in POST /api/firm-pool: a firm that
// matches an engaged or warm CRM account lands as 'excluded', never as a cold
// target (several of these were already contacted in Sep–Oct 2026).
//
// Status: 'parked' by default (in the pool, matched by signals, but the seats
// worker — which spends Apollo credits — only picks up 'active' firms). Pass
// --status=active to let the seats worker start on them.
//
//   npx tsx --env-file=.env.local scripts/seed-california-pool.ts [--status=active] [--apply]
//
// Dry run unless --apply. Idempotent: firms already in the pool are skipped.

import { getSupabaseAdmin } from '@/lib/supabase'
import { computeExclusions } from '@/lib/firm-pool/exclusion'
import type { WorkCategory, Geo } from '@/lib/types'

const GEO: Geo = 'california'
const SOURCE = 'B7 verified 25-Nov-2026'

interface Seed {
  name: string
  city: string
  domain: string
  categories: WorkCategory[]
  note: string
}

const HOSPITALITY: WorkCategory[] = ['interior_design', 'hospitality_design']

const FIRMS: Seed[] = [
  // B7 group 2 — California hospitality
  { name: 'Preen Inc.',                       city: 'Los Angeles',   domain: 'preeninc.com',           categories: HOSPITALITY,       note: 'restaurants, resorts' },
  { name: 'Avenue Interior Design',           city: 'Los Angeles',   domain: 'avenueid.com',           categories: HOSPITALITY,       note: 'boutique hotels' },
  { name: 'Studio Collective',                city: 'Venice, Los Angeles', domain: 'studio-collective.com', categories: HOSPITALITY,  note: 'hotels, bars, clubs' },
  { name: 'Indidesign',                       city: 'Los Angeles',   domain: 'indidesign.com',         categories: HOSPITALITY,       note: 'hotel interiors' },
  { name: 'BAMO',                             city: 'San Francisco', domain: 'bamo.com',               categories: HOSPITALITY,       note: 'hotels, resorts; studios in Miami and New York' },
  { name: 'EDG Interior Architecture + Design', city: 'Novato',      domain: 'edgdesign.com',          categories: HOSPITALITY,       note: 'hotels and restaurants; also Dallas' },
  // B7 group 4 — rest of California
  { name: 'Woods + Dangaran',                 city: 'Los Angeles',   domain: 'woodsdangaran.com',      categories: ['architecture', 'interior_design'], note: 'modern houses' },
  { name: 'Walker Workshop',                  city: 'Los Angeles',   domain: 'walkerworkshop.com',     categories: ['architecture'],  note: 'houses, design-build' },
  { name: 'Burdge Architects',                city: 'Malibu',        domain: 'buaia.com',              categories: ['architecture'],  note: 'houses; Surfrider Hotel' },
  { name: 'Feldman Architecture',             city: 'San Francisco', domain: 'feldmanarchitecture.com', categories: ['architecture'], note: 'houses' },
  { name: 'Field Architecture',               city: 'Palo Alto',     domain: 'fieldarchitecture.com',  categories: ['architecture'],  note: 'houses' },
  { name: 'Elysian Landscapes',               city: 'Los Angeles',   domain: 'elysianlandscapes.com',  categories: ['landscape'],     note: 'landscape' },
  { name: 'Pamela Burton & Company',          city: 'Santa Monica',  domain: 'pamelaburtonco.com',     categories: ['landscape'],     note: 'landscape' },
  { name: 'Surfacedesign',                    city: 'San Francisco', domain: 'sdisf.com',              categories: ['landscape'],     note: 'urban landscape' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const statusArg = process.argv.find((a) => a.startsWith('--status='))?.split('=')[1]
  const status = statusArg === 'active' ? 'active' : 'parked'
  const supabase = getSupabaseAdmin()

  const names = FIRMS.map((f) => f.name)
  const { data: existing, error } = await supabase.from('firm_pool').select('name, geo, pool_status')
  if (error) throw new Error(`pool read failed: ${error.message}`)
  const existingByName = new Map((existing ?? []).map((r) => [(r.name as string).toLowerCase(), r]))
  const fresh = FIRMS.filter((f) => !existingByName.has(f.name.toLowerCase()))

  const verdicts = await computeExclusions(fresh.map((f) => f.name))
  const rows = fresh.map((f) => {
    const v = verdicts.get(f.name) ?? { excluded: false }
    return {
      name: f.name,
      domain: f.domain,
      website: `https://www.${f.domain}`,
      categories: f.categories,
      geo: GEO,
      pool_status: v.excluded ? 'excluded' : status,
      exclusion_reason: v.excluded ? v.reason ?? 'engaged CRM account' : null,
      linked_company_id: v.linked_company_id ?? null,
      icp_notes: `${f.city} — ${f.note}. ${SOURCE}`,
    }
  })

  console.log(`${names.length} verified California firms in B7; ${names.length - fresh.length} already in the pool; ${rows.length} to add.`)
  for (const f of FIRMS) {
    const hit = existingByName.get(f.name.toLowerCase())
    if (hit) console.log(`  skip   ${f.name.padEnd(36)} already in pool (${hit.geo ?? 'no geo'}, ${hit.pool_status})`)
  }
  for (const r of rows) {
    console.log(`  ${r.pool_status.padEnd(8)} ${r.name.padEnd(36)} ${r.categories.join(', ')}${r.exclusion_reason ? `  [${r.exclusion_reason}]` : ''}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write.')
    return
  }
  if (rows.length === 0) return

  const { data, error: insErr } = await supabase
    .from('firm_pool')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: true })
    .select('name, pool_status')
  if (insErr) throw new Error(`insert failed: ${insErr.message}`)
  console.log(`\nInserted ${data?.length ?? 0} firm(s).`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
