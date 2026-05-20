// Gmail thread analysis. Uses its own task-specific system prompt (not the
// shared BRAND_VOICE) because the output is structured analysis, not outreach copy.

import type { Lead, Company } from '@/lib/types'
import type { ParsedThread, ConversationAnalysis } from '@/lib/gmail/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'

const THREAD_ANALYSIS_SYSTEM = `You are a strategic relationship advisor for Oaki Studio, a high-end architectural visualization studio.

Analyze this email thread and return a JSON object. Be concise and precise.

State definitions:
- waiting_for_us: last message was from them, we haven't replied
- waiting_for_them: we sent the last message, awaiting reply
- active: recent back-and-forth within the last week
- cooling: last exchange was 2-4 weeks ago, momentum fading
- dormant: no exchange in 4+ weeks

Intent definitions:
- high: explicit request for proposal, quote, or project scoping
- discovery_opportunity: expressed interest, asking questions, discovery call warranted
- proposal_risk: proposal was sent but reply is slow, cold, or objecting
- medium: engaged but not actively pushing forward
- low: minimal engagement, lukewarm signals
- none: no intent signals detected

Return only a JSON object with this exact structure:
{
  "state": "waiting_for_us" | "waiting_for_them" | "active" | "cooling" | "dormant",
  "intent": "high" | "discovery_opportunity" | "proposal_risk" | "medium" | "low" | "none",
  "tone": "warm" | "neutral" | "cold" | "urgent",
  "momentum": "accelerating" | "steady" | "decelerating" | "stalled",
  "urgency_signals": ["..."],
  "objections": ["..."],
  "relationship_signals": ["..."],
  "summary": "1-2 sentence summary of where this conversation stands",
  "recommended_response": "Specific, actionable next step for Oaki. 1-2 sentences max.",
  "response_deadline": "e.g. 'within 24 hours', 'by end of week', null if no urgency"
}`

function buildThreadContext(thread: ParsedThread, lead: Lead, company?: Company | null): string {
  const lines: string[] = [
    `Lead: ${lead.full_name} (${lead.title ?? ''} at ${lead.company_name})`,
    `Pipeline stage: ${lead.pipeline_stage}`,
    company ? `Company: ${company.company_name}` : '',
    `Thread subject: ${thread.subject}`,
    `Messages: ${thread.message_count}`,
    '',
    '--- CONVERSATION ---',
  ]

  for (const msg of thread.messages) {
    lines.push(`[${msg.direction.toUpperCase()} — ${msg.from} — ${msg.date}]`)
    lines.push(msg.body || msg.subject || '(no body)')
    lines.push('')
  }

  return lines.filter((l) => l !== undefined).join('\n')
}

export async function analyzeThread(
  thread: ParsedThread,
  lead: Lead,
  company?: Company | null,
): Promise<ConversationAnalysis> {
  requireAnthropic()

  const context = buildThreadContext(thread, lead, company)

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: THREAD_ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: context }],
    }),
    undefined,
    'analyzeThread',
  )

  const parsed = parseJson<Partial<ConversationAnalysis>>(extractText(response.content))

  return {
    analysis_id: `ca_${Date.now()}`,
    thread_id: thread.thread_id,
    lead_id: thread.lead_id,
    state: parsed.state ?? thread.inferred_state,
    intent: parsed.intent ?? 'none',
    tone: parsed.tone ?? 'neutral',
    momentum: parsed.momentum ?? 'steady',
    urgency_signals: Array.isArray(parsed.urgency_signals) ? parsed.urgency_signals : [],
    objections: Array.isArray(parsed.objections) ? parsed.objections : [],
    relationship_signals: Array.isArray(parsed.relationship_signals) ? parsed.relationship_signals : [],
    summary: parsed.summary ?? '',
    recommended_response: parsed.recommended_response ?? '',
    response_deadline: parsed.response_deadline ?? undefined,
    analyzed_at: new Date().toISOString(),
  }
}
