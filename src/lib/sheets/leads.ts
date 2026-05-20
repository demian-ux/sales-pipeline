import type { Lead } from '../types'
import { mockLeads } from '../mock-data'
import { USE_MOCK, readTab, appendRow, updateRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Leads'

const COLUMNS = [
  'lead_id', 'company_id', 'campaign_id', 'first_name', 'last_name', 'full_name',
  'email', 'linkedin_url', 'linkedin_connection_status', 'linkedin_dm_status',
  'linkedin_warmth', 'last_linkedin_touch_date', 'linkedin_notes',
  'title', 'company_name', 'website', 'location', 'source',
  'pipeline_stage', 'lead_status', 'business_fit_score', 'taste_score',
  'relationship_score', 'opportunity_score', 'priority_score', 'relationship_temperature',
  'last_touch_date', 'last_meaningful_touch', 'next_followup_date', 'next_action',
  'known_pain_points', 'preferred_communication_style', 'owner', 'notes',
  'created_at', 'updated_at',
] as const

function leadToRow(lead: Lead): string[] {
  return COLUMNS.map((col) => String(lead[col as keyof Lead] ?? ''))
}

export async function getLeads(): Promise<Lead[]> {
  const mockResult = () => {
    const base = [...mockLeads, ...sessionCache.leads]
    return base.map((l) =>
      sessionCache.leadUpdates[l.lead_id]
        ? { ...l, ...sessionCache.leadUpdates[l.lead_id] }
        : l
    )
  }
  if (USE_MOCK) return mockResult()
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return mockResult()
  const leads = rowsToObjects<Lead>(rows)
  return leads.map((l) => ({
    ...l,
    business_fit_score: l.business_fit_score ? Number(l.business_fit_score) : undefined,
    taste_score: l.taste_score ? Number(l.taste_score) : undefined,
    relationship_score: l.relationship_score ? Number(l.relationship_score) : undefined,
    opportunity_score: l.opportunity_score ? Number(l.opportunity_score) : undefined,
    priority_score: l.priority_score ? Number(l.priority_score) : undefined,
  }))
}

export async function getLeadById(leadId: string): Promise<Lead | null> {
  const leads = await getLeads()
  return leads.find((l) => l.lead_id === leadId) ?? null
}

export async function createLead(lead: Lead): Promise<void> {
  if (USE_MOCK) {
    sessionCache.leads.unshift(lead)
    return
  }
  await appendRow(TAB, leadToRow(lead))
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<void> {
  if (USE_MOCK) {
    sessionCache.leadUpdates[leadId] = {
      ...(sessionCache.leadUpdates[leadId] ?? {}),
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return
  }
  const rows = await readTab(TAB)
  if (rows.length < 2) return
  const headers = rows[0]
  const rowIndex = rows.findIndex((r) => r[0] === leadId)
  if (rowIndex < 1) return
  const updated = [...rows[rowIndex]]
  Object.entries(updates).forEach(([key, val]) => {
    const colIndex = headers.indexOf(key)
    if (colIndex >= 0) updated[colIndex] = String(val ?? '')
  })
  await updateRow(TAB, rowIndex + 1, updated)
}
