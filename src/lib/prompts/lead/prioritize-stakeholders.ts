import type { Lead, Company, StakeholderPrioritizationOutput } from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'

export async function prioritizeStakeholders(
  company: Company,
  leads: Lead[],
): Promise<StakeholderPrioritizationOutput> {
  requireAnthropic()

  const companyContext = [
    `## Company: ${company.company_name}`,
    company.industry && `Industry: ${company.industry}`,
    company.location && `Location: ${company.location}`,
    company.project_type && `Project types: ${company.project_type}`,
    company.brand_positioning && `Positioning: ${company.brand_positioning}`,
    company.architectural_style && `Style: ${company.architectural_style}`,
    company.design_quality_score && `Design quality: ${company.design_quality_score}/10`,
    company.fit_reason && `Why they fit Oaki: ${company.fit_reason}`,
    company.notes && `Notes: ${company.notes}`,
  ].filter(Boolean).join('\n')

  const contactsContext = leads.map((l) => {
    const scores = [
      l.relationship_score && `rel:${l.relationship_score}`,
      l.business_fit_score && `fit:${l.business_fit_score}`,
      l.priority_score && `priority:${l.priority_score}`,
    ].filter(Boolean).join(' ')
    return `- lead_id: ${l.lead_id} | ${l.full_name} | ${l.title ?? 'Unknown title'} | Stage: ${l.pipeline_stage}${scores ? ` | Scores: ${scores}` : ''}${l.notes ? ` | Notes: ${l.notes}` : ''}`
  }).join('\n')

  const prompt = `${companyContext}

## Contacts at this company (${leads.length})
${contactsContext}

---

Oaki Studio creates high-end architectural visualization. Their ideal contact is someone with creative decision-making authority — founders, principals, creative directors, design directors, marketing directors, and development directors at architecture and design firms.

Weak contacts: HR, IT, admin, procurement, generic junior roles.

Rank these contacts from best to worst fit for Oaki's outreach. Evaluate each on:
- stakeholder_influence_score: 0-10, their creative/business decision authority
- creative_alignment_score: 0-10, how aligned their role is with evaluating or commissioning visualization
- relationship_probability_score: 0-10, probability of a warm, productive first contact

Return ONLY valid JSON:
{
  "best_contact_id": "lead_id of the best contact",
  "ranking": [
    {
      "lead_id": "",
      "reason": "1-2 sentence explanation of this ranking",
      "stakeholder_influence_score": 0,
      "creative_alignment_score": 0,
      "relationship_probability_score": 0
    }
  ],
  "recommended_approach": "2-3 sentences on the best entry strategy for Oaki at this company — which contact first, what angle, and why."
}`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'prioritizeStakeholders',
  )

  const parsed = parseJson<Partial<StakeholderPrioritizationOutput>>(extractText(response.content))
  return {
    best_contact_id: parsed.best_contact_id ?? '',
    ranking: Array.isArray(parsed.ranking) ? parsed.ranking : [],
    recommended_approach: parsed.recommended_approach ?? '',
  }
}
