import type { Interaction } from '../types'
import { mockInteractions } from '../mock-data'
import { USE_MOCK, readTab, appendRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Interactions'

const COLUMNS = [
  'interaction_id', 'lead_id', 'company_id', 'channel', 'direction',
  'subject', 'body_summary', 'gmail_thread_id', 'gmail_message_id',
  'linkedin_manual_status', 'sent_at', 'created_at',
] as const

function interactionToRow(i: Interaction): string[] {
  return COLUMNS.map((col) => String(i[col as keyof Interaction] ?? ''))
}

export async function getInteractions(): Promise<Interaction[]> {
  if (USE_MOCK) return [...mockInteractions, ...sessionCache.interactions]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return [...mockInteractions, ...sessionCache.interactions]
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
  await appendRow(TAB, interactionToRow(interaction))
}
