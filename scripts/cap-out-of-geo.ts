// One-off migration (June 2026): apply the out-of-target geography cap to
// existing discoveries, and swap the two formerly-global GNews source queries
// for their geo-qualified versions.
//
// Out-of-geo rows (region not in TARGET_REGIONS) get:
//   - signal_tier strong_opportunity → watchlist
//   - discovery_score capped at OUT_OF_GEO_SCORE_CAP
// Mirrors the runtime cap added to processor.ts. Idempotent.
//
// Run locally: npx tsx scripts/cap-out-of-geo.ts [--dry-run]

import { readFileSync } from 'fs'
import { resolve } from 'path'

for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

const DRY_RUN = process.argv.includes('--dry-run')

// Must stay in sync with the seed block in supabase/schema.sql.
const SOURCE_URL_UPDATES: { name: string; url: string }[] = [
  {
    name: 'GNews Airport Design',
    url: 'https://news.google.com/rss/search?q=airport+modernization+design+architecture+(%22New+York%22+OR+%22JFK%22+OR+%22LaGuardia%22+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en',
  },
  {
    name: 'GNews Luxury Resi',
    url: 'https://news.google.com/rss/search?q=luxury+residential+development+architecture+(%22New+York%22+OR+Manhattan+OR+Brooklyn+OR+Miami+OR+Paris+OR+France+OR+Europe)&hl=en&gl=US&ceid=US:en',
  },
]

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const { TARGET_REGIONS, OUT_OF_GEO_SCORE_CAP } = await import('../src/lib/discoveries/target-geo')
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── 1. Cap out-of-geo discoveries ─────────────────────────────────────────
  const { data: rows, error } = await supabase
    .from('discoveries')
    .select('id, title, city, country, region, signal_tier, discovery_score')
  if (error) throw new Error(error.message)

  const targets = new Set<string>(TARGET_REGIONS)
  const toFix = (rows ?? []).filter(
    (d) =>
      (!d.region || !targets.has(d.region)) &&
      (d.signal_tier === 'strong_opportunity' || (d.discovery_score ?? 0) > OUT_OF_GEO_SCORE_CAP),
  )

  console.log(`${rows?.length ?? 0} discoveries; ${toFix.length} out-of-geo row(s) need capping.`)
  for (const d of toFix) {
    const newTier = d.signal_tier === 'strong_opportunity' ? 'watchlist' : d.signal_tier
    const newScore = Math.min(d.discovery_score ?? 0, OUT_OF_GEO_SCORE_CAP)
    console.log(
      `  ${(d.city || d.country || 'unknown').padEnd(18)} ${String(d.discovery_score).padStart(3)}→${String(newScore).padStart(3)} ${d.signal_tier}${newTier !== d.signal_tier ? `→${newTier}` : ''}  ${d.title.slice(0, 60)}`,
    )
    if (!DRY_RUN) {
      const { error: updErr } = await supabase
        .from('discoveries')
        .update({ signal_tier: newTier, discovery_score: newScore })
        .eq('id', d.id)
      if (updErr) throw new Error(`update ${d.id}: ${updErr.message}`)
    }
  }

  // ── 2. Geo-qualify the two global GNews source queries ───────────────────
  for (const s of SOURCE_URL_UPDATES) {
    const { data: existing, error: selErr } = await supabase
      .from('sources')
      .select('id, url')
      .eq('name', s.name)
      .maybeSingle()
    if (selErr) throw new Error(selErr.message)
    if (!existing) {
      console.log(`source "${s.name}" not found — skipping`)
      continue
    }
    if (existing.url === s.url) {
      console.log(`source "${s.name}" already geo-qualified`)
      continue
    }
    console.log(`source "${s.name}": updating query URL`)
    if (!DRY_RUN) {
      const { error: updErr } = await supabase.from('sources').update({ url: s.url }).eq('id', existing.id)
      if (updErr) throw new Error(`source ${s.name}: ${updErr.message}`)
    }
  }

  console.log(DRY_RUN ? 'Dry run — nothing written.' : 'Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
