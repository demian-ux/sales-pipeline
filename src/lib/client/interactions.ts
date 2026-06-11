// The ONE client-side write path for interactions. Every UI surface (manual
// log form, LinkedIn quick actions, roster quick-log buttons) goes through
// logInteraction(), which calls POST /api/leads/{id}/interactions — the single
// server route that also updates the lead's last_touch_date. Never POST to the
// legacy /api/interactions from the UI: it skips the touch-date update, which
// is how cards ended up showing "No touch yet" after real outreach.

export interface InteractionPayload {
  channel: 'Email' | 'LinkedIn' | 'Phone' | 'Meeting' | 'Other'
  direction: 'Inbound' | 'Outbound'
  subject?: string
  body_summary?: string
  sent_at?: string // YYYY-MM-DD; defaults to today
  gmail_thread_id?: string
  gmail_message_id?: string
  linkedin_manual_status?: string
  meaningful?: boolean
}

export interface SavedInteraction {
  interaction_id: string
  lead_id: string
  company_id: string
  channel: string
  direction: string
  subject?: string
  body_summary?: string
  sent_at?: string
  created_at: string
}

export function todayYMD(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Throws on any non-2xx or network failure with a human-readable message —
// callers must surface it, never swallow it. Returns the server's record.
export async function logInteraction(
  leadId: string,
  payload: InteractionPayload,
): Promise<{ interaction: SavedInteraction; lead_updates: Record<string, string> }> {
  let res: Response
  try {
    res = await fetch(`/api/leads/${encodeURIComponent(leadId)}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent_at: todayYMD(), ...payload }),
    })
  } catch (err) {
    throw new Error(`Network error — interaction NOT saved (${err instanceof Error ? err.message : 'offline?'})`)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error ?? `Save failed (HTTP ${res.status} ${res.statusText})`)
  }
  return data
}

// Field vocabularies from GET /api/meta — selects must render these, never
// hardcoded enums. Cached per page load.
export interface MetaVocab {
  interaction_channel: string[]
  interaction_direction: string[]
}

let metaCache: MetaVocab | null = null

export async function fetchMeta(): Promise<MetaVocab> {
  if (metaCache) return metaCache
  const res = await fetch('/api/meta')
  if (!res.ok) throw new Error(`Could not load field options (HTTP ${res.status})`)
  const data = await res.json()
  metaCache = {
    interaction_channel: data.interaction_channel ?? [],
    interaction_direction: data.interaction_direction ?? [],
  }
  return metaCache
}
