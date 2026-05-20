import type {
  Lead,
  Company,
  Campaign,
  ResearchFinding,
  Interaction,
  MeetingPrepOutput,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import { buildLeadContext } from './_context'

export async function prepareMeetingPrep(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  campaign?: Campaign | null,
): Promise<MeetingPrepOutput> {
  requireAnthropic()

  const context = buildLeadContext(lead, company, findings, interactions, [], campaign)

  const prompt = `${context}

---

Prepare a pre-meeting briefing for Oaki Studio's founder before a discovery call with this contact.

The goal of discovery is to learn: their project pipeline, budget level, marketing goals, pain points in visual communication, and whether there is a fit for Oaki's work.

Return ONLY valid JSON matching this structure:
{
  "company_overview": "2-3 sentences on this company's positioning, aesthetic direction, and relevance to Oaki.",
  "relationship_context": "Honest summary of the relationship history — warmth, previous touchpoints, any open loops.",
  "why_meet_now": "Why this meeting is happening and what a successful outcome looks like for Oaki.",
  "likely_needs": ["Specific visual need 1", "Specific visual need 2", "Specific visual need 3"],
  "budget_questions": ["Budget/scope question 1", "Budget question 2"],
  "pipeline_questions": ["Project pipeline question 1", "Project pipeline question 2", "Project pipeline question 3"],
  "pain_point_questions": ["Pain point question 1", "Pain point question 2"],
  "marketing_goal_questions": ["Marketing goal question 1", "Marketing goal question 2"],
  "portfolio_references_to_show": ["Specific Oaki project type to reference 1", "Reference 2", "Reference 3"],
  "risks": ["Risk or concern to watch for 1", "Risk 2"],
  "recommended_positioning": "In 2-3 sentences: how should Oaki position themselves in this conversation? What angle, tone, and value proposition fits this specific client?"
}`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 2500,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'prepareMeetingPrep',
  )

  return parseJson<MeetingPrepOutput>(extractText(response.content))
}
