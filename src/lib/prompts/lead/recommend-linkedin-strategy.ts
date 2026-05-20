import type {
  Lead,
  Company,
  ResearchFinding,
  Interaction,
  Opportunity,
  LinkedInStrategyOutput,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import { buildLeadContext } from './_context'

export async function recommendLinkedInStrategy(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  opportunities: Opportunity[],
  gmailConversationState?: string,
): Promise<LinkedInStrategyOutput> {
  requireAnthropic()

  const context = buildLeadContext(lead, company, findings, interactions, opportunities)
  const linkedinContext = [
    `LinkedIn URL: ${lead.linkedin_url ?? 'Unknown'}`,
    `Company LinkedIn URL: ${company?.linkedin_company_url ?? 'Unknown'}`,
    `Connection status: ${lead.linkedin_connection_status ?? 'Unknown'}`,
    `DM status: ${lead.linkedin_dm_status ?? 'Unknown'}`,
    `LinkedIn warmth: ${lead.linkedin_warmth ?? 'Passive'}`,
    `Last LinkedIn touch: ${lead.last_linkedin_touch_date ?? 'Unknown'}`,
    lead.linkedin_notes ? `LinkedIn notes: ${lead.linkedin_notes}` : '',
    gmailConversationState ? `Gmail conversation state: ${gmailConversationState}` : '',
  ].filter(Boolean).join('\n')

  const prompt = `${context}

---

## LinkedIn context
${linkedinContext}

Recommend the best LinkedIn action for this relationship.

Safety rules:
- Do not suggest automation, scraping, browser bots, auto-connect, auto-DM, or bulk outreach.
- LinkedIn is only for relationship context and human-approved manual action.
- Prefer email when the relationship or live conversation makes email the more respectful channel.
- If the signal is weak, recommend waiting or nurturing.

Return ONLY valid JSON matching this structure:
{
  "recommended_linkedin_action": "Connect | DM | Engage first | Wait | Use email instead | Nurture",
  "why": "Why this action fits now, specific to Oaki and this relationship.",
  "connection_note": "A short manual connection note, or an empty string if not appropriate.",
  "suggested_dm": "A short manual DM, or an empty string if not appropriate.",
  "risk": "Relationship risk and how to avoid damaging trust.",
  "confidence": 0
}

confidence: 0-100 integer.`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'recommendLinkedInStrategy',
  )

  const parsed = parseJson<Partial<LinkedInStrategyOutput>>(extractText(response.content))
  return {
    recommended_linkedin_action: parsed.recommended_linkedin_action ?? 'Wait',
    why: parsed.why ?? '',
    connection_note: parsed.connection_note ?? '',
    suggested_dm: parsed.suggested_dm ?? '',
    risk: parsed.risk ?? '',
    confidence: Number(parsed.confidence) || 0,
  }
}
