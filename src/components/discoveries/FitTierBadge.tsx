// ICP fit-tier badge. Parallel to DiscoveryScoreBadge (deal score), but for the
// fit axis — 5 distinct colors, so it's a thin custom chip rather than the
// 4-tone StatusBadge. Colors come from FIT_TIER_META in lib/discoveries/icp.ts.

import { FIT_TIER_META } from '@/lib/discoveries/icp'
import type { FitTier } from '@/lib/types'

interface FitTierBadgeProps {
  tier: FitTier
  // When provided, the score is shown inline (e.g. "Prime fit 92").
  score?: number | null
  // Tooltip label before the score (default "ICP fit"). Opportunity Signals
  // pass "Opportunity" since they rank on opportunity_score, not ICP fit.
  scoreLabel?: string
  size?: 'sm' | 'md'
}

export default function FitTierBadge({ tier, score, scoreLabel = 'ICP fit', size = 'sm' }: FitTierBadgeProps) {
  const meta = FIT_TIER_META[tier]
  if (!meta) return null

  return (
    <span
      title={score != null ? `${scoreLabel} ${score}/100` : meta.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: size === 'md' ? 12 : 11,
        fontWeight: 600,
        lineHeight: 1,
        padding: size === 'md' ? '4px 9px' : '3px 7px',
        borderRadius: 'var(--r-sm)',
        color: meta.fg,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.label}
      {score != null && (
        <span
          style={{
            fontFamily: 'SF Mono, ui-monospace, monospace',
            fontVariantNumeric: 'tabular-nums',
            opacity: 0.85,
          }}
        >
          {score}
        </span>
      )}
    </span>
  )
}
