// One-off migration (June 2026): truncate full-ISO sent_at values in the
// Interactions tab to date-only (YYYY-MM-DD), the canonical format for all
// new writes. Idempotent — re-running finds nothing to change.
//
// Run locally: npx tsx scripts/normalize-sent-at.ts [--dry-run]

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local before importing the sheets client (it reads process.env at module load).
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

async function main() {
  const { readTab, batchUpdateCells, columnIndexToLetter, USE_MOCK } = await import('../src/lib/sheets/client')
  if (USE_MOCK) throw new Error('Sheets credentials not configured — refusing to run against mock data')

  const TAB = 'Interactions'
  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) {
    console.log('No interaction rows found.')
    return
  }
  const headers = rows[0]
  const col = headers.indexOf('sent_at')
  if (col < 0) throw new Error('sent_at column not found in Interactions headers')

  const updates: { tab: string; row: number; col: string; value: string }[] = []
  for (let i = 1; i < rows.length; i++) {
    const val = rows[i][col] ?? ''
    if (ISO_RE.test(val)) {
      updates.push({ tab: TAB, row: i + 1, col: columnIndexToLetter(col), value: val.slice(0, 10) })
      console.log(`row ${i + 1}: ${val} -> ${val.slice(0, 10)}`)
    }
  }

  if (updates.length === 0) {
    console.log('Nothing to normalize — all sent_at values are already date-only.')
    return
  }
  if (DRY_RUN) {
    console.log(`Dry run: ${updates.length} value(s) would be normalized.`)
    return
  }
  await batchUpdateCells(updates)
  console.log(`Normalized ${updates.length} sent_at value(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
