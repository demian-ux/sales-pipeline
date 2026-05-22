'use client'

import Link from 'next/link'
import { ScoreBlock, StatusBadge, NextAction, Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import OppStatusButton from '@/components/today/OppStatusButton'
import type { Lead, Opportunity } from '@/lib/types'

interface Props {
  opportunities: Opportunity[]
  leads: Lead[]
}

const URGENCY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }
const URGENCY_TONE: Record<string, 'risk' | 'warn' | 'info'> = {
  High: 'risk',
  Medium: 'warn',
  Low: 'info',
}

export default function OpportunitiesCard({ opportunities, leads }: Props) {
  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  const open = opportunities
    .filter((o) => o.status === 'Open' || o.status === 'In Progress')
    .sort((a, b) => {
      const u = (URGENCY_RANK[a.urgency] ?? 1) - (URGENCY_RANK[b.urgency] ?? 1)
      if (u !== 0) return u
      const c = Number(b.confidence) - Number(a.confidence)
      if (c !== 0) return c
      const aPri = a.lead_id ? Number(leadMap.get(a.lead_id)?.priority_score) || 0 : 0
      const bPri = b.lead_id ? Number(leadMap.get(b.lead_id)?.priority_score) || 0 : 0
      return bPri - aPri
    })
    .slice(0, 4)

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Strategic opportunities</span>
          <span className="card-head-count">{String(open.length).padStart(2, '0')} OPEN</span>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/opportunities">
          View all <Icon name="arrow" size={11} />
        </Link>
      </div>

      {open.length === 0 ? (
        <Empty title="No open opportunities.">They surface here as analysis finds them.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line-subtle)' }}>
          {open.map((o) => {
            const lead = o.lead_id ? leadMap.get(o.lead_id) : undefined
            return (
              <div
                key={o.opportunity_id}
                style={{ background: 'var(--surface)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div className="between" style={{ alignItems: 'flex-start' }}>
                  <div className="col" style={{ gap: 2, minWidth: 0, flex: 1 }}>
                    <div className="ink" style={{ fontSize: 13, fontWeight: 500, letterSpacing: 'var(--t-tight)' }}>
                      {lead?.full_name ?? o.opportunity_type}
                    </div>
                    <div className="ink-3" style={{ fontSize: 11.5 }}>
                      {[lead?.company_name, o.opportunity_type].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <ScoreBlock value={Number(o.confidence) || 0} size="sm" />
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <StatusBadge tone={URGENCY_TONE[o.urgency] ?? 'warn'}>{o.urgency} urgency</StatusBadge>
                </div>
                {o.why_now && (
                  <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.55, maxWidth: '60ch' }}>
                    {o.why_now}
                  </div>
                )}
                {o.recommended_action && <NextAction>{o.recommended_action}</NextAction>}
                <div className="row" style={{ gap: 6, marginTop: 2 }}>
                  <Link
                    className="btn btn-xs"
                    href={o.lead_id ? `/leads/${o.lead_id}` : `/companies/${o.company_id}`}
                  >
                    Open <Icon name="arrow" size={10} />
                  </Link>
                  <OppStatusButton oppId={o.opportunity_id} status="Contacted" label="Mark contacted" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
