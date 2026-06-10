// POST /api/prospecting/promote — promote a single FirmCandidate into a
// full Sheets `Company` row. One-way operation. Maps 6 Fase B fields onto
// the richer Company schema; the rest stay empty for Demian to fill in.

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { findOrCreateCompanyByName } from '@/lib/sheets'
import { markCandidatePromoted } from '@/lib/prospecting/persistence'

const BodySchema = z.object({
  firm: z.object({
    name: z.string().min(1),
    country: z.string().min(1),
    project_type: z.string().min(1),
    reference_project: z.string().min(1),
    website: z.string().nullable(),
    score: z.number().int().min(0).max(100),
  }),
  source_article_url: z.string().url(),
  source_article_title: z.string().optional(),
})

// Map Fase B's 0–100 score onto Company.business_fit_score (1–10 scale).
function mapScoreTo10(score100: number): number {
  return Math.max(1, Math.min(10, Math.round(score100 / 10)))
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const { firm, source_article_url, source_article_title } = parsed.data

  const nowIso = new Date().toISOString()
  // The Tavily score is a one-shot prospect-fit signal — preserve it in the
  // notes for reference rather than mapping onto Company.design_quality_score
  // (which describes their aesthetic, not their fit).
  const articleLine = source_article_title
    ? `Article: ${source_article_title} — ${source_article_url}`
    : `Article: ${source_article_url}`
  const provenance = [
    `Promoted from Prospecting (${nowIso.slice(0, 10)}). Prospect score: ${firm.score}/100 (≈${mapScoreTo10(firm.score)}/10).`,
    articleLine,
  ].join('\n')

  try {
    // Find-or-create by name — promoting a firm that already exists in Sheets
    // must NOT create a duplicate Company row (the bulk promote-firms path
    // already worked this way; this path used to blind-append).
    const { company, wasNew } = await findOrCreateCompanyByName(firm.name, {
      website: firm.website ?? undefined,
      location: firm.country,
      project_type: firm.project_type,
      known_projects: firm.reference_project,
      ideal_client_fit: firm.score >= 65,
      notes: provenance,
    })

    // Flip the persisted candidate row to 'promoted' (silent no-op when
    // Supabase isn't configured or the candidate was never persisted).
    await markCandidatePromoted(
      { name: firm.name, source_article_url },
      { company_id: company.company_id },
    )
    return Response.json({ company_id: company.company_id, was_new: wasNew })
  } catch (err) {
    console.error('[prospecting/promote] promote error:', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to create Company' },
      { status: 500 },
    )
  }
}
