// Write research details into the firm pool, and add researched firms that are
// not in it yet (2026-11-27). Everything learned about a firm lives in the CRM.
//
// Input: a JSON array of operations built from the research rounds:
//   { op: 'update', firm_id, name, details }                 existing pool row
//   { op: 'insert', name, domain, geo, categories, status,   researched firm
//     exclusion_reason, company_id, details }                not yet in the pool
// `details` holds the columns added by
// supabase/migrations/2026-11-26e_firm_pool_details.sql.
//
// Rules:
//   • An update only writes detail columns. It never changes pool_status, geo,
//     categories or notes of an existing row.
//   • An insert goes through the exclusion sync, exactly like POST
//     /api/firm-pool: a firm that matches an engaged or warm CRM account lands
//     as 'excluded' (reason "engaged CRM account"), never as a cold target.
//     A firm inserted as 'excluded' for fit (level C or X) keeps its own reason.
//   • Every row linked to a CRM company gets crm_relationship + crm_leads: a
//     snapshot of the best lead stage at that company (Sheets stays the source
//     of truth).
//
//   npx tsx --env-file=.env.local scripts/sync-pool-research.ts <file.json> [--apply]
//
// Dry run unless --apply. Idempotent.

import { readFileSync } from 'fs'
import { getSupabaseAdmin } from '@/lib/supabase'
import { getLeads } from '@/lib/sheets'
import { computeExclusions } from '@/lib/firm-pool/exclusion'

type Details = Record<string, string | number | null | undefined>
interface UpdateOp { op: 'update'; firm_id: string; name: string; details: Details }
interface InsertOp {
  op: 'insert'; name: string; domain: string; geo: string | null; categories: string[]
  status: string; exclusion_reason: string | null; company_id?: string; details: Details
}

// Best first: what the relationship with the firm amounts to.
const STAGE_RANK: [string, string][] = [
  ['Won', 'won'], ['Negotiation', 'replied'], ['Proposal Sent', 'replied'], ['Discovery', 'replied'], ['Replied', 'replied'],
  ['Nurture', 'nurture'], ['Contacted', 'contacted'], ['New Lead', 'new_lead'], ['Held', 'held'], ['Dormant', 'dormant'], ['Lost', 'lost'],
]

function tidy(details: Details): Details {
  const out: Details = {}
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined) continue
    out[k] = typeof v === 'string' && v.trim() === '' ? null : v
  }
  return out
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'))
  if (!file) throw new Error('usage: sync-pool-research.ts <file.json> [--apply]')
  const apply = process.argv.includes('--apply')
  const ops = JSON.parse(readFileSync(file, 'utf8')) as (UpdateOp | InsertOp)[]
  const updates = ops.filter((o): o is UpdateOp => o.op === 'update')
  const inserts = ops.filter((o): o is InsertOp => o.op === 'insert')
  const supabase = getSupabaseAdmin()

  // ── inserts: exclusion sync + CRM link ────────────────────────────────────
  const verdicts = await computeExclusions(inserts.map((i) => i.name))
  const rows = inserts.map((i) => {
    const v = verdicts.get(i.name) ?? { excluded: false }
    const engaged = v.excluded && i.status !== 'excluded'
    return {
      name: i.name,
      domain: i.domain || null,
      website: i.domain ? `https://${i.domain}` : null,
      categories: i.categories ?? [],
      geo: i.geo,
      pool_status: engaged ? 'excluded' : i.status,
      exclusion_reason: engaged ? v.reason ?? 'engaged CRM account' : i.exclusion_reason,
      linked_company_id: i.company_id || v.linked_company_id || null,
      ...tidy(i.details),
    }
  })
  const tally = (f: (r: (typeof rows)[number]) => string) =>
    rows.reduce<Record<string, number>>((m, r) => { m[f(r)] = (m[f(r)] ?? 0) + 1; return m }, {})
  console.log(`${updates.length} pool rows to update with details; ${rows.length} researched firms to add.`)
  console.log('new rows by status:', JSON.stringify(tally((r) => r.pool_status)))
  console.log('new rows by level: ', JSON.stringify(tally((r) => String((r as Record<string, unknown>).fit_level ?? '-'))))
  console.log('new rows linked to a CRM company:', rows.filter((r) => r.linked_company_id).length)

  if (!apply) { console.log('\nDry run. Re-run with --apply to write.'); return }

  let updated = 0
  for (const u of updates) {
    const { error } = await supabase.from('firm_pool').update({ ...tidy(u.details), updated_at: new Date().toISOString() }).eq('firm_id', u.firm_id)
    if (error) throw new Error(`update ${u.name}: ${error.message}`)
    updated++
  }
  console.log(`updated ${updated} existing rows`)

  let inserted = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.from('firm_pool').upsert(rows.slice(i, i + 200), { onConflict: 'name', ignoreDuplicates: true }).select('firm_id')
    if (error) throw new Error(`insert batch ${i}: ${error.message}`)
    inserted += data?.length ?? 0
  }
  console.log(`inserted ${inserted} new rows`)

  // ── CRM relationship snapshot for every linked row ────────────────────────
  const leads = await getLeads()
  const byCompany = new Map<string, string[]>()
  for (const l of leads) if (l.company_id) byCompany.set(l.company_id, [...(byCompany.get(l.company_id) ?? []), l.pipeline_stage])
  const all: { firm_id: string; linked_company_id: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('firm_pool').select('firm_id, linked_company_id').range(from, from + 999)
    if (error) throw new Error(error.message)
    all.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  const groups = new Map<string, string[]>()   // "relationship|count" → firm ids
  for (const f of all) {
    const stages = f.linked_company_id ? byCompany.get(f.linked_company_id) ?? [] : []
    const rel = STAGE_RANK.find(([stage]) => stages.includes(stage))?.[1] ?? 'none'
    const key = `${rel}|${stages.length}`
    groups.set(key, [...(groups.get(key) ?? []), f.firm_id])
  }
  const relTally: Record<string, number> = {}
  for (const [key, ids] of groups) {
    const [rel, count] = key.split('|')
    relTally[rel] = (relTally[rel] ?? 0) + ids.length
    for (let i = 0; i < ids.length; i += 150) {
      const { error } = await supabase.from('firm_pool').update({ crm_relationship: rel, crm_leads: Number(count) }).in('firm_id', ids.slice(i, i + 150))
      if (error) throw new Error(`relationship ${key}: ${error.message}`)
    }
  }
  console.log('crm_relationship:', JSON.stringify(relTally))
}

main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1) })
