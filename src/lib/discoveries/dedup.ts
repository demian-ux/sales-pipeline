// Project-level dedup + reject-resurrection guard (2026-07-14).
//
// Two failure modes this closes, both observed in the 14 Jul feed:
//
//   1. The same development arriving via several outlets surfaced several times
//      (Park Hyatt London ×4, Wolseley NYC ×3, National Gallery ×3), and the same
//      story could live as BOTH an active launch and an active signal (Anantara
//      Miami). The old check was scoped to one kind and to non-archived rows.
//
//   2. A project we already REJECTED came back as a fresh active item at a high
//      score (BAI Capital's ALMA — EB-5 student housing mislabeled luxury —
//      rejected in May, re-ingested in July; the trap burned two runs). A verdict
//      is a judgment about the PROJECT, not about the article that carried it, so
//      it has to outlive the article.
//
// The rule: a verdict of `rejected` / `already_engaged` on a project is inherited
// by every later article about that project, regardless of status or kind. A
// prior row that was merely archived as off-type (a DROP) carries no verdict —
// that's a judgment about the article — so a genuine later launch signal for the
// same project is still allowed through.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PriorDiscovery {
  id: string
  status: string
  work_status: string | null
  discovery_kind: string | null
  title: string | null
}

// A verdict on the project itself. Any later article about it inherits this
// instead of landing on the board as new material.
const INHERITED_VERDICTS = ['rejected', 'already_engaged']

/**
 * Find an existing discovery for this project — across every board status and
 * BOTH discovery kinds. Prefers a row carrying an inherited verdict, so the
 * caller sees the rejection rather than an incidental duplicate.
 *
 * Matches the full 'name|city' key and the bare 'name' key, so a project filed
 * once with a city and once without still collapses to one row.
 */
export async function findPriorDiscovery(
  supabase: SupabaseClient,
  projectKey: string,
): Promise<PriorDiscovery | null> {
  const keys = [projectKey]
  const bare = projectKey.split('|')[0]
  if (bare && bare !== projectKey) keys.push(bare)

  const { data, error } = await supabase
    .from('discoveries')
    .select('id, status, work_status, discovery_kind, title')
    .in('project_key', keys)
    .limit(10)

  if (error || !data?.length) return null

  const verdicted = data.find((r) => INHERITED_VERDICTS.includes(r.work_status ?? ''))
  if (verdicted) return verdicted as PriorDiscovery
  const live = data.find((r) => r.status !== 'archived')
  return (live ?? null) as PriorDiscovery | null
}

/** Does this prior row carry a verdict a new article must inherit? */
export function hasInheritedVerdict(prior: PriorDiscovery): boolean {
  return INHERITED_VERDICTS.includes(prior.work_status ?? '')
}

/**
 * Record a later article about a project we already hold as a note on the
 * existing row, rather than dropping it on the floor. Best-effort: provenance is
 * never a reason to fail an ingest, and the column may predate the migration.
 */
export async function noteDuplicateUrl(
  supabase: SupabaseClient,
  id: string,
  url: string,
): Promise<void> {
  try {
    const { data, error: readErr } = await supabase
      .from('discoveries')
      .select('duplicate_urls')
      .eq('id', id)
      .maybeSingle()
    if (readErr || !data) return

    const existing: string[] = data.duplicate_urls ?? []
    if (existing.includes(url) || existing.length >= 20) return

    const { error } = await supabase
      .from('discoveries')
      .update({ duplicate_urls: [...existing, url] })
      .eq('id', id)
    if (error && error.code !== '42703') {
      console.warn('[dedup] noteDuplicateUrl warning:', error.message)
    }
  } catch (err) {
    console.warn('[dedup] noteDuplicateUrl failed:', err instanceof Error ? err.message : err)
  }
}
