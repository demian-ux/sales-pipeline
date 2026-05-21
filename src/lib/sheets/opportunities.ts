import type { Opportunity } from '../types'
import { mockOpportunities } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, updateRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Opportunities'

export const OPPORTUNITY_COLUMNS = [
  'opportunity_id', 'company_id', 'lead_id', 'campaign_id', 'opportunity_type',
  'source', 'summary', 'why_now', 'recommended_action', 'urgency', 'confidence',
  'discovered_from_id', 'discovered_from_url',
  'status', 'created_at', 'updated_at',
] as const

function oppToMap(opp: Opportunity): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of OPPORTUNITY_COLUMNS) {
    map[col] = String(opp[col as keyof Opportunity] ?? '')
  }
  return map
}

export async function getOpportunities(): Promise<Opportunity[]> {
  const mockResult = () => {
    const base = [...mockOpportunities, ...sessionCache.opportunities]
    return base.map((o) =>
      sessionCache.opportunityUpdates[o.opportunity_id]
        ? { ...o, ...sessionCache.opportunityUpdates[o.opportunity_id] }
        : o
    )
  }
  if (USE_MOCK) return mockResult()
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return mockResult()
  const opps = rowsToObjects<Opportunity>(rows)
  return opps.map((o) => ({ ...o, confidence: Number(o.confidence) }))
}

// Returns opportunities for a Lead. With `companyId` supplied, also includes
// Company-level Opportunities (lead_id empty) for that company — these show
// on every Lead at the company until one is explicitly attached. Without
// `companyId`, behaviour matches the original strict lead_id match.
export async function getOpportunitiesForLead(leadId: string, companyId?: string): Promise<Opportunity[]> {
  const opps = await getOpportunities()
  return opps.filter((o) => {
    if (o.lead_id === leadId) return true
    if (companyId && o.company_id === companyId && !o.lead_id) return true
    return false
  })
}

// Returns open Opportunities at a Company that aren't yet attached to a Lead.
// Used by the Apollo importer for auto-attach-on-import.
export async function getOpenUnclaimedOpportunitiesForCompany(companyId: string): Promise<Opportunity[]> {
  const opps = await getOpportunities()
  return opps.filter((o) => o.company_id === companyId && !o.lead_id && o.status === 'Open')
}

export async function createOpportunity(opp: Opportunity): Promise<void> {
  if (USE_MOCK) {
    sessionCache.opportunities.unshift(opp)
    return
  }
  await appendRowByMap(TAB, oppToMap(opp), OPPORTUNITY_COLUMNS)
}

export async function updateOpportunity(oppId: string, updates: Partial<Opportunity>): Promise<void> {
  if (USE_MOCK) {
    sessionCache.opportunityUpdates[oppId] = {
      ...(sessionCache.opportunityUpdates[oppId] ?? {}),
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return
  }
  const rows = await readTab(TAB)
  if (rows.length < 2) return
  const headers = rows[0]
  const rowIndex = rows.findIndex((r) => r[0] === oppId)
  if (rowIndex < 1) return
  const updated = [...rows[rowIndex]]
  Object.entries(updates).forEach(([key, val]) => {
    const colIndex = headers.indexOf(key)
    if (colIndex >= 0) updated[colIndex] = String(val ?? '')
  })
  await updateRow(TAB, rowIndex + 1, updated)
}
