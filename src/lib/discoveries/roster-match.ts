// Fuzzy-match a discovery's named entities (developers, architects, main
// actors) against the Companies roster, so wrong attachments (and missed
// stronger matches) are visible before promoting.

import { getCompanies, getLeads } from '@/lib/sheets'
import type { Company } from '@/lib/types'

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

// Ingestion-time variant: match a discovery's entities against a pre-loaded
// company roster (loaded once per run, not per article) and return the first
// hit — enough to tag already_engaged + badge the worked firm. Returns null
// when nothing matches.
export interface EngagedMatch {
  entity: string
  company_id: string
  company_name: string
}

export function matchEntitiesToCompanies(
  entities: string[],
  companies: Pick<Company, 'company_id' | 'company_name'>[],
): EngagedMatch | null {
  for (const company of companies) {
    if (!company.company_name) continue
    const matched = entities.find((e) => entityMatches(e, company.company_name))
    if (matched) {
      return { entity: matched, company_id: company.company_id, company_name: company.company_name }
    }
  }
  return null
}

// Combined engaged-firm roster: every distinct firm name the CRM knows, from
// both Companies AND Leads (a lead's `company_name` is often a firm that has no
// standalone Company row yet — e.g. PMG, Brodsky). Deduped by normalized name so
// a firm appearing as both a Company and several leads counts once. Used by the
// batch cross-ref backfill so already-engaged discoveries drop off the
// new-signal board.
export async function loadEngagedRoster(): Promise<Pick<Company, 'company_id' | 'company_name'>[]> {
  const [companies, leads] = await Promise.all([getCompanies(), getLeads()])
  const seen = new Set<string>()
  const roster: Pick<Company, 'company_id' | 'company_name'>[] = []
  const add = (company_id: string, company_name: string) => {
    if (!company_name) return
    const key = normalizeEntity(company_name)
    if (!key || seen.has(key)) return
    seen.add(key)
    roster.push({ company_id, company_name })
  }
  for (const c of companies) add(c.company_id, c.company_name)
  for (const l of leads) add(l.company_id ?? '', l.company_name)
  return roster
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
