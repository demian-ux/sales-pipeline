// Physical letter generator for a Discovery — 280–350 words, formal, strategic.

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import type { Discovery, DiscoveryClientType } from '@/lib/types'

const CLIENT_CONTEXT: Record<DiscoveryClientType, string> = {
  architecture_firm:     'an architecture and design firm',
  real_estate_developer: 'a real estate developer',
  interior_designer:     'an interior design studio',
  urban_planner:         'an urban planning consultancy',
}

export async function generateLetter(
  discovery: Pick<
    Discovery,
    'title' | 'brief_summary' | 'deep_analysis' | 'city' | 'country' | 'sector' | 'investment_size' | 'main_actors' | 'source_url'
  >,
  recipientName: string,
  recipientCompany: string,
  clientType: DiscoveryClientType,
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a formal physical opportunity letter to be sent by mail to ${recipientName} at ${recipientCompany}, ${CLIENT_CONTEXT[clientType]}.

Market signal:
Title: ${discovery.title}
Location: ${[discovery.city, discovery.country].filter(Boolean).join(', ')}
Sector: ${discovery.sector ?? 'unspecified'}
Investment: ${discovery.investment_size ?? 'not disclosed'}
Key actors: ${(discovery.main_actors ?? []).slice(0, 3).join(', ')}

Summary:
${discovery.brief_summary ?? ''}

Deep context:
${discovery.deep_analysis?.slice(0, 800) ?? ''}

Letter requirements:
- Professional, clear, strategic tone consistent with Oaki Studio's brand voice
- Not salesy, not hype-driven
- Feels like a useful business note from a trusted colleague
- Structured: 1. Opening, 2. Market signal, 3. Why it may matter to the recipient, 4. Opportunity hypothesis, 5. Suggested next step, 6. Soft close
- Length: 280–350 words
- End with: [Sender Name], [Title], [Company], [Date]
- Do not include placeholders in brackets except for the signature line

Write the letter now:`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateLetter',
  )

  return extractText(response.content).trim()
}
