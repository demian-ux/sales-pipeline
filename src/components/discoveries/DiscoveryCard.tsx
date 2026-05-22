import Link from 'next/link'
import { format } from 'date-fns'
import { ScoreBlock, StatusBadge, Pill } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
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

// Signal tier derived from the 0–100 discovery score, per the design handoff.
function signalTier(score: number): { label: string; tone: 'ok' | 'warn' | 'info' } {
  if (score >= 85) return { label: 'Strong signal', tone: 'ok' }
  if (score >= 75) return { label: 'Solid signal', tone: 'warn' }
  return { label: 'Watch', tone: 'info' }
}

export default function DiscoveryCard({ discovery: d }: DiscoveryCardProps) {
  const tier = signalTier(d.discovery_score)

  const rawDate = d.date_published || d.created_at
  let added: string | null = null
  if (rawDate) {
    const dt = new Date(rawDate)
    if (!Number.isNaN(dt.getTime())) added = format(dt, 'MMM d')
  }

  const types = (d.opportunity_type ?? [])
    .map((t) => OPPORTUNITY_TYPE_LABELS[t] ?? t)
    .join(' · ')

  return (
    <div
      className="card card-hover"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* Header — title + source / score */}
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <Link
            href={`/discoveries/${d.id}`}
            className="ink"
            style={{
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.012em',
              lineHeight: 1.35,
              textWrap: 'pretty',
            }}
          >
            {d.title}
          </Link>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            <span className="micro" style={{ color: 'var(--ink-2)' }}>{d.source}</span>
            {added && <span className="ink-3" style={{ fontSize: 11 }}>· {added}</span>}
          </div>
        </div>
        <ScoreBlock value={d.discovery_score} />
      </div>

      {/* Signal tier + facets */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge tone={tier.tone}>{tier.label}</StatusBadge>
        <Pill>{SECTOR_LABELS[d.sector] ?? d.sector}</Pill>
        {d.region && <Pill>{d.region}</Pill>}
        {d.city && <Pill>{d.city}</Pill>}
      </div>

      {/* Summary */}
      {d.brief_summary && (
        <div className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: '64ch' }}>
          {d.brief_summary}
        </div>
      )}

      {/* Footer — type + actions */}
      <div className="between" style={{ marginTop: 4 }}>
        <span className="ink-3" style={{ fontSize: 11.5 }}>{types || '—'}</span>
        <div className="row" style={{ gap: 6 }}>
          <a
            className="btn btn-xs btn-ghost"
            href={d.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={11} /> Source
          </a>
          <Link className="btn btn-xs" href={`/discoveries/${d.id}`}>
            Convert to opportunity <Icon name="arrow" size={10} />
          </Link>
        </div>
      </div>
    </div>
  )
}
