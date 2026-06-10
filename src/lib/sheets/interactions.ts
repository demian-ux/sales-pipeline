import type { Interaction } from '../types'
import { mockInteractions } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Interactions'

export const INTERACTION_COLUMNS = [
  'interaction_id', 'lead_id', 'company_id', 'channel', 'direction',
  'subject', 'body_summary', 'gmail_thread_id', 'gmail_message_id',
  'linkedin_manual_status', 'sent_at', 'created_at',
] as const

function interactionToMap(i: Interaction): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of INTERACTION_COLUMNS) {
    map[col] = String(i[col as keyof Interaction] ?? '')
  }
  return map
}

export async function getInteractions(): Promise<Interaction[]> {
  if (USE_MOCK) return [...mockInteractions, ...sessionCache.interactions]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  return rowsToObjects<Interaction>(rows)
}

export async function getInteractionsForLead(leadId: string): Promise<Interaction[]> {
  const interactions = await getInteractions()
  return interactions.filter((i) => i.lead_id === leadId)
}

export async function saveInteraction(interaction: Interaction): Promise<void> {
  if (USE_MOCK) {
    sessionCache.interactions.unshift(interaction)
    return
  }
  await appendRowByMap(TAB, interactionToMap(interaction), INTERACTION_COLUMNS)
}
