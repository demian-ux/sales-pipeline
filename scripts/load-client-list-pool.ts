// Load firms from the per-city client lists into the firm pool (2026-11-26).
//
// Input: a JSON array of
//   { name, domain, geo, categories[], hq, work, level, source, status?, apollo_note? }
// built from Cowork/Work Assitant/research/plan-2027/clientes-por-ciudad/
// 00-todas-las-zonas.csv (firms that are new to oaki, verified on their own
// site, level A or B), plus any hand-added rows.
//
// The exclusion sync runs exactly as in POST /api/firm-pool: a firm that
// matches an engaged or warm CRM account lands as 'excluded', never as a cold
// target. Firms already in the pool (by name, case-insensitive) are skipped.
//
// Status: each row's own `status` if it has one, else --status (default
// 'parked'). 'parked' = in the pool and matched by signals, but the seats
// worker — which spends Apollo credits — only picks up 'active' firms.
// 'candidate' = not yet verified on the firm's own site.
//
//   npx tsx --env-file=.env.local scripts/load-client-list-pool.ts <file.json> [--status=parked|active] [--apply]
//
// Dry run unless --apply. Idempotent.

import { readFileSync } from 'fs'
import { getSupabaseAdmin } from '@/lib/supabase'
import { computeExclusions } from '@/lib/firm-pool/exclusion'
import { WORK_CATEGORIES, GEOS, POOL_STATUSES } from '@/lib/vocab'
import type { WorkCategory, Geo, PoolStatus } from '@/lib/types'

interface Row {
  name: string
  domain: string
  geo: string
  categories: string[]
  hq?: string
  work?: string
  level?: string
  source?: string
  status?: string
  apollo_note?: string
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!file) throw new Error('usage: load-client-list-pool.ts <file.json> [--status=parked|active] [--apply]')
  const apply = process.argv.includes('--apply')
  const statusArg = process.argv.find((a) => a.startsWith('--status='))?.split('=')[1]
  const defaultStatus: PoolStatus = statusArg === 'active' ? 'active' : 'parked'

  const input = JSON.parse(readFileSync(file, 'utf8')) as Row[]
  const problems: string[] = []
  for (const r of input) {
    if (!r.name?.trim()) problems.push('row without a name')
    if (!(GEOS as readonly string[]).includes(r.geo)) problems.push(`${r.name}: unknown geo "${r.geo}"`)
    const bad = (r.categories ?? []).filter((c) => !(WORK_CATEGORIES as readonly string[]).includes(c))
    if (bad.length || !(r.categories ?? []).length) problems.push(`${r.name}: categories ${JSON.stringify(r.categories)}`)
    if (r.status && !(POOL_STATUSES as readonly string[]).includes(r.status)) problems.push(`${r.name}: unknown status "${r.status}"`)
  }
  if (problems.length) throw new Error(`input problems:\n  ${problems.join('\n  ')}`)

  const supabase = getSupabaseAdmin()
  const { data: existing, error } = await supabase.from('firm_pool').select('name, domain, geo, pool_status')
  if (error) throw new Error(`pool read failed: ${error.message}`)
  const byName = new Map((existing ?? []).map((r) => [(r.name as string).toLowerCase(), r]))
  const byDomain = new Map(
    (existing ?? []).filter((r) => r.domain).map((r) => [(r.domain as string).toLowerCase().replace(/^www\./, ''), r]),
  )

  const skipped: string[] = []
  const fresh = input.filter((r) => {
    const hit = byName.get(r.name.toLowerCase()) ?? byDomain.get(r.domain.toLowerCase())
    if (hit) skipped.push(`${r.name} — already in pool as "${hit.name}" (${hit.geo ?? 'no geo'}, ${hit.pool_status})`)
    return !hit
  })

  const verdicts = await computeExclusions(fresh.map((r) => r.name))
  const rows = fresh.map((r) => {
    const v = verdicts.get(r.name) ?? { excluded: false }
    const notes = [
      [r.hq, r.work].filter(Boolean).join(' — '),
      r.level ? `Nivel ${r.level}` : '',
      r.source ?? '',
      r.apollo_note ?? '',
    ].filter(Boolean).join('. ')
    return {
      name: r.name,
      domain: r.domain || null,
      website: r.domain ? `https://${r.domain}` : null,
      categories: r.categories as WorkCategory[],
      geo: r.geo as Geo,
      pool_status: v.excluded ? 'excluded' : ((r.status as PoolStatus | undefined) ?? defaultStatus),
      exclusion_reason: v.excluded ? v.reason ?? 'engaged CRM account' : null,
      linked_company_id: v.linked_company_id ?? null,
      icp_notes: notes.slice(0, 900),
    }
  })

  const tally = (f: (r: (typeof rows)[number]) => string) =>
    rows.reduce<Record<string, number>>((m, r) => { m[f(r)] = (m[f(r)] ?? 0) + 1; return m }, {})
  console.log(`${input.length} firms in the file; ${skipped.length} already in the pool; ${rows.length} to add.`)
  for (const s of skipped) console.log(`  skip     ${s}`)
  for (const r of rows.filter((x) => x.pool_status === 'excluded')) console.log(`  excluded ${r.name}  [${r.exclusion_reason}]`)
  console.log('by status:', JSON.stringify(tally((r) => r.pool_status)))
  console.log('by geo:   ', JSON.stringify(tally((r) => r.geo)))

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
