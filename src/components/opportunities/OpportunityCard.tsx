'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ScoreBlock, StatusBadge, Pill, WhyNow, NextAction } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import OpportunityActionsMenu from './OpportunityActionsMenu'
import type { Opportunity, Lead, Company } from '@/lib/types'

export interface EnrichedOpportunity extends Opportunity {
  lead?: Lead
  company?: Company
}

interface Props {
  opp: EnrichedOpportunity
  onChanged: () => void
}

const URGENCY_TONE: Record<string, 'risk' | 'warn' | 'info'> = {
  High: 'risk',
  Medium: 'warn',
  Low: 'info',
}

export default function OpportunityCard({ opp, onChanged }: Props) {
  const [marking, setMarking] = useState(false)

  const lead = opp.lead
  const company = opp.company
  const openHref = opp.lead_id ? `/leads/${opp.lead_id}` : `/companies/${opp.company_id}`
  const confidence = Number(opp.confidence) || 0
  const title = lead?.full_name ?? company?.company_name ?? '—'
  // Lifecycle status worth surfacing on the card — Open / In Progress is the
  // implicit default and doesn't need a chip.
  const lifecycle = opp.status !== 'Open' && opp.status !== 'In Progress' ? opp.status : null

  let added: string | null = null
  if (opp.created_at) {
    const dt = new Date(opp.created_at)
    if (!Number.isNaN(dt.getTime())) added = format(dt, 'MMM d')
  }

  async function markContacted() {
    if (marking) return
    setMarking(true)
    try {
      const res = await fetch(`/api/opportunities/${opp.opportunity_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Contacted' }),
      })
      if (res.ok) onChanged()
    } finally {
      setMarking(false)
    }
  }

  return (
    <div
      className="card card-hover"
      style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {/* Header — lead / company / type + score */}
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
          <div className="ink" style={{ fontSize: 14, fontWeight: 500, letterSpacing: 'var(--t-tight)' }}>
            {title}
          </div>
          {lead && company?.company_name && (
            <div className="ink-3" style={{ fontSize: 12 }}>{company.company_name}</div>
          )}
          {opp.opportunity_type && (
            <div className="ink-2" style={{ fontSize: 12, marginTop: 4 }}>{opp.opportunity_type}</div>
          )}
        </div>
        <ScoreBlock value={confidence} />
      </div>

      {/* Status row */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge tone={URGENCY_TONE[opp.urgency] ?? 'warn'}>{opp.urgency} urgency</StatusBadge>
        {lifecycle && <Pill>{lifecycle}</Pill>}
      </div>

      {/* Summary */}
      {opp.summary && (
        <div className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: '64ch' }}>
          {opp.summary}
        </div>
      )}

      {/* Why now */}
      {opp.why_now && <WhyNow>{opp.why_now}</WhyNow>}

      {/* Next action */}
      {opp.recommended_action && <NextAction>{opp.recommended_action}</NextAction>}

      {/* Actions */}
      <div className="between" style={{ marginTop: 4 }}>
        <div className="row" style={{ gap: 6 }}>
          <Link className="btn btn-sm" href={openHref}>
            Open <Icon name="arrow" size={11} />
          </Link>
          <button
            className="btn btn-sm btn-ghost"
            onClick={markContacted}
            disabled={marking}
          >
            <Icon name="check" size={11} /> {marking ? 'Saving…' : 'Mark contacted'}
          </button>
        </div>
        <OpportunityActionsMenu
          oppId={opp.opportunity_id}
          currentStatus={opp.status}
          onChanged={onChanged}
        />
      </div>

      {/* Added footer */}
      {added && (
        <div className="micro" style={{ color: 'var(--ink-4)', marginTop: 2, fontSize: 9.5 }}>
          Added {added}
        </div>
      )}
    </div>
  )
}
