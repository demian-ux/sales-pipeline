// LinkedIn connection message generator — max 300 chars, no automation
// implied (per Oaki's "no LinkedIn automation" principle: this generates copy
// only; sending is always manual). Receives real signal context and an
// explicit sequence position instead of assuming prior letter + email.

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import {
  BRAND_VOICE,
  SENDER,
  sequenceNote,
  type SequencePosition,
} from '@/lib/prompts/brand'
import type { LetterDiscoveryContext } from './generate-letter'

export async function generateLinkedIn(
  discovery: Pick<LetterDiscoveryContext, 'title' | 'brief_summary' | 'city' | 'country' | 'sector'>,
  recipientName: string,
  position: SequencePosition = 'after_letter_email',
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a LinkedIn connection message (maximum 290 characters including spaces) from ${SENDER.name} of ${SENDER.company} (${SENDER.discipline}) to ${recipientName}.

${sequenceNote(position)}

The signal this outreach is about:
"${discovery.title}"
${[discovery.city, discovery.country].filter(Boolean).join(', ')}${discovery.sector ? ` · ${discovery.sector}` : ''}
${discovery.brief_summary?.slice(0, 200) ?? ''}

Requirements:
- Professional, warm, consistent with Oaki Studio's brand voice
- Reference the signal specifically, in the recipient's terms
- Maximum 290 characters including spaces — count carefully
- Written in English; no hashtags, no placeholders
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

  const text = extractText(response.content).trim()
  if (text.length <= 300) return text
  // Over-length safety: trim at the last word boundary inside the limit
  // instead of cutting mid-word.
  const cut = text.slice(0, 300)
  const lastSpace = cut.lastIndexOf(' ')
  return lastSpace > 200 ? cut.slice(0, lastSpace) : cut
}
