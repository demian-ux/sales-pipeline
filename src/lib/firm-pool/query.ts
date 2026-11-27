// The pool no longer fits in one PostgREST page (2026-11-27: ~2,700 rows once
// every researched firm, including the ones that do not fit, lives in it).
// PostgREST caps a response at 1,000 rows, so anything that needs the whole
// pool — the pool page, the stats — pages through it.

import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE = 1000

/** Every firm_pool row, selected with `columns`, ordered by name. */
export async function selectAllPool<T>(supabase: SupabaseClient, columns: string): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('firm_pool')
      .select(columns)
      .order('name', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { data: [], error }
    all.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return { data: all, error: null }
}
