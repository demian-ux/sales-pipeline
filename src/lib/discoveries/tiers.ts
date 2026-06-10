// SINGLE SOURCE OF TRUTH for discovery signal tiers.
//
// The stored signal_tier (decided by the analysis model at write time — it's
// what chose keep vs. discard) is authoritative. The numeric score-derived
// tier (scoring.scoreToTier, 70/40) is only a fallback for legacy rows
// without a stored tier. Card badges, filters, and the dashboard must all
// derive the tier through here — previously three different threshold sets
// (85/75, 70/40, 60/75/85) produced contradictory labels for the same row.

import { scoreToTier } from './scoring'
import type { DiscoverySignalTier } from '@/lib/types'

export function discoveryTier(
  score: number | null | undefined,
  stored?: DiscoverySignalTier | null,
): DiscoverySignalTier {
  if (stored) return stored
  return scoreToTier(typeof score === 'number' && !Number.isNaN(score) ? score : null)
}

export const TIER_META: Record<DiscoverySignalTier, { label: string; tone: 'ok' | 'warn' | 'info' }> = {
  strong_opportunity: { label: 'Strong signal', tone: 'ok' },
  watchlist:          { label: 'Watchlist',     tone: 'warn' },
  archive:            { label: 'Archive',       tone: 'info' },
}
