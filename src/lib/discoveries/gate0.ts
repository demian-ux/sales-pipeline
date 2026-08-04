// Gate-0 at ingestion (2026-08-04, widened in the same-day fixpack) — mirrors
// the auto-kills in protocols/standing-rulings.md so the feed stops
// accumulating rows the Monday runs would reject anyway. A gate-0 hit is still
// INSERTED (auditable, same as the DROP gate) but lands work_status='rejected'
// with a work_reason naming the rule that fired, instead of 'unworked'.
// Deterministic rules in code — not the prompt — so a prompt edit can't
// silently reopen a killed segment. Applied to BOTH lanes (launch AND
// opportunity_signal — the Aug 4 test showed Dallas/Ohio items entering
// unworked through the upstream Cultural Capital / Entitlements feeds).
//
// Rules mirrored (standing-rulings + fixpack ronda 2, 4-ago-2026):
//   - off-geo: anything outside NYC metro / South Florida / Europe /
//     Middle East / Caribbean-luxury (checked FIRST — the widest gap)
//   - construction-progress without a launch signal
//   - market roundups
//   - leasing / tenanting
//   - midscale / economy / hostel / Gen-Z hospitality
//   - workforce-housing or industrial-heavy mixed use
//   - student housing / EB-5 plays

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

// Middle East + Caribbean-luxury country allowlists — regions the analyzer
// files under 'Other' that the standing rulings explicitly keep.
const MIDDLE_EAST_ALLOW =
  /united arab emirates|\buae\b|dubai|abu dhabi|saudi|qatar|kuwait|bahrain|oman|israel|jordan/i
const CARIBBEAN_ALLOW =
  /bahamas|turks|caicos|st\.? ?barth|barbados|anguilla|antigua|cayman|bermuda|virgin islands|st\.? ?(lucia|kitts|martin)|dominican republic|jamaica/i

const TARGET_REGIONS = ['New York', 'Miami', 'France', 'Europe']

/**
 * Returns the standing-rulings rule a discovery violates, or null if it passes.
 * The caller stores `ingestion gate-0: <reason>` as work_reason.
 *
 * Off-geo is checked FIRST (fixpack ronda 2): everything outside NYC metro /
 * South Florida / Europe / Middle East / Caribbean-luxury rejects, including
 * US off-geo (Dallas, Ohio) — the upstream feeds carry no geo terms at all.
 */
export function gate0Reason(input: Gate0Input): string | null {
  const region = (input.region ?? '').trim()
  const country = (input.country ?? '').trim()
  if (region && !TARGET_REGIONS.includes(region)) {
    const allowed = MIDDLE_EAST_ALLOW.test(country) || CARIBBEAN_ALLOW.test(country)
    if (!allowed) return `off-geo (${[region, country].filter(Boolean).join(', ')})`
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
