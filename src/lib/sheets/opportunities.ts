import type { Opportunity } from '../types'
import { mockOpportunities } from '../mock-data'
import { USE_MOCK, readTab, appendRow, updateRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Opportunities'

const COLUMNS = [
  'opportunity_id', 'company_id', 'lead_id', 'campaign_id', 'opportunity_type',
  'source', 'summary', 'why_now', 'recommended_action', 'urgency', 'confidence',
  'status', 'created_at', 'updated_at',
] as const

function oppToRow(opp: Opportunity): string[] {
  return COLUMNS.map((col) => String(opp[col as keyof Opportunity] ?? ''))
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

export async function getOpportunitiesForLead(leadId: string): Promise<Opportunity[]> {
  const opps = await getOpportunities()
  return opps.filter((o) => o.lead_id === leadId)
}

export async function createOpportunity(opp: Opportunity): Promise<void> {
  if (USE_MOCK) {
    sessionCache.opportunities.unshift(opp)
    return
  }
  await appendRow(TAB, oppToRow(opp))
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
