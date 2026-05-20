import type {
  Lead,
  Company,
  ResearchFinding,
  ResearchExtractionOutput,
} from '@/lib/types'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'

export async function extractResearchSignals(
  rawText: string,
  lead?: Lead | null,
  company?: Company | null,
  existingFindings?: ResearchFinding[],
): Promise<ResearchExtractionOutput> {
  requireAnthropic()

  const contextParts: string[] = []

  if (lead) {
    contextParts.push(`## Prospect context`)
    contextParts.push(`Name: ${lead.full_name}`)
    contextParts.push(`Title: ${lead.title ?? 'Unknown'} at ${lead.company_name}`)
    if (lead.location) contextParts.push(`Location: ${lead.location}`)
    contextParts.push(`Pipeline stage: ${lead.pipeline_stage}`)
    if (lead.relationship_temperature) contextParts.push(`Relationship temperature: ${lead.relationship_temperature}`)
    if (lead.known_pain_points) contextParts.push(`Known pain points: ${lead.known_pain_points}`)
    if (lead.notes) contextParts.push(`Notes: ${lead.notes}`)
    const scores: string[] = []
    if (lead.business_fit_score) scores.push(`Business fit ${lead.business_fit_score}/10`)
    if (lead.taste_score) scores.push(`Taste ${lead.taste_score}/10`)
    if (lead.relationship_score) scores.push(`Relationship ${lead.relationship_score}/10`)
    if (scores.length) contextParts.push(`Scores: ${scores.join(' · ')}`)
  }

  if (company) {
    contextParts.push(`\nCompany: ${company.company_name}`)
    if (company.industry) contextParts.push(`Industry: ${company.industry}`)
    if (company.project_type) contextParts.push(`Project types: ${company.project_type}`)
    if (company.brand_positioning) contextParts.push(`Positioning: ${company.brand_positioning}`)
    if (company.architectural_style) contextParts.push(`Style: ${company.architectural_style}`)
  }

  if (existingFindings?.length) {
    contextParts.push(`\n## Prior research (${existingFindings.length} findings)`)
    existingFindings.slice(-3).forEach((f) => {
      contextParts.push(`- ${f.research_summary}`)
      if (f.signals_detected) contextParts.push(`  Signals: ${f.signals_detected}`)
    })
  }

  const context = contextParts.length ? `${contextParts.join('\n')}\n\n---\n\n` : ''

  const prompt = `${context}## Raw research notes

${rawText}

---

Analyze this research and extract structured intelligence for Oaki Studio.

Return ONLY valid JSON with this exact structure:
{
  "research_summary": "2-3 sentence summary of what was found and why it matters",
  "signals_detected": ["specific signal 1", "specific signal 2"],
  "design_observations": "observations about their design sensibility, aesthetic quality, visual communication",
  "market_positioning": "their market position, brand tier, target segment",
  "visual_identity_notes": "current visual identity — gaps, strengths, opportunity areas",
  "opportunities": [
    {
      "opportunity_type": "New project | Press | Event follow-up | Past client rekindling | Competition | Market expansion | Brand refresh | Manual research | Other",
      "summary": "what the opportunity is",
      "why_now": "the specific signal that makes this timely — must be real, not generic",
      "recommended_action": "concrete next step for Oaki",
      "urgency": "Low | Medium | High",
      "confidence": 0
    }
  ],
  "suggested_next_action": "the single most important thing to do next",
  "suggested_email": "Subject: [subject]\\n\\n[body — short, premium, human, specific. 4-7 sentences. No generic opener.]",
  "suggested_linkedin_dm": "2-3 sentence DM — specific hook, no 'Hope you're well'"
}

Urgency: High = deadline/event/active project window imminent · Medium = real need, no deadline · Low = interesting, no timing signal
Confidence: 80-100 = direct verifiable signals · 50-79 = strong inference · 20-49 = thin signals · <20 = speculative

Only include opportunities with genuine why-now signals. Return an empty array if none exist.`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'extractResearchSignals',
  )

  const parsed = parseJson<Partial<ResearchExtractionOutput>>(extractText(response.content))
  return {
    research_summary: parsed.research_summary ?? '',
    signals_detected: Array.isArray(parsed.signals_detected) ? parsed.signals_detected : [],
    design_observations: parsed.design_observations ?? '',
    market_positioning: parsed.market_positioning ?? '',
    visual_identity_notes: parsed.visual_identity_notes ?? '',
    opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
    suggested_next_action: parsed.suggested_next_action ?? '',
    suggested_email: parsed.suggested_email ?? '',
    suggested_linkedin_dm: parsed.suggested_linkedin_dm ?? '',
  }
}
