'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import OppStatusButton from '@/components/today/OppStatusButton'
import OpportunityActionsMenu from './OpportunityActionsMenu'
import { urgencyVariant } from '@/lib/utils'
import type { Opportunity, Lead, Company } from '@/lib/types'

interface Props {
  opp: Opportunity
  lead?: Lead
  company?: Company
}

function scoreColor(score: number): string {
  if (score >= 75) return 'var(--green)'
  if (score >= 50) return 'var(--accent)'
  if (score >= 25) return 'var(--text-muted)'
  return 'var(--text-faint)'
}

export default function OpportunityCard({ opp, lead, company }: Props) {
  const isArchived = opp.status === 'Archived' || opp.status === 'Closed' || opp.status === 'Dismissed'
  const openHref = opp.lead_id ? `/leads/${opp.lead_id}` : `/companies/${opp.company_id}`
  const confidence = Number(opp.confidence) || 0

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px 18px',
        opacity: isArchived ? 0.7 : 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Header: lead/company + prominent score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{lead?.full_name ?? company?.company_name ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {lead && company?.company_name ? company.company_name : null}
            {opp.opportunity_type && (
              <span style={{ marginLeft: lead ? 8 : 0, opacity: 0.85 }}>
                {lead ? '· ' : ''}{opp.opportunity_type}
              </span>
            )}
          </div>
        </div>

        {/* Prominent score */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: scoreColor(confidence), lineHeight: 1 }}>
            {confidence}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Score
          </div>
        </div>
      </div>

      {/* Urgency badge */}
      <div>
        <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
        {opp.status !== 'Open' && opp.status !== 'In Progress' && (
          <span style={{ marginLeft: 6 }}>
            <Badge label={opp.status} variant="muted" />
          </span>
        )}
      </div>

      {/* Summary */}
      {opp.summary && (
        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{opp.summary}</div>
      )}

      {/* Why now block */}
      {opp.why_now && (
        <div style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--accent)', padding: '8px 12px', borderRadius: '0 4px 4px 0' }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Why now</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{opp.why_now}</div>
        </div>
      )}

      {/* Recommended action */}
      {opp.recommended_action && (
        <div style={{ fontSize: 12, color: 'var(--accent)' }}>→ {opp.recommended_action}</div>
      )}

      {/* Action row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
        <Link
          href={openHref}
          style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            background: 'var(--surface-2)',
            padding: '4px 10px',
            borderRadius: 5,
            border: '1px solid var(--border)',
          }}
        >
          Open →
        </Link>
        <OppStatusButton oppId={opp.opportunity_id} status="Contacted" label="Mark contacted" />
        <div style={{ marginLeft: 'auto' }}>
          <OpportunityActionsMenu oppId={opp.opportunity_id} currentStatus={opp.status} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        Added {new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
    </div>
  )
}
