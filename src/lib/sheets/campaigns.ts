import type { Campaign, CampaignChannel } from '../types'
import { mockCampaigns } from '../mock-data'
import { USE_MOCK, readTab, appendRow, updateRow, rowsToObjects, withFallback } from './client'

const TAB = 'Campaigns'

const COLUMNS = [
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

function campaignToRow(c: Campaign): string[] {
  return COLUMNS.map((col) => {
    if (col === 'channels') return JSON.stringify(c.channels)
    return String(c[col as keyof Campaign] ?? '')
  })
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
  await appendRow(TAB, campaignToRow(campaign))
}
