// Email generator for a Discovery — 100–160 words. Receives the same full
// signal context as the letter (it used to get only the title, which forced
// the model to bluff the "why now"), and an explicit sequence position
// instead of always assuming a letter was already sent.

import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import {
  BRAND_VOICE,
  SENDER,
  sequenceNote,
  type SequencePosition,
} from '@/lib/prompts/brand'
import { discoveryContextBlock, type LetterDiscoveryContext } from './generate-letter'
import type { DiscoveryClientType } from '@/lib/types'

export async function generateEmail(
  discovery: LetterDiscoveryContext,
  recipientName: string,
  recipientCompany: string,
  clientType: DiscoveryClientType,
  position: SequencePosition = 'after_letter',
): Promise<string> {
  requireAnthropic()

  const prompt = `Write a brief outreach email (100–160 words) from ${SENDER.name} (${SENDER.title} of ${SENDER.company}, ${SENDER.discipline}) to ${recipientName} at ${recipientCompany} (${clientType.replace(/_/g, ' ')}).

${sequenceNote(position)}

${discoveryContextBlock(discovery)}

Requirements:
- Calm-professional tone consistent with Oaki Studio's brand voice
- Open with the recipient's signal — the project/news above — not with Oaki
- State the core opportunity in 1–2 sentences
- One clear, low-pressure call to action (e.g. a short walkthrough or 20-minute call)
- Written in English; no placeholders — sign off as ${SENDER.name}, ${SENDER.company}
- Format: a "Subject:" line, then the body

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
