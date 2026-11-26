// Gate-0 at ingestion (2026-08-04, widened in the same-day fixpack) — mirrors
// the auto-kills in protocols/standing-rulings.md so the feed stops
// accumulating rows the Monday runs would reject anyway. A gate-0 hit is still
// INSERTED (auditable, same as the DROP gate) but lands work_status='rejected'
// with a work_reason naming the rule that fired, instead of 'unworked'.
// Deterministic rules in code — not the prompt — so a prompt edit can't
// silently reopen a killed segment. Applied to BOTH lanes (launch AND
// opportunity_signal).
//
// Rules mirrored:
//   - off-geo (checked FIRST). Rewritten 2026-11-26 for the 2027 ruling
//     "se busca por dónde está la firma, no por dónde está el proyecto":
//       • a US project NEVER rejects on geography (Dallas, Nashville, Denver
//         are where New York firms build);
//       • Caribbean-luxury and Middle East projects pass (the allow-lists);
//       • any other non-US project rejects UNLESS a firm the article names is
//         headquartered in an open focus geo.
//     The scope test itself lives in target-geo.ts (geoFit) — one source for
//     this gate, the score cap and the geography points.
//   - construction-progress without a launch signal
//   - market roundups
//   - leasing / tenanting
//   - midscale / economy / hostel / Gen-Z hospitality
//   - workforce-housing or industrial-heavy mixed use
//   - student housing / EB-5 plays

import { geoFit } from './target-geo'

interface Gate0Input {
  title?: string | null
  sector?: string | null
  project_type?: string | null
  brief_summary?: string | null
  tags?: string[] | null
  region?: string | null
  country?: string | null
  // hq_geo of every firm the article names (named_firms[].hq_geo).
  named_firm_geos?: readonly (string | null | undefined)[] | null
}

interface Gate0Rule {
  reason: string
  pattern: RegExp
}

const TEXT_RULES: Gate0Rule[] = [
  {
    reason: 'construction-progress without launch',
    pattern: /superstructure|tops out|topping[- ]out|topped out|construction (progress|update|milestone)|reaches (grade|full height|its full)|facade installation|cladding (begins|progresses)/i,
  },
  {
    reason: 'market roundup',
    pattern: /\broundup\b|\b(two|three|four|five|six|seven|eight|\d+) new developments\b|this week in (real estate|construction|development)/i,
  },
  {
    reason: 'leasing/tenanting',
    pattern: /signs? (a |new )?lease|lease signed|leasing (update|milestone|activity|momentum)|(retail|office) leasing|tenant(ing)? (announce|update|signed)|fully leased/i,
  },
  {
    reason: 'midscale/economy/hostel hospitality',
    pattern: /\bhostels?\b|budget hotel|midscale|economy hotel|economy brand|select[- ]service|extended[- ]stay|gen[- ]?z (hospitality|hotel)|pod hotel|micro[- ]?hotel/i,
  },
  {
    reason: 'student housing / EB-5',
    pattern: /student housing|student accommodation|purpose[- ]built student|\beb[- ]?5\b/i,
  },
  {
    reason: 'workforce housing / industrial-heavy',
    pattern: /workforce housing|industrial park|logistics (center|centre|hub|facility|park)|warehouse (complex|facility|development)|distribution center/i,
  },
]

/**
 * Returns the standing-rulings rule a discovery violates, or null if it passes.
 * The caller stores `ingestion gate-0: <reason>` as work_reason.
 *
 * Off-geo is checked FIRST. A row with no region at all is not rejected on
 * geography (nothing to judge).
 */
export function gate0Reason(input: Gate0Input): string | null {
  const region = (input.region ?? '').trim()
  const country = (input.country ?? '').trim()
  if (region && geoFit({ region, country, namedFirmGeos: input.named_firm_geos }) === 'none') {
    return `off-geo (${[region, country].filter(Boolean).join(', ')})`
  }

  const haystack = [
    input.title,
    input.sector,
    input.project_type,
    input.brief_summary,
    ...(input.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ')

  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(haystack)) return rule.reason
  }

  return null
}

// The verdict gate-0 gives a stored row TODAY. Pure, so the backfill and its
// tests share it. `named_firms` is absent on rows analyzed before 2026-11-26,
// so for those only the project's location can be judged: US, Caribbean and
// Middle East rows flip; other non-US rows stay off-geo until re-analyzed.
export function regateRow(row: {
  title?: string | null
  sector?: string | null
  project_type?: string | null
  brief_summary?: string | null
  tags?: string[] | null
  region?: string | null
  country?: string | null
  named_firms?: { hq_geo?: string | null }[] | null
}): string | null {
  return gate0Reason({
    title: row.title,
    sector: row.sector,
    project_type: row.project_type,
    brief_summary: row.brief_summary,
    tags: row.tags,
    region: row.region,
    country: row.country,
    named_firm_geos: (row.named_firms ?? []).map((f) => f.hq_geo),
  })
}
