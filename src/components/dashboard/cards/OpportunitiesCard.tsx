'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import OppStatusButton from '@/components/today/OppStatusButton'
import { urgencyVariant } from '@/lib/utils'
import type { Lead, Opportunity } from '@/lib/types'

interface Props {
  opportunities: Opportunity[]
  leads: Lead[]
}

const URGENCY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

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
    .slice(0, 6)

  return (
    <section>
      <CardHeader title="Strategic opportunities" count={open.length} href="/opportunities" />
      {open.length === 0 ? (
        <EmptyState label="No open opportunities" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {open.map((opp) => {
            const lead = opp.lead_id ? leadMap.get(opp.lead_id) : undefined
            return (
              <div key={opp.opportunity_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{lead?.full_name ?? opp.lead_id ?? '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                      {lead?.company_name}
                      {opp.opportunity_type && <span style={{ marginLeft: 8, opacity: 0.7 }}>· {opp.opportunity_type}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {Number(opp.confidence) > 0 && (
                      <span style={{ fontSize: 11, color: Number(opp.confidence) >= 75 ? 'var(--green)' : Number(opp.confidence) >= 50 ? 'var(--yellow)' : 'var(--text-faint)' }}>
                        {opp.confidence}%
                      </span>
                    )}
                    <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
                  </div>
                </div>
                {opp.why_now && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{opp.why_now}</div>
                )}
                {opp.recommended_action && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 10 }}>→ {opp.recommended_action}</div>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Link
                    href={opp.lead_id ? `/leads/${opp.lead_id}` : `/companies/${opp.company_id}`}
                    style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)' }}
                  >
                    Open →
                  </Link>
                  <OppStatusButton oppId={opp.opportunity_id} status="Contacted" label="Mark contacted" />
                  <OppStatusButton oppId={opp.opportunity_id} status="Snoozed" label="Snooze" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function CardHeader({ title, count, href }: { title: string; count: number; href?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
        {title}
        {count > 0 && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{count}</span>}
      </h2>
      {href && (
        <Link href={href} style={{ fontSize: 11, color: 'var(--text-faint)' }}>View all →</Link>
      )}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
      {label}
    </div>
  )
}
