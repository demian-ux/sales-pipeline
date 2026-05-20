// Score badge for a Discovery (0–100). Color tiers:
//   ≥70 → strong (green)
//   ≥40 → watchlist (gold/accent)
//   <40 → archive (faint)

import { scoreToTier } from '@/lib/discoveries/scoring'

interface ScoreBadgeProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}

const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
  sm: { fontSize: 11, height: 22, padding: '0 6px', minWidth: 26 },
  md: { fontSize: 12, height: 26, padding: '0 8px', minWidth: 32 },
  lg: { fontSize: 14, height: 30, padding: '0 10px', minWidth: 40 },
}

function tierColors(tier: 'strong_opportunity' | 'watchlist' | 'archive'): React.CSSProperties {
  switch (tier) {
    case 'strong_opportunity':
      return { color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid rgba(76,175,134,0.25)' }
    case 'watchlist':
      return { color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid rgba(200,169,110,0.25)' }
    case 'archive':
      return { color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)' }
  }
}

export default function DiscoveryScoreBadge({ score, size = 'md' }: ScoreBadgeProps) {
  const isMissing = score === null || score === undefined
  const tier = isMissing ? 'archive' : scoreToTier(score)
  const colors = tierColors(tier)

  return (
    <span
      title={isMissing ? undefined : `Score ${score}/100`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 'var(--r-sm)',
        fontFamily: 'SF Mono, Fira Code, ui-monospace, monospace',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        flexShrink: 0,
        ...sizeStyles[size],
        ...colors,
      }}
    >
      {isMissing ? '—' : score}
    </span>
  )
}
