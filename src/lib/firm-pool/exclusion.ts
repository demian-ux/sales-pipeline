// Exclusion sync (2026-07-10, firm-pool handoff rule 3): never value-touch an
// active account cold. A pool firm whose name matches a CRM company/lead that
// is actively engaged (or warm) auto-flips to pool_status='excluded'. Reuses the
// same fuzzy matcher the discoveries pipeline uses (roster-match.entityMatches)
// so the two cross-references agree.
//
// Fails OPEN: if Sheets is unavailable, no firm is auto-excluded (additive
// tagging must never block a pool insert or the value-outreach view).

import { getCompanies, getLeads } from '@/lib/sheets'
import { entityMatches } from '@/lib/discoveries/roster-match'

// Active pipeline stages — a lead here means a live relationship. Excludes
// 'New Lead' (not yet worked), 'Lost'/'Dormant' (dead), 'Held'.
const ENGAGED_STAGES = new Set([
  'Contacted', 'Replied', 'Discovery', 'Proposal Sent', 'Negotiation', 'Won', 'Nurture',
])
const WARM_TEMPS = new Set(['Hot', 'Warm'])

export interface ExclusionVerdict {
  excluded: boolean
  reason?: string
  linked_company_id?: string
}

/**
 * Batch-compute exclusion verdicts for firm names against the CRM roster.
 * Loads Companies + Leads once (cached by the sheets layer). A firm is:
 *   - excluded when it matches a company/lead with an engaged-stage or warm lead;
 *   - linked-but-kept when it matches a known company with no active engagement;
 *   - clear otherwise.
 */
export async function computeExclusions(firmNames: string[]): Promise<Map<string, ExclusionVerdict>> {
  const result = new Map<string, ExclusionVerdict>()
  if (firmNames.length === 0) return result

  let companies: Awaited<ReturnType<typeof getCompanies>>
  let leads: Awaited<ReturnType<typeof getLeads>>
  try {
    ;[companies, leads] = await Promise.all([getCompanies(), getLeads()])
  } catch {
    for (const n of firmNames) result.set(n, { excluded: false })
    return result
  }

  for (const name of firmNames) {
    const company = companies.find((c) => c.company_name && entityMatches(name, c.company_name))
    const relatedLeads = leads.filter(
      (l) =>
        (company && l.company_id === company.company_id) ||
        (l.company_name && entityMatches(name, l.company_name)),
    )

    if (!company && relatedLeads.length === 0) {
      result.set(name, { excluded: false })
      continue
    }

    const linked_company_id = company?.company_id
    const hasEngaged = relatedLeads.some((l) => ENGAGED_STAGES.has(l.pipeline_stage))
    const hasWarm = relatedLeads.some((l) => WARM_TEMPS.has(l.relationship_temperature ?? ''))

    if (hasEngaged || hasWarm) {
      result.set(name, {
        excluded: true,
        reason: hasWarm && !hasEngaged ? 'warm thread' : 'engaged CRM account',
        linked_company_id,
      })
    } else {
      // Known company, no active engagement — record the link, don't exclude.
      result.set(name, { excluded: false, linked_company_id })
    }
  }

  return result
}

/** Single-firm convenience wrapper. */
export async function computeExclusion(firmName: string): Promise<ExclusionVerdict> {
  return (await computeExclusions([firmName])).get(firmName) ?? { excluded: false }
}
