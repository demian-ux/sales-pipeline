// Fuzzy-match a discovery's named entities (developers, architects, main
// actors) against the Companies roster, so wrong attachments (and missed
// stronger matches) are visible before promoting.

import { getCompanies, getLeads } from '@/lib/sheets'

export interface RosterMatch {
  entity: string
  company_id: string
  company_name: string
  contact_count: number
  leads: {
    lead_id: string
    full_name: string
    title?: string
    relationship_temperature?: string
    pipeline_stage?: string
  }[]
}

// Strip legal suffixes / punctuation so "Oak Row Equities LLC" matches
// "Oak Row Equities".
function normalizeEntity(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(/\b(llc|inc|ltd|llp|corp|corporation|company|co|group|partners|holdings)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function entityMatches(a: string, b: string): boolean {
  const na = normalizeEntity(a)
  const nb = normalizeEntity(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Containment counts when the contained name is distinctive enough.
  return (na.length >= 5 && nb.includes(na)) || (nb.length >= 5 && na.includes(nb))
}

export function extractDiscoveryEntities(d: {
  main_actors?: string[] | null
  developer?: string | null
  architect?: string | null
  government_body?: string | null
}): string[] {
  return [...(d.main_actors ?? []), d.developer, d.architect, d.government_body]
    .filter((e): e is string => !!e && e.trim().length > 1)
}

export async function matchEntitiesToRoster(entities: string[]): Promise<RosterMatch[]> {
  if (entities.length === 0) return []
  const [companies, leads] = await Promise.all([getCompanies(), getLeads()])

  const matches: RosterMatch[] = []
  for (const company of companies) {
    const matchedEntity = entities.find((e) => entityMatches(e, company.company_name))
    if (!matchedEntity) continue
    const companyLeads = leads.filter((l) => l.company_id === company.company_id)
    matches.push({
      entity: matchedEntity,
      company_id: company.company_id,
      company_name: company.company_name,
      contact_count: companyLeads.length,
      leads: companyLeads.map((l) => ({
        lead_id: l.lead_id,
        full_name: l.full_name,
        title: l.title,
        relationship_temperature: l.relationship_temperature,
        pipeline_stage: l.pipeline_stage,
      })),
    })
  }
  matches.sort((a, b) => b.contact_count - a.contact_count)
  return matches
}
