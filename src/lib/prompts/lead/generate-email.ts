// Generate a single email draft for a Lead. Called by the "Draft email"
// button on the lead detail page. Output is persisted to email_drafts
// (one row per lead, upsert) — NOT to AIInsight.

import type {
  Lead,
  Company,
  Campaign,
  ResearchFinding,
  Interaction,
  Opportunity,
  AIInsight,
  EmailDraftOutput,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import { buildLeadContext } from './_context'

export async function generateEmailDraft(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  opportunities: Opportunity[],
  latestInsight: AIInsight | null,
  campaign?: Campaign | null,
): Promise<EmailDraftOutput> {
  requireAnthropic()

  const context = buildLeadContext(lead, company, findings, interactions, opportunities, campaign)

  const analysisBlock = latestInsight
    ? `\n## Existing strategic analysis\nSummary: ${latestInsight.summary}\nWhy now: ${latestInsight.why_now}\nRecommended next action: ${latestInsight.recommended_next_action}\nIntent level: ${latestInsight.intent_level} · Confidence: ${latestInsight.confidence}%`
    : `\n(No prior analysis on file — write the email from raw context above.)`

  const prompt = `${context}
${analysisBlock}

---

Write ONE email draft from Oaki's founder to ${lead.full_name}.

Constraints:
- Short — 4 to 7 sentences total.
- Premium, calm, specific. No generic openers.
- Reference something real about ${lead.company_name} or ${lead.full_name}'s recent work.
- Anchor in a clear "why now" — never sequence-driven.
- One ask, soft. No multi-CTA.
- Include a subject line.

Return ONLY valid JSON:
{
  "email": "Subject: [subject line]\\n\\n[body]"
}`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateEmailDraft',
  )

  return parseJson<EmailDraftOutput>(extractText(response.content))
}
