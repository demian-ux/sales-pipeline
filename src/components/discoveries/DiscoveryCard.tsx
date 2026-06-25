'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ScoreBlock, StatusBadge, Pill } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import { discoveryTier, TIER_META } from '@/lib/discoveries/tiers'
import FitTierBadge from '@/components/discoveries/FitTierBadge'
import { SIGNAL_TYPE_LABELS } from '@/lib/discoveries/signal-type'
import type { Discovery, DiscoverySector } from '@/lib/types'

interface DiscoveryCardProps {
  discovery: Discovery
  // Triage wiring (optional — the card renders read-only without it)
  selected?: boolean
  onToggleSelect?: () => void
  onStatusChange?: (id: string, status: 'saved' | 'archived' | 'active') => Promise<void> | void
  isNew?: boolean
}

const SECTOR_LABELS: Record<DiscoverySector, string> = {
  hospitality:          'Hospitality',
  aviation_hospitality: 'Aviation / Lounges',
  luxury_residential:   'Luxury Residential',
  mixed_use:            'Mixed-Use',
  airports:             'Airport infra',
  office:               'Office',
  transport:            'Transport',
  cultural:             'Cultural / Civic',
  retail:               'Retail',
  other:                'Other',
}

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  tender:  'Tender / RFP',
  trend:   'Strategic Trend',
}

// Shown on the card only for an actionable buyer (a real person/role to reach);
// 'none_identified' is left to the why-line so the card stays uncluttered.
const VIZ_BUYER_LABELS: Record<string, string> = {
  developer_marketing: 'Dev marketing',
  developer_principal: 'Principal',
  architect:           'Architect',
  broker:              'Broker',
}

export default function DiscoveryCard({
  discovery: d,
  selected,
  onToggleSelect,
  onStatusChange,
  isNew,
}: DiscoveryCardProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const tier = TIER_META[discoveryTier(d.discovery_score, d.signal_tier)]

  const rawDate = d.date_published || d.created_at
  let added: string | null = null
  if (rawDate) {
    const dt = new Date(rawDate)
    if (!Number.isNaN(dt.getTime())) added = format(dt, 'MMM d')
  }

  const types = (d.opportunity_type ?? [])
    .map((t) => OPPORTUNITY_TYPE_LABELS[t] ?? t)
    .join(' · ')

  async function setStatus(status: 'saved' | 'archived' | 'active') {
    if (!onStatusChange || busy) return
    setBusy(status)
    try {
      await onStatusChange(d.id, status)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="card card-hover"
      style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        borderColor: selected ? 'var(--accent)' : undefined,
        opacity: d.status === 'archived' ? 0.55 : 1,
      }}
    >
      {/* Header — select + title + source / score */}
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 10, alignItems: 'flex-start', minWidth: 0, flex: 1 }}>
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              aria-label="Select discovery"
              style={{ marginTop: 3, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
            />
          )}
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
              {isNew && (
                <span className="micro" style={{ color: 'var(--accent)' }}>NEW</span>
              )}
              <span className="micro" style={{ color: 'var(--ink-2)' }}>{d.source}</span>
              {added && <span className="ink-3" style={{ fontSize: 11 }}>· {added}</span>}
            </div>
          </div>
        </div>
        <ScoreBlock value={d.discovery_score} />
      </div>

      {/* Fit tier + signal tier + facets */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {d.fit_tier && <FitTierBadge tier={d.fit_tier} score={d.icp_fit_score} />}
        {d.already_engaged && (
          <span
            title={d.engaged_company_name ? `Already in your CRM: ${d.engaged_company_name}` : 'Already a worked firm in your CRM'}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--blue)',
              background: 'var(--blue-dim)',
              border: '1px solid rgba(92,142,212,0.25)',
              borderRadius: 'var(--r-xs)',
              padding: '2px 6px',
            }}
          >
            ◆ Existing account
          </span>
        )}
        {d.signal_type && SIGNAL_TYPE_LABELS[d.signal_type] && (
          <Pill>{SIGNAL_TYPE_LABELS[d.signal_type]}</Pill>
        )}
        {d.incumbent_viz && (
          <span
            title={`Incumbent visualization vendor: ${d.incumbent_viz}`}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              border: '1px solid rgba(200,169,110,0.3)',
              borderRadius: 'var(--r-xs)',
              padding: '2px 6px',
            }}
          >
            ⚑ Incumbent
          </span>
        )}
        {d.viz_buyer_role && VIZ_BUYER_LABELS[d.viz_buyer_role] && (
          <Pill>{VIZ_BUYER_LABELS[d.viz_buyer_role]}</Pill>
        )}
        <StatusBadge tone={tier.tone}>{tier.label}</StatusBadge>
        {d.status === 'saved' && <Pill tone="gold">Saved</Pill>}
        <Pill>{SECTOR_LABELS[d.sector] ?? d.sector}</Pill>
        {d.region && <Pill>{d.region}</Pill>}
        {d.city && <Pill>{d.city}</Pill>}
      </div>

      {/* Why-fit / why-not — the dimension that moved the fit score most */}
      {d.fit_reason && (
        <div className="ink-3" style={{ fontSize: 11.5, lineHeight: 1.5, fontStyle: 'italic' }}>
          {d.fit_reason}
        </div>
      )}

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
          {onStatusChange && d.status !== 'saved' && (
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setStatus('saved')}
              disabled={!!busy}
              title="Keep this on the saved shortlist"
            >
              {busy === 'saved' ? '…' : 'Save'}
            </button>
          )}
          {onStatusChange && d.status !== 'archived' && (
            <button
              className="btn btn-xs btn-ghost"
              onClick={() => setStatus('archived')}
              disabled={!!busy}
              title="Archive — not relevant"
            >
              {busy === 'archived' ? '…' : 'Archive'}
            </button>
          )}
          <a
            className="btn btn-xs btn-ghost"
            href={d.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={11} /> Source
          </a>
          <Link className="btn btn-xs" href={`/discoveries/${d.id}`}>
            Open <Icon name="arrow" size={10} />
          </Link>
        </div>
      </div>
    </div>
  )
}
