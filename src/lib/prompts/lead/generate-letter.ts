// Generate a physical letter draft for a Lead — the first touch of the cold
// sequence (letter → email → LinkedIn). Mirrors generate-email but produces
// the formal mailed-letter format, signed with the real sender identity.
// Output is persisted to letter_drafts (one row per lead, upsert).

import type {
  Lead,
  Company,
  Campaign,
  ResearchFinding,
  Interaction,
  Opportunity,
  AIInsight,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE, SENDER, senderSignature } from '@/lib/prompts/brand'
import { buildLeadContext } from './_context'

export async function generateLetterDraft(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  opportunities: Opportunity[],
  latestInsight: AIInsight | null,
  campaign?: Campaign | null,
): Promise<{ letter: string }> {
  requireAnthropic()

  const context = buildLeadContext(lead, company, findings, interactions, opportunities, campaign)

  const analysisBlock = latestInsight
    ? `\n## Existing strategic analysis\nSummary: ${latestInsight.summary}\nWhy now: ${latestInsight.why_now}\nRecommended next action: ${latestInsight.recommended_next_action}`
    : `\n(No prior analysis on file — write the letter from raw context above.)`

  const prompt = `${context}
${analysisBlock}

---

Write ONE formal physical letter, to be sent by mail, from ${SENDER.name} (${SENDER.title} of ${SENDER.company}, a studio specializing in ${SENDER.discipline}) to ${lead.full_name} at ${lead.company_name}.

Letter requirements:
- Professional, clear, strategic tone consistent with Oaki Studio's brand voice
- Not salesy, not hype-driven — feels like a useful business note from a trusted colleague
- Anchored in a real "why now" from the context above; never sequence-driven
- Structured: 1. Opening, 2. The signal/observation, 3. Why it may matter to them, 4. Opportunity hypothesis, 5. Suggested next step, 6. Soft close
- Length: 280–350 words
- Written in English
- No placeholders of any kind — ready to print and mail as-is
- End with exactly this signature block:
${senderSignature()}

Return ONLY the letter text — no preamble, no commentary.`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateLetterDraft',
  )

  return { letter: extractText(response.content).trim() }
}
