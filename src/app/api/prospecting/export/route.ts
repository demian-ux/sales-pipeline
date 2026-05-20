// POST /api/prospecting/export — returns a CSV download for the article+firms
// selection the user kept (after toggling/discarding).

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { buildProspectingCsv } from '@/lib/prospecting/export'

const FirmSchema = z.object({
  candidate_id: z.string(),
  name: z.string(),
  country: z.string(),
  project_type: z.string(),
  reference_project: z.string(),
  website: z.string().nullable(),
  score: z.number(),
  source_article_url: z.string(),
  discovered_at: z.string(),
})

const ArticleSchema = z.object({
  title: z.string(),
  project_type: z.string(),
  scale: z.string(),
  location: z.string(),
})

const BodySchema = z.object({
  article: ArticleSchema,
  firms: z.array(FirmSchema).min(1).max(100),
})

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

  const csv = buildProspectingCsv(parsed.data.article, parsed.data.firms)
  const fileName = `oaki-prospecting-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}
