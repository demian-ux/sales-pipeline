// Title heuristic per firm category (handoff §2.3). The FIRST category on the
// firm that has a mapping wins; search titles are passed to Apollo people/search
// and the ranker prefers earlier titles in the list.

import type { WorkCategory } from '@/lib/types'

const TITLES_BY_CATEGORY: Partial<Record<WorkCategory, string[]>> = {
  interior_design:     ['design principal', 'creative director', 'founder', 'principal'],
  hospitality_design:  ['design principal', 'creative director', 'founder', 'principal'],
  architecture:        ['partner', 'founder', 'director', 'principal'],
  new_dev_marketing:   ['head of marketing', 'sales director', 'marketing director'],
  development:         ['development director', 'vp development', 'marketing director', 'director of development'],
}

const FALLBACK = ['founder', 'principal', 'partner', 'director']

export function titlesForCategories(categories: string[]): string[] {
  for (const c of categories) {
    const t = TITLES_BY_CATEGORY[c as WorkCategory]
    if (t) return t
  }
  return FALLBACK
}

/** Rank candidates: earlier title match in the heuristic list wins. */
export function rankByTitle<T extends { title: string | null }>(candidates: T[], titles: string[]): T[] {
  const score = (t: string | null): number => {
    if (!t) return titles.length + 1
    const lower = t.toLowerCase()
    const idx = titles.findIndex((k) => lower.includes(k))
    return idx === -1 ? titles.length : idx
  }
  return [...candidates].sort((a, b) => score(a.title) - score(b.title))
}
