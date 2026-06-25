// One-off backfills for the 2026-06-25 discovery overhaul. Run via the
// auth-guarded route POST /api/discoveries/backfill (it needs the Anthropic
// client + Sheets, which the alias-free tsx scripts can't load). Both are
// idempotent and non-destructive: a promoted/saved row is never archived, and
// a row already carrying an icp_fit_score is skipped.

import { getSupabaseAdmin } from '@/lib/supabase'
import { getCompanies, getOpportunities } from '@/lib/sheets'
import { analyzeArticle } from '@/lib/prompts/discoveries/analyze'
import { computeDiscoveryScore, scoreToTier } from './scoring'
import { computeIcpFit, sectorFitFromSector } from './icp'
import { isInTargetGeo, OUT_OF_GEO_SCORE_CAP } from './target-geo'
import { isDropSignalType } from './signal-type'
import { makeProjectKey } from './project-key'
import { extractDiscoveryEntities, matchEntitiesToCompanies } from './roster-match'
import type { DiscoverySignalTier, Company } from '@/lib/types'

export interface GateBackfillResult {
  scanned: number
  updated: number
  archived: number
  remaining: number
  errors: string[]
  dry_run: boolean
}

// Re-analyze legacy rows (icp_fit_score IS NULL) from their stored content,
// recompute discovery_score + signal_type + ICP fit, and auto-archive off-type
// events — bringing pre-2026-06-16 rows up to the current standard. Processes at
// most `limit` rows per call so it stays inside the function's time budget; call
// repeatedly until `remaining` is 0.
export async function backfillGate(limit = 12, dryRun = false): Promise<GateBackfillResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []

  // Snapshot the company roster once for already_engaged tagging.
  let roster: Pick<Company, 'company_id' | 'company_name'>[] = []
  try {
    roster = (await getCompanies()).map((c) => ({ company_id: c.company_id, company_name: c.company_name }))
  } catch (err) {
    errors.push(`roster load failed (already_engaged left as-is): ${err instanceof Error ? err.message : err}`)
  }

  const countRemaining = async (): Promise<number> => {
    const { count } = await supabase
      .from('discoveries')
      .select('id', { count: 'exact', head: true })
      .is('icp_fit_score', null)
    return count ?? 0
  }
  const remainingBefore = await countRemaining()

  const { data: rows, error } = await supabase
    .from('discoveries')
    .select('id, title, source_url, status, promoted_to_opportunity_id, raw_content, brief_summary, deep_analysis')
    .is('icp_fit_score', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`backfill select failed: ${error.message}`)

  let updated = 0
  let archived = 0

  for (const row of rows ?? []) {
    try {
      const content =
        (row.raw_content as string | null) ||
        [row.brief_summary, row.deep_analysis].filter(Boolean).join('\n\n') ||
        (row.title as string)

      const analysis = await analyzeArticle(row.title as string, content, row.source_url as string)

      let discoveryScore = computeDiscoveryScore(analysis.scores)
      let tier: DiscoverySignalTier = analysis.signal_tier ?? scoreToTier(discoveryScore)
      if (!isInTargetGeo(analysis.region)) {
        discoveryScore = Math.min(discoveryScore, OUT_OF_GEO_SCORE_CAP)
        if (tier === 'strong_opportunity') tier = 'watchlist'
      }

      // Note: re-analysis can emit a different signal_type than the original
      // ingestion (Claude sampling) — the explicit prompt + 'other' default make
      // a KEEP→DROP flip rare, and a flipped row only changes status (auditable
      // in Archived), never deleted.
      const isDrop = isDropSignalType(analysis.signal_type)
      const sectorFit = sectorFitFromSector(analysis.sector)
      const icp = computeIcpFit({
        signal_type: analysis.signal_type,
        tenure: analysis.tenure,
        has_for_sale_residential: analysis.has_for_sale_residential,
        project_stage: analysis.project_stage,
        sector_fit: sectorFit,
        viz_buyer_role: analysis.viz_buyer_role,
        est_scale_vs_floor: analysis.est_scale_vs_floor,
        incumbent_viz: analysis.incumbent_viz,
        region: analysis.region,
      })
      const engaged = roster.length
        ? matchEntitiesToCompanies(extractDiscoveryEntities(analysis), roster)
        : null

      // Never archive a promoted/saved row. A promotion sets status='saved', but
      // guard on promoted_to_opportunity_id too in case status drifted.
      const shouldArchive =
        (isDrop || tier === 'archive') &&
        row.status === 'active' &&
        !row.promoted_to_opportunity_id
      const nextStatus = shouldArchive ? 'archived' : (row.status as string)

      if (!dryRun) {
        const { error: updErr } = await supabase
          .from('discoveries')
          .update({
            region: analysis.region,
            city: analysis.city,
            country: analysis.country,
            sector: analysis.sector,
            signal_type: analysis.signal_type,
            project_name: analysis.project_name,
            project_key: makeProjectKey(analysis.project_name, analysis.city),
            signal_tier: tier,
            discovery_score: discoveryScore,
            score_opportunity_clarity: analysis.scores.opportunity_clarity,
            score_investment_size:     analysis.scores.investment_size,
            score_timing:              analysis.scores.timing,
            score_actors:              analysis.scores.actors,
            score_sector_growth:       analysis.scores.sector_growth,
            score_region_strategic:    analysis.scores.region_strategic,
            tenure: analysis.tenure,
            has_for_sale_residential: analysis.has_for_sale_residential,
            project_stage: analysis.project_stage,
            sector_fit: sectorFit,
            viz_buyer_role: analysis.viz_buyer_role,
            viz_buyer_entity: analysis.viz_buyer_entity,
            incumbent_viz: analysis.incumbent_viz,
            est_scale_vs_floor: analysis.est_scale_vs_floor,
            icp_fit_score: icp.icp_fit_score,
            fit_tier: icp.fit_tier,
            fit_reason: icp.fit_reason,
            partner_radar: icp.partner_radar,
            already_engaged: !!engaged,
            engaged_company_id: engaged?.company_id ?? null,
            engaged_company_name: engaged?.company_name ?? null,
            status: nextStatus,
          })
          .eq('id', row.id)
        if (updErr) {
          errors.push(`update ${row.id}: ${updErr.message}`)
          continue
        }
      }

      updated++
      if (shouldArchive) archived++
    } catch (err) {
      errors.push(`${String(row.id).slice(0, 8)} "${String(row.title).slice(0, 40)}": ${err instanceof Error ? err.message : err}`)
    }
  }

  // Re-query the live NULL-icp count so progress reflects reality regardless of
  // per-row errors (errored rows stay NULL and will be retried next call). In
  // dry-run nothing was written, so the before-count still holds.
  const remaining = dryRun ? remainingBefore : await countRemaining()

  return {
    scanned: rows?.length ?? 0,
    updated,
    archived,
    remaining,
    errors,
    dry_run: dryRun,
  }
}

