// Principal excavation prompt (2026-07-06, Workstream B). Given a discovery's
// own attribution plus a handful of web-search snippets, resolve the actual
// developer/designer-of-record — the entity that will commission the work — and
// return it ONLY with a quotable, sourced sentence. This is what all recent
// yield came from (manually excavating a signal to its real developer); this
// encodes that step. It never promotes an unverified suggested firm: no
// quotable independent evidence → resolved:false.

import { z } from 'zod'
import { ai, MODEL, requireAnthropic } from '@/lib/ai/client'
import { parseJson, extractText } from '@/lib/ai/parse'
import { withTimeout } from '@/lib/ai/timeout'
import type { PrincipalRole } from '@/lib/types'

export interface ExcavatedPrincipal {
  resolved: boolean
  firm: string | null
  role: PrincipalRole | null
  evidence_quote: string | null
  evidence_url: string | null
  reasoning: string
}

export interface ExcavationSource {
  title: string
  url: string
  content: string
}

const SYSTEM = `You resolve the DEVELOPER-OF-RECORD (or engaged designer/operator) behind a real-estate or design signal, for a studio that sells editorial visualization and must reach the actual decision-maker.

Your only job: name the entity that is actually developing / commissioning / building the project — the "principal" — and back it with a QUOTABLE, SOURCED sentence. You must return ONLY valid JSON. No prose, no markdown.

RULES — read carefully:
• Follow the article's OWN attribution first (a developer/architect/operator it names), then corroborate or extend it with the web-search snippets provided.
• role: "developer" = the entity developing/building/financing-to-build the project · "designer" = the architecture/interior-design studio engaged on it · "operator" = the hotel brand/operator running it. Pick the one that best fits the resolved principal (prefer developer when a developer is identifiable).
• resolved = true ONLY when ALL of these hold: (1) a specific named firm, (2) a quotable evidence SENTENCE that states its role on THIS project, and (3) a source URL for that sentence. Otherwise resolved = false.
• A firm that merely appears in a list of "candidate firms" or a directory result — with no sentence tying it to THIS project — is NOT resolved. Never promote a mere suggestion to resolved.
• If the snippets conflict or are generic, prefer resolved = false with a short reasoning over guessing.
• evidence_quote must be copied from the article or a snippet, not paraphrased. evidence_url must be the source it came from.`

function userPrompt(
  signal: {
    title: string
    project_name?: string | null
    city?: string | null
    country?: string | null
    brief_summary?: string | null
    developer?: string | null
    architect?: string | null
    main_actors?: string[] | null
    source_url: string
    suggested_firms?: string[]
  },
  sources: ExcavationSource[],
): string {
  const attribution = [
    signal.developer ? `Article names developer: ${signal.developer}` : null,
    signal.architect ? `Article names architect: ${signal.architect}` : null,
    signal.main_actors?.length ? `Other named actors: ${signal.main_actors.join(', ')}` : null,
    signal.suggested_firms?.length ? `Unverified suggested firms (do NOT trust without evidence): ${signal.suggested_firms.join(', ')}` : null,
  ].filter(Boolean).join('\n')

  const snippets = sources.length
    ? sources.map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`).join('\n\n')
    : '(no web results — rely on the article attribution only, and be conservative)'

  return `Resolve the developer-of-record (or engaged designer/operator) for this signal.

SIGNAL
Title: ${signal.title}
Project: ${signal.project_name ?? '(unnamed)'}
Location: ${[signal.city, signal.country].filter(Boolean).join(', ') || '(unstated)'}
Summary: ${signal.brief_summary ?? '(none)'}
Source: ${signal.source_url}

ATTRIBUTION FROM THE ARTICLE
${attribution || '(none stated)'}

WEB SEARCH SNIPPETS
${snippets}

Return this exact JSON (replace values):
{
  "resolved": true | false,
  "firm": "the principal firm's name, or null",
  "role": "developer" | "designer" | "operator" | null,
  "evidence_quote": "the exact sentence that ties this firm to this project, copied verbatim, or null",
  "evidence_url": "the source URL for that sentence, or null",
  "reasoning": "1 sentence on why resolved/unresolved"
}`
}

const Schema = z.object({
  resolved: z.boolean().catch(false),
  firm: z.string().nullable().catch(null),
  role: z.enum(['developer', 'designer', 'operator']).nullable().catch(null),
  evidence_quote: z.string().nullable().catch(null),
  evidence_url: z.string().nullable().catch(null),
  reasoning: z.string().catch(''),
})

// Throws on API error / timeout / unparseable JSON — the caller treats a throw
// as a soft failure (excavation attempted, unresolved), never a crash.
export async function excavatePrincipal(
  signal: Parameters<typeof userPrompt>[0],
  sources: ExcavationSource[],
): Promise<ExcavatedPrincipal> {
  requireAnthropic()

  const response = await withTimeout(
    ai.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(signal, sources) }],
    }),
    undefined,
    'excavatePrincipal',
  )

  const parsed = parseJson(extractText(response.content), Schema) as ExcavatedPrincipal

  // Enforce the "quotable + sourced" contract in code — a model can't relax it:
  // resolved requires a firm, an evidence sentence, and a source URL.
  if (parsed.resolved && (!parsed.firm || !parsed.evidence_quote || !parsed.evidence_url)) {
    return { ...parsed, resolved: false, reasoning: parsed.reasoning || 'Missing quotable sourced evidence' }
  }
  return parsed
}
