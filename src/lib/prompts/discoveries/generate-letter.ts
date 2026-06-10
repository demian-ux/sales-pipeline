// Physical letter generator for a Discovery — 280–350 words, formal, strategic.
// Signed with the real sender identity (no bracket placeholders to hand-edit).

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE, SENDER, senderSignature } from '@/lib/prompts/brand'
import type { Discovery, DiscoveryClientType } from '@/lib/types'

const CLIENT_CONTEXT: Record<DiscoveryClientType, string> = {
  architecture_firm:     'an architecture and design firm',
  real_estate_developer: 'a real estate developer',
  interior_designer:     'an interior design studio',
  urban_planner:         'an urban planning consultancy',
}

export type LetterDiscoveryContext = Pick<
  Discovery,
  'title' | 'brief_summary' | 'deep_analysis' | 'city' | 'country' | 'sector' | 'investment_size' | 'main_actors' | 'source_url'
>

export function discoveryContextBlock(d: LetterDiscoveryContext): string {
  return `Market signal:
Title: ${d.title}
Location: ${[d.city, d.country].filter(Boolean).join(', ') || 'not specified'}
Sector: ${d.sector ?? 'unspecified'}
Investment: ${d.investment_size ?? 'not disclosed'}
Key actors: ${(d.main_actors ?? []).slice(0, 3).join(', ') || 'not named'}

Summary:
${d.brief_summary ?? ''}

Deep context:
${d.deep_analysis?.slice(0, 800) ?? ''}`
}

export async function generateLetter(
  discovery: LetterDiscoveryContext,
  recipientName: string,
  recipientCompany: string,
  clientType: DiscoveryClientType,
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a formal physical opportunity letter, to be sent by mail, from ${SENDER.name} (${SENDER.title} of ${SENDER.company}, a studio specializing in ${SENDER.discipline}) to ${recipientName} at ${recipientCompany}, ${CLIENT_CONTEXT[clientType]}.

${discoveryContextBlock(discovery)}

Letter requirements:
- Professional, clear, strategic tone consistent with Oaki Studio's brand voice
- Not salesy, not hype-driven
- Feels like a useful business note from a trusted colleague
- Structured: 1. Opening, 2. Market signal, 3. Why it may matter to the recipient, 4. Opportunity hypothesis, 5. Suggested next step, 6. Soft close
- Length: 280–350 words
- Written in English
- No placeholders of any kind — the letter must be ready to print and mail as-is
- End with exactly this signature block:
${senderSignature()}

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