export interface LinksBackfillResult {
  opportunities_with_provenance: number
  updated: number
  errors: string[]
  dry_run: boolean
}

// Backfill promoted_to_opportunity_id on discoveries from the Sheets side. Each
// Opportunity carries discovered_from_id pointing at its source Discovery; older
// promotions (before the reverse-link shipped) left the Discovery's
// promoted_to_opportunity_id NULL. Write it back where missing.
export async function backfillPromotedLinks(dryRun = false): Promise<LinksBackfillResult> {
  const supabase = getSupabaseAdmin()
  const errors: string[] = []

  let opportunities: Awaited<ReturnType<typeof getOpportunities>> = []
  try {
    opportunities = await getOpportunities()
  } catch (err) {
    errors.push(`opportunities load failed: ${err instanceof Error ? err.message : err}`)
    return { opportunities_with_provenance: 0, updated: 0, errors, dry_run: dryRun }
  }
  const withProvenance = opportunities.filter((o) => o.discovered_from_id)

  let updated = 0
  for (const opp of withProvenance) {
    if (dryRun) continue
    const { data, error } = await supabase
      .from('discoveries')
      .update({ promoted_to_opportunity_id: opp.opportunity_id })
      .eq('id', opp.discovered_from_id as string)
      .is('promoted_to_opportunity_id', null)
      .select('id')
    if (error) {
      errors.push(`opp ${opp.opportunity_id} → discovery ${opp.discovered_from_id}: ${error.message}`)
      continue
    }
    if (data && data.length > 0) updated++
  }

  return {
    opportunities_with_provenance: withProvenance.length,
    updated,
    errors,
    dry_run: dryRun,
  }
}
