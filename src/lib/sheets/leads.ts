import type { Lead } from '../types'
import { mockLeads } from '../mock-data'
import {
  USE_MOCK,
  readTab,
  appendRowByMap,
  updateRow,
  rowsToObjects,
  withFallback,
  batchUpdateCells,
  deleteRowsAt,
  columnIndexToLetter,
} from './client'
import { sessionCache } from './cache'

const TAB = 'Leads'

export const LEAD_COLUMNS = [
  'lead_id', 'company_id', 'campaign_id', 'first_name', 'last_name', 'full_name',
  'email', 'linkedin_url', 'linkedin_connection_status', 'linkedin_dm_status',
  'linkedin_warmth', 'last_linkedin_touch_date', 'linkedin_notes',
  'title', 'company_name', 'website', 'location', 'source',
  'pipeline_stage', 'lead_status', 'business_fit_score', 'taste_score',
  'relationship_score', 'opportunity_score', 'priority_score', 'relationship_temperature',
  'last_touch_date', 'last_meaningful_touch', 'next_followup_date', 'next_action',
  'known_pain_points', 'preferred_communication_style', 'owner', 'notes',
  'held_reason', 'held_until',
  'created_at', 'updated_at',
] as const

function leadToMap(lead: Lead): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of LEAD_COLUMNS) {
    map[col] = String(lead[col as keyof Lead] ?? '')
  }
  return map
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
  await appendRowByMap(TAB, leadToMap(lead), LEAD_COLUMNS)
}

// `ok` is false when the Lead row (or the tab's data) can't be found, so
// callers can surface a 404 instead of silently pretending the write landed.
// `unwritten` lists any requested field whose column is absent from the Leads
// tab — those values could NOT be written (Sheets writes are positional by
// header). Surfacing them keeps a missing column from becoming a silent drop
// (the worst failure mode for automation): callers can return a warning and
// point at /settings/sheets. Newer fields like held_reason/held_until land here
// until the sheet's header row is synced.
export interface UpdateLeadResult {
  ok: boolean
  unwritten: string[]
}

export async function updateLead(leadId: string, updates: Partial<Lead>): Promise<UpdateLeadResult> {
  if (USE_MOCK) {
    sessionCache.leadUpdates[leadId] = {
      ...(sessionCache.leadUpdates[leadId] ?? {}),
      ...updates,
      updated_at: new Date().toISOString(),
    }
    return { ok: true, unwritten: [] }
  }
  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return { ok: false, unwritten: [] }
  const headers = rows[0]
  const rowIndex = rows.findIndex((r) => r[0] === leadId)
  if (rowIndex < 1) return { ok: false, unwritten: [] }
  const updated = [...rows[rowIndex]]
  const unwritten: string[] = []
  Object.entries(updates).forEach(([key, val]) => {
    const colIndex = headers.indexOf(key)
    if (colIndex >= 0) updated[colIndex] = String(val ?? '')
    else unwritten.push(key)
  })
  if (unwritten.length > 0) {
    console.warn(
      `[updateLead] Leads tab is missing columns; these values were NOT written: ${unwritten.join(', ')}. Add them to the sheet header row (see /settings/sheets).`,
    )
  }
  await updateRow(TAB, rowIndex + 1, updated)
  return { ok: true, unwritten }
}

// ─── Delete + bulk ─────────────────────────────────────────────────────────

export async function deleteLead(leadId: string): Promise<boolean> {
  if (USE_MOCK) {
    const before = sessionCache.leads.length
    sessionCache.leads = sessionCache.leads.filter((l) => l.lead_id !== leadId)
    delete sessionCache.leadUpdates[leadId]
    return sessionCache.leads.length < before
  }
  const rows = await readTab(TAB, { fresh: true })
  const rowIndex = rows.findIndex((r) => r[0] === leadId)
  if (rowIndex < 1) return false
  // rowIndex in our array == 0-based sheet row index (rows[0] = sheet row 1)
  await deleteRowsAt(TAB, [rowIndex])
  return true
}

export async function bulkDeleteLeads(leadIds: string[]): Promise<{ deleted: number }> {
  if (leadIds.length === 0) return { deleted: 0 }
  if (USE_MOCK) {
    const set = new Set(leadIds)
    const before = sessionCache.leads.length
    sessionCache.leads = sessionCache.leads.filter((l) => !set.has(l.lead_id))
    for (const id of leadIds) delete sessionCache.leadUpdates[id]
    return { deleted: before - sessionCache.leads.length }
  }
  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return { deleted: 0 }
  const idSet = new Set(leadIds)
  const indices: number[] = []
  for (let i = 1; i < rows.length; i++) {
    if (idSet.has(rows[i][0])) indices.push(i)
  }
  if (indices.length === 0) return { deleted: 0 }
  await deleteRowsAt(TAB, indices)
  return { deleted: indices.length }
}

