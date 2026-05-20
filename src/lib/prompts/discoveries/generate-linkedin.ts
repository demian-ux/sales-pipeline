// LinkedIn connection message generator — max 300 chars, no automation
// implied (per Oaki's "no LinkedIn automation" principle: this generates copy
// only; sending is always manual).

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import { BRAND_VOICE } from '@/lib/prompts/brand'

export async function generateLinkedIn(
  discoveryTitle: string,
  recipientName: string,
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a LinkedIn connection message (maximum 300 characters) referencing a physical letter and email already sent to ${recipientName}.

The letters were about: "${discoveryTitle}"

Requirements:
- Professional, warm, consistent with Oaki Studio's brand voice
- References the prior outreach
- Max 300 characters including spaces
- No hashtags
- One short, natural closing line

Write the message now (nothing else):`

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: BRAND_VOICE,
      messages: [{ role: 'user', content: prompt }],
    }),
    undefined,
    'generateLinkedIn',
  )

  return extractText(response.content).trim().slice(0, 300)
}
