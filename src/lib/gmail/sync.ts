import type { gmail_v1 } from 'googleapis'
import type { Lead } from '@/lib/types'
import type { ParsedThread, ParsedMessage, ConversationState } from './types'
import { OAKI_EMAIL } from './client'

const MAX_THREADS_PER_LEAD = 8
const MAX_BODY_CHARS = 1500

function inferState(lastFrom: 'us' | 'them', lastDate: string): ConversationState {
  const days = (Date.now() - new Date(lastDate).getTime()) / 86_400_000
  if (days > 28) return 'dormant'
  if (days > 14) return 'cooling'
  if (lastFrom === 'them') return 'waiting_for_us'
  if (days < 3) return 'active'
  return 'waiting_for_them'
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return ''

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }

  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64')
      .toString('utf-8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  return ''
}

function parseHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export function parseThread(thread: gmail_v1.Schema$Thread, lead: Lead): ParsedThread | null {
  if (!thread.id || !thread.messages?.length) return null

  const messages: ParsedMessage[] = thread.messages.map((msg) => {
    const headers = msg.payload?.headers ?? []
    const from = parseHeader(headers, 'From')
    const to = parseHeader(headers, 'To')
    const subject = parseHeader(headers, 'Subject')
    const date = parseHeader(headers, 'Date')
    const body = extractBody(msg.payload).slice(0, MAX_BODY_CHARS)
    const direction: 'inbound' | 'outbound' = from.toLowerCase().includes(OAKI_EMAIL) ? 'outbound' : 'inbound'

    return {
      message_id: msg.id ?? '',
      from,
      to: to.split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      body,
      date,
      direction,
    }
  })

  const lastMsg = messages[messages.length - 1]
  const lastFrom: 'us' | 'them' = lastMsg.direction === 'outbound' ? 'us' : 'them'
  const subject = messages[0]?.subject || '(no subject)'
  const participants = [...new Set(messages.map((m) => m.from))]

  return {
    thread_id: thread.id,
    lead_id: lead.lead_id,
    company_id: lead.company_id,
    subject,
    snippet: thread.snippet ?? '',
    message_count: messages.length,
    last_message_at: lastMsg.date,
    last_message_from: lastFrom,
    participants,
    messages,
    inferred_state: inferState(lastFrom, lastMsg.date),
  }
}

export async function syncThreadsForLead(
  lead: Lead,
  gmail: gmail_v1.Gmail
): Promise<ParsedThread[]> {
  if (!lead.email) return []

  try {
    const query = `from:${lead.email} OR to:${lead.email}`
    const listRes = await gmail.users.threads.list({
      userId: 'me',
      q: query,
      maxResults: MAX_THREADS_PER_LEAD,
    })

    const threads = listRes.data.threads ?? []
    const parsed: ParsedThread[] = []

    for (const t of threads) {
      if (!t.id) continue
      try {
        const full = await gmail.users.threads.get({ userId: 'me', id: t.id, format: 'full' })
        const parsedThread = parseThread(full.data, lead)
        if (parsedThread) parsed.push(parsedThread)
      } catch {
        // skip threads that fail to fetch
      }
    }

    return parsed
  } catch {
    return []
  }
}
