// Email follow-up generator — 100–160 words, references a physical letter
// presumed to have been sent first.

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'
import type { DiscoveryClientType } from '@/lib/types'

export async function generateEmail(
  discoveryTitle: string,
  recipientName: string,
  recipientCompany: string,
  clientType: DiscoveryClientType,
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a brief email follow-up (100–160 words) referencing a physical letter already sent to ${recipientName} at ${recipientCompany}.

The physical letter was about this market signal: "${discoveryTitle}"
Client type: ${clientType.replace('_', ' ')}

Requirements:
- Casual-professional tone consistent with Oaki Studio's brand voice
- Reference the physical letter briefly
- Restate the core opportunity in 1–2 sentences
- One clear, low-pressure call to action
- Do not be salesy
- Format: Subject line, then body

Write the email now:`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateEmail',
  )

  return extractText(response.content).trim()
}