// Apply the same field updates to N leads in one batchUpdate — one tab read,
// one HTTP write, instead of N updateLead() calls. Returns per-id results so
// callers can report which leads were not found.
export async function bulkUpdateLeads(
  leadIds: string[],
  updates: Partial<Lead>,
): Promise<{ updated: string[]; not_found: string[] }> {
  const nowIso = new Date().toISOString()
  const fields: Partial<Lead> = { ...updates, updated_at: nowIso }

  if (USE_MOCK) {
    for (const id of leadIds) {
      sessionCache.leadUpdates[id] = { ...(sessionCache.leadUpdates[id] ?? {}), ...fields }
    }
    return { updated: [...leadIds], not_found: [] }
  }

  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return { updated: [], not_found: [...leadIds] }
  const headers = rows[0]

  const cellUpdates: { tab: string; row: number; col: string; value: string }[] = []
  const updated: string[] = []
  const idSet = new Set(leadIds)
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i][0]
    if (!idSet.has(id)) continue
    updated.push(id)
    const sheetRow = i + 1
    for (const [key, val] of Object.entries(fields)) {
      const colIdx = headers.indexOf(key)
      if (colIdx >= 0) {
        cellUpdates.push({ tab: TAB, row: sheetRow, col: columnIndexToLetter(colIdx), value: String(val ?? '') })
      }
    }
  }
  if (cellUpdates.length > 0) await batchUpdateCells(cellUpdates)
  const updatedSet = new Set(updated)
  return { updated, not_found: leadIds.filter((id) => !updatedSet.has(id)) }
}

// Set the same campaign_id (or null/'' to unassign) on N leads in one
// batchUpdate. Touches only the campaign_id + updated_at cells per row —
// much faster than N updateLead() calls (which each re-read the whole tab).
export async function bulkAssignCampaign(
  leadIds: string[],
  campaignId: string | null,
): Promise<{ updated: number }> {
  if (leadIds.length === 0) return { updated: 0 }
  const nowIso = new Date().toISOString()
  const value = campaignId ?? ''

  if (USE_MOCK) {
    for (const id of leadIds) {
      sessionCache.leadUpdates[id] = {
        ...(sessionCache.leadUpdates[id] ?? {}),
        campaign_id: value || undefined,
        updated_at: nowIso,
      }
    }
    return { updated: leadIds.length }
  }

  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return { updated: 0 }
  const headers = rows[0]
  const campaignColIdx = headers.indexOf('campaign_id')
  if (campaignColIdx < 0) {
    throw new Error('campaign_id column not found in Leads tab headers — visit /settings/sheets')
  }
  const updatedAtColIdx = headers.indexOf('updated_at')

  const idSet = new Set(leadIds)
  const updates: { tab: string; row: number; col: string; value: string }[] = []
  let matched = 0
  for (let i = 1; i < rows.length; i++) {
    if (!idSet.has(rows[i][0])) continue
    matched++
    const sheetRow = i + 1 // 1-based for A1 addressing
    updates.push({ tab: TAB, row: sheetRow, col: columnIndexToLetter(campaignColIdx), value })
    if (updatedAtColIdx >= 0) {
      updates.push({ tab: TAB, row: sheetRow, col: columnIndexToLetter(updatedAtColIdx), value: nowIso })
    }
  }

  await batchUpdateCells(updates)
  return { updated: matched }
}

// Clear the campaign_id cell on every Lead row that references the given
// campaign. Used by the campaign-delete cascade. Same pattern as
// bulkAssignCampaign — one batchUpdate, no full row rewrites.
export async function clearLeadCampaign(campaignId: string): Promise<{ updated: number }> {
  const nowIso = new Date().toISOString()

  if (USE_MOCK) {
    let touched = 0
    for (const l of sessionCache.leads) {
      if (l.campaign_id === campaignId) {
        sessionCache.leadUpdates[l.lead_id] = {
          ...(sessionCache.leadUpdates[l.lead_id] ?? {}),
          campaign_id: undefined,
          updated_at: nowIso,
        }
        touched++
      }
    }
    return { updated: touched }
  }

  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return { updated: 0 }
  const headers = rows[0]
  const campaignColIdx = headers.indexOf('campaign_id')
  if (campaignColIdx < 0) return { updated: 0 }
  const updatedAtColIdx = headers.indexOf('updated_at')

  const updates: { tab: string; row: number; col: string; value: string }[] = []
  let matched = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][campaignColIdx] !== campaignId) continue
    matched++
    const sheetRow = i + 1
    updates.push({ tab: TAB, row: sheetRow, col: columnIndexToLetter(campaignColIdx), value: '' })
    if (updatedAtColIdx >= 0) {
      updates.push({ tab: TAB, row: sheetRow, col: columnIndexToLetter(updatedAtColIdx), value: nowIso })
    }
  }
  if (updates.length > 0) {
    await batchUpdateCells(updates)
  }
  return { updated: matched }
}
