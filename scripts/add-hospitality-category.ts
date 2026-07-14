// One-shot: add `hospitality_design` to the five pool firms with documented
// hotel portfolios (2026-07-14, reviewed by Demi).
//
// AW2 (Six Senses resorts), PROMONTORIO (Lisbon hotels/resorts), Spagnulo &
// Partners (luxury hotels, Milan), Studio Marco Piva (Excelsior Hotel Gallia),
// Vudafieri-Saverino (hotels/F&B, Milan). Without this token a hotel signal
// skips them, because `categories` is the join key against work_categories.
//
// Additive and idempotent: existing categories are preserved, and a firm that
// already carries the token is left alone.
//
//   npx tsx --env-file=.env.local scripts/add-hospitality-category.ts [--apply]

import { getSupabaseAdmin } from '@/lib/supabase'

const FIRMS = [
  'AW2 architecture & interiors',
  'PROMONTORIO',
  'Spagnulo & Partners',
  'Studio Marco Piva',
  'Vudafieri-Saverino Partners',
]
const TOKEN = 'hospitality_design'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = getSupabaseAdmin()

  const { data: firms, error } = await db
    .from('firm_pool')
    .select('firm_id, name, categories')
    .in('name', FIRMS)
  if (error) throw error

  const missing = FIRMS.filter((n) => !(firms ?? []).some((f) => f.name === n))
  if (missing.length) console.warn(`WARNING: not found in the pool: ${missing.join(', ')}`)

  for (const f of firms ?? []) {
    const cats: string[] = f.categories ?? []
    if (cats.includes(TOKEN)) {
      console.log(`  ${f.name.padEnd(30)} already has ${TOKEN} — skipping`)
      continue
    }
    const next = [...cats, TOKEN]
    console.log(`  ${f.name.padEnd(30)} ${JSON.stringify(cats)} → ${JSON.stringify(next)}`)
    if (apply) {
      const { error: uErr } = await db
        .from('firm_pool')
        .update({ categories: next, updated_at: new Date().toISOString() })
        .eq('firm_id', f.firm_id)
      if (uErr) console.error(`    FAILED: ${uErr.message}`)
    }
  }

  console.log(apply ? '\nApplied.' : '\nDry run. Re-run with --apply to write.')
}

main().catch((e) => { console.error('ERR', e); process.exit(1) })
