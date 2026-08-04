// Gate-0 at ingestion (2026-08-04) — mirrors the auto-kills in
// protocols/standing-rulings.md so the feed stops accumulating rows the Monday
// runs would reject anyway. A gate-0 hit is still INSERTED (auditable, same as
// the DROP gate) but lands work_status='rejected' with a work_reason naming the
// rule that fired, instead of 'unworked'. Deterministic keyword rules in code —
// not the prompt — so a prompt edit can't silently reopen a killed segment.
//
// Rules mirrored (standing-rulings, 4-ago-2026):
//   - midscale / economy / hostel / Gen-Z hospitality
//   - workforce-housing or industrial-heavy mixed use
//   - student housing / EB-5 plays
//   - off-geo: LatAm + Asia-Pacific
// (construction-progress-without-launch and leasing/tenanting arrive as DROP
// signal_types — the processor stamps those rejected too, with their own reason.)

interface Gate0Input {
  title?: string | null
  sector?: string | null
  project_type?: string | null
  brief_summary?: string | null
  tags?: string[] | null
  region?: string | null
  country?: string | null
}

interface Gate0Rule {
  reason: string
  pattern: RegExp
}

const TEXT_RULES: Gate0Rule[] = [
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

// LatAm + Asia-Pacific = auto-KILL (standing). Checked against `country` only —
// the analyzer's region enum has no LatAm/APAC value, so off-geo arrives as
// region 'Other' with a real country string.
const OFF_GEO_COUNTRIES =
  /argentina|brazil|chile|colombia|peru|mexico|uruguay|ecuador|bolivia|paraguay|venezuela|costa rica|panama|guatemala|dominican republic|china|japan|korea|thailand|vietnam|indonesia|malaysia|singapore|philippines|india|australia|new zealand|cambodia|laos|taiwan|hong kong/i

/**
 * Returns the standing-rulings rule a discovery violates, or null if it passes.
 * The caller stores `ingestion gate-0: <reason>` as work_reason.
 */
export function gate0Reason(input: Gate0Input): string | null {
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

  const region = (input.region ?? '').trim()
  const country = (input.country ?? '').trim()
  const inTarget = ['New York', 'Miami', 'France', 'Europe'].includes(region)
  if (!inTarget && country && OFF_GEO_COUNTRIES.test(country)) {
    return `off-geo (${country})`
  }

  return null
}
