// CSV builder for the Prospecting export action. One row per firm, with the
// article context columns repeated so the CSV is self-contained.

import type { ProspectingArticle, FirmCandidate } from '@/lib/types'

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function buildProspectingCsv(article: ProspectingArticle, firms: FirmCandidate[]): string {
  const rows: string[][] = [
    [
      'article_title',
      'article_project_type',
      'article_scale',
      'article_location',
      'firm_name',
      'firm_country',
      'firm_project_type',
      'firm_reference_project',
      'firm_website',
      'firm_score',
    ],
    ...firms.map((firm) => [
      article.title,
      article.project_type,
      article.scale,
      article.location,
      firm.name,
      firm.country,
      firm.project_type,
      firm.reference_project,
      firm.website ?? '',
      String(firm.score),
    ]),
  ]

  return rows.map((row) => row.map(escapeCsv).join(',')).join('\n')
}
