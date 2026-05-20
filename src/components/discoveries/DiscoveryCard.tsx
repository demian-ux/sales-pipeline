'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import DiscoveryScoreBadge from './DiscoveryScoreBadge'
import { scoreToTier, tierLabel } from '@/lib/discoveries/scoring'
import type { Discovery, DiscoverySector } from '@/lib/types'

interface DiscoveryCardProps {
  discovery: Discovery
}

const SECTOR_LABELS: Record<DiscoverySector, string> = {
  hospitality:        'Hospitality',
  luxury_residential: 'Luxury Residential',
  mixed_use:          'Mixed-Use',
  airports:           'Airports',
  office:             'Office',
  transport:          'Transport',
  cultural:           'Cultural',
  retail:             'Retail',
  other:              'Other',
}

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  tender:  'Tender / RFP',
  trend:   'Strategic Trend',
}

export default function DiscoveryCard({ discovery: d }: DiscoveryCardProps) {
  const location = [d.city, d.country].filter(Boolean).join(', ')
  const timeAgo = d.date_published
    ? formatDistanceToNow(new Date(d.date_published), { addSuffix: true })
    : null
  const tier = scoreToTier(d.discovery_score)

  return (
    <Link href={`/discoveries/${d.id}`} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        className="card-clickable"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: 14,
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          opacity: d.status === 'archived' ? 0.45 : 1,
        }}
      >
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <h3 style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 500,
            lineHeight: 1.4,
            color: 'var(--text)',
            margin: 0,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}>
            {d.title}
          </h3>
          <DiscoveryScoreBadge score={d.discovery_score} size="sm" />
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-faint)' }}>
          <span style={{
            fontWeight: 500,
            color: 'var(--text-muted)',
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {d.source}
          </span>
          {timeAgo && (<><Dot />{timeAgo}</>)}
          {location && (<><Dot /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{location}</span></>)}
        </div>

        {/* Summary */}
        {d.brief_summary && (
          <p style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: 0,
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}>
            {d.brief_summary}
          </p>
        )}

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {tier !== 'archive' && (
            <Tag tone={tier === 'strong_opportunity' ? 'green' : 'accent'}>{tierLabel(tier)}</Tag>
          )}
          {d.sector && <Tag>{SECTOR_LABELS[d.sector] ?? d.sector}</Tag>}
          {(d.opportunity_type ?? []).slice(0, 2).map((t) => (
            <Tag key={t} tone="blue">{OPPORTUNITY_TYPE_LABELS[t] ?? t}</Tag>
          ))}
          {d.status === 'saved' && (
            <Tag tone="accent" style={{ marginLeft: 'auto' }}>Saved</Tag>
          )}
        </div>
      </div>
    </Link>
  )
}

function Dot() {
  return <span style={{ color: 'var(--text-faint)', userSelect: 'none' }}>·</span>
}

function Tag({
  children,
  tone = 'default',
  style,
}: {
  children: React.ReactNode
  tone?: 'default' | 'green' | 'accent' | 'blue'
  style?: React.CSSProperties
}) {
  const tones: Record<string, React.CSSProperties> = {
    default: { color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)' },
    green:   { color: 'var(--green)',      background: 'var(--green-dim)', border: '1px solid rgba(76,175,134,0.2)' },
    accent:  { color: 'var(--accent)',     background: 'var(--accent-dim)', border: '1px solid rgba(200,169,110,0.2)' },
    blue:    { color: 'var(--blue)',       background: 'var(--blue-dim)',   border: '1px solid rgba(92,142,212,0.2)' },
  }
  return (
    <span style={{
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 'var(--r-xs)',
      fontWeight: 500,
      ...tones[tone],
      ...style,
    }}>
      {children}
    </span>
  )
}
