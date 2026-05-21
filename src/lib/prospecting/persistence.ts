// Firm-candidate persistence — bridges the (originally ephemeral) Prospecting
// flow into Supabase's firm_candidates table. Each prospecting run upserts
// its candidates here (dedup by name + article URL); promotion flows mark
// rows as 'promoted'; a future dismiss flow will mark as 'dismissed'.
//
// All functions silently no-op when Supabase isn't configured, so dev
// without Supabase still works (the Dashboard's Candidates card will just
// be empty).

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { FirmCandidate } from '@/lib/types'

export interface PersistFirmCandidatesOptions {
  sourceDiscoveryId?: string  // Discovery UUID when prospecting was triggered from a Discovery
}

// Upsert a batch of candidates from a single prospecting run. Dedup key is
// (name, source_article_url) — re-running on the same article updates the
// existing rows (score, project_type, etc.) rather than creating duplicates.
export async function persistFirmCandidates(
  firms: FirmCandidate[],
  options: PersistFirmCandidatesOptions = {},
): Promise<{ persisted: number }> {
  if (!isSupabaseAdminConfigured() || firms.length === 0) {
    return { persisted: 0 }
  }
  const nowIso = new Date().toISOString()
  const rows = firms.map((f) => ({
    candidate_id:        f.candidate_id,
    name:                f.name,
    country:             f.country,
    project_type:        f.project_type,
    reference_project:   f.reference_project,
    website:             f.website,
    score:               f.score,
    source_article_url:  f.source_article_url,
    source_discovery_id: options.sourceDiscoveryId ?? null,
    status:              'new' as const,
    discovered_at:       f.discovered_at,
    updated_at:          nowIso,
  }))

  const { error, data } = await getSupabaseAdmin()
    .from('firm_candidates')
    .upsert(rows, { onConflict: 'name,source_article_url', ignoreDuplicates: false })
    .select('id')

  if (error) {
    console.error('[prospecting/persistence] upsert error:', error)
    return { persisted: 0 }
  }
  return { persisted: data?.length ?? 0 }
}

// Flip a candidate row to 'promoted' with the new company/opportunity IDs.
// Looked up by (name, source_article_url) — the candidate_id from the
// in-memory FirmCandidate isn't guaranteed to match the persisted row when
// the article was re-run. Silent no-op if Supabase isn't configured.
export async function markCandidatePromoted(
  match: { name: string; source_article_url: string },
  refs: { company_id: string; opportunity_id?: string },
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return
  const { error } = await getSupabaseAdmin()
    .from('firm_candidates')
    .update({
      status:                     'promoted',
      promoted_to_company_id:     refs.company_id,
      promoted_to_opportunity_id: refs.opportunity_id ?? null,
      updated_at:                 new Date().toISOString(),
    })
    .eq('name', match.name)
    .eq('source_article_url', match.source_article_url)
  if (error) {
    console.warn('[prospecting/persistence] markCandidatePromoted error:', error.message)
  }
}

export async function markCandidateDismissed(
  match: { name: string; source_article_url: string },
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return
  const { error } = await getSupabaseAdmin()
    .from('firm_candidates')
    .update({
      status:     'dismissed',
      updated_at: new Date().toISOString(),
    })
    .eq('name', match.name)
    .eq('source_article_url', match.source_article_url)
  if (error) {
    console.warn('[prospecting/persistence] markCandidateDismissed error:', error.message)
  }
}
