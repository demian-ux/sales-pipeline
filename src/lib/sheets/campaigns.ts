import type { Campaign, CampaignChannel } from '../types'
import { mockCampaigns } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, updateRow, rowsToObjects, withFallback, deleteRowsAt } from './client'

const TAB = 'Campaigns'

export const CAMPAIGN_COLUMNS = [
  'campaign_id', 'name', 'description', 'target_segment', 'location',
  'project_types', 'offer', 'pain_point', 'cta', 'channels', 'cadence',
  'status', 'owner', 'notes', 'created_at', 'updated_at',
] as const

function parseCampaign(raw: Record<string, string>): Campaign {
  return {
    ...(raw as unknown as Campaign),
    channels: safeParseChannels(raw.channels),
  }
}

function safeParseChannels(val?: string): CampaignChannel[] {
  if (!val) return []
  try { return JSON.parse(val) } catch {
    return val.split(',').map((s) => s.trim()) as CampaignChannel[]
  }
}

function campaignToMap(c: Campaign): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of CAMPAIGN_COLUMNS) {
    if (col === 'channels') {
      map[col] = JSON.stringify(c.channels)
    } else {
      map[col] = String(c[col as keyof Campaign] ?? '')
    }
  }
  return map
}

export async function getCampaigns(): Promise<Campaign[]> {
  if (USE_MOCK) return mockCampaigns
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return mockCampaigns
  return rowsToObjects<Record<string, string>>(rows).map(parseCampaign)
}

export async function updateCampaign(campaignId: string, updates: Partial<Campaign>): Promise<void> {
  if (USE_MOCK) return // campaigns are static in mock mode
  const rows = await readTab(TAB)
  if (rows.length < 2) return
  const headers = rows[0]
  const rowIndex = rows.findIndex((r) => r[0] === campaignId)
  if (rowIndex < 1) return
  const updated = [...rows[rowIndex]]
  Object.entries(updates).forEach(([key, val]) => {
    const colIndex = headers.indexOf(key)
    if (colIndex >= 0) {
      updated[colIndex] = Array.isArray(val) ? JSON.stringify(val) : String(val ?? '')
    }
  })
  await updateRow(TAB, rowIndex + 1, updated)
}

export async function createCampaign(campaign: Campaign): Promise<void> {
  if (USE_MOCK) return
  await appendRowByMap(TAB, campaignToMap(campaign), CAMPAIGN_COLUMNS)
}

export async function deleteCampaign(campaignId: string): Promise<boolean> {
  if (USE_MOCK) return false  // campaigns are static in mock mode
  const rows = await readTab(TAB)
  const rowIndex = rows.findIndex((r) => r[0] === campaignId)
  if (rowIndex < 1) return false
  await deleteRowsAt(TAB, [rowIndex])
  return true
}
