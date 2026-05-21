// Generate a single LinkedIn DM draft for a Lead. Called by the "Draft
// LinkedIn DM" button. Output persisted to linkedin_drafts (one row per
// lead, upsert) — NOT to AIInsight.

import type {
  Lead,
  Company,
  Campaign,
  ResearchFinding,
  Interaction,
  Opportunity,
  AIInsight,
  LinkedInDraftOutput,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import { buildLeadContext } from './_context'

export async function generateLinkedInDraft(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  opportunities: Opportunity[],
  latestInsight: AIInsight | null,
  campaign?: Campaign | null,
): Promise<LinkedInDraftOutput> {
  requireAnthropic()

  const context = buildLeadContext(lead, company, findings, interactions, opportunities, campaign)

  const analysisBlock = latestInsight
    ? `\n## Existing strategic analysis\nSummary: ${latestInsight.summary}\nWhy now: ${latestInsight.why_now}\nRecommended next action: ${latestInsight.recommended_next_action}\nIntent level: ${latestInsight.intent_level} · Confidence: ${latestInsight.confidence}%`
    : `\n(No prior analysis on file — write the DM from raw context above.)`

  const prompt = `${context}
${analysisBlock}

---

Write ONE LinkedIn DM from Oaki's founder to ${lead.full_name}.

Constraints:
- Very short — 2 to 3 sentences maximum.
- Specific hook tied to their recent work or a real signal.
- No generic opener ("Hope you're well", "Saw your profile", "Loved your post").
- Calm, premium voice. Match LinkedIn's casual register without losing taste.
- One soft ask or one observation — never both.

Return ONLY valid JSON:
{
  "dm": "[the DM body]"
}`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateLinkedInDraft',
  )

  return parseJson<LinkedInDraftOutput>(extractText(response.content))
}
