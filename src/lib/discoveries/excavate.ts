// On-demand principal excavation (2026-07-06, Workstream B). Resolves a signal
// to its actual developer/designer-of-record: follow the article's attribution,
// then 1–2 targeted web searches, then a Claude pass that writes a
// verified_principal ONLY with a quotable, sourced sentence. This is the one
// move that demonstrably yields (all recent leads came from manually excavating
// a signal to its real developer), so it's a first-class product step — and it
// never promotes a suggested_target_firm without independent evidence.

import { tavilySearch, TavilyError } from '@/lib/prospecting/tavily'
import { excavatePrincipal, type ExcavationSource } from '@/lib/prompts/discoveries/excavate-principal'
import type { VerifiedPrincipal, ExcavationStatus, SuggestedTargetFirm } from '@/lib/types'

export interface ExcavationInput {
  title: string
  project_name?: string | null
  city?: string | null
  country?: string | null
  brief_summary?: string | null
  developer?: string | null
  architect?: string | null
  main_actors?: string[] | null
  source_url: string
  suggested_target_firms?: SuggestedTargetFirm[] | null
}

export interface ExcavationOutcome {
  excavation_status: ExcavationStatus
  verified_principal: VerifiedPrincipal | null
  reasoning: string
}

export async function excavateDiscoveryPrincipal(d: ExcavationInput): Promise<ExcavationOutcome> {
  const subject = (d.project_name?.trim() || d.title).slice(0, 120)
  const place = [d.city, d.country].filter(Boolean).join(', ')
  const queries = [
    `${subject} developer`,
    place ? `${subject} ${place} architect developer` : `${subject} architect`,
  ]

  // Web search is best-effort: a Tavily failure falls back to the article's own
  // attribution rather than aborting — the model can still resolve from that.
  const sources: ExcavationSource[] = []
  try {
    const batches = await Promise.all(queries.map((q) => tavilySearch(q).catch(() => [])))
    const seen = new Set<string>()
    for (const batch of batches) {
      for (const r of batch) {
        if (seen.has(r.url) || sources.length >= 8) continue
        seen.add(r.url)
        sources.push({ title: r.title, url: r.url, content: r.content })
      }
    }
  } catch (err) {
    // Only swallow Tavily's own errors; a programming error should surface.
    if (!(err instanceof TavilyError)) throw err
  }

  const result = await excavatePrincipal(
    {
      title: d.title,
      project_name: d.project_name,
      city: d.city,
      country: d.country,
      brief_summary: d.brief_summary,
      developer: d.developer,
      architect: d.architect,
      main_actors: d.main_actors,
      source_url: d.source_url,
      suggested_firms: (d.suggested_target_firms ?? []).map((f) => f.firm).filter(Boolean),
    },
    sources,
  )

  if (result.resolved && result.firm && result.role) {
    const principal: VerifiedPrincipal = {
      firm: result.firm,
      role: result.role,
      evidence_url: result.evidence_url,
      evidence_quote: result.evidence_quote,
      verified_at: new Date().toISOString(),
      verified_by: 'pipeline',
    }
    return { excavation_status: 'resolved', verified_principal: principal, reasoning: result.reasoning }
  }

  return { excavation_status: 'attempted_unresolved', verified_principal: null, reasoning: result.reasoning }
}
