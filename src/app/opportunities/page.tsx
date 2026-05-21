import { getOpportunities, getLeads, getCompanies } from '@/lib/sheets'
import { urgencyVariant, relativeDate } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OpportunitiesPage() {
  const [opportunities, leads, companies] = await Promise.all([
    getOpportunities(),
    getLeads(),
    getCompanies(),
  ])

  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))
  const companyMap = new Map(companies.map((c) => [c.company_id, c]))

  const open = opportunities.filter((o) => o.status === 'Open').sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2 }
    return order[a.urgency] - order[b.urgency]
  })
  const actioned = opportunities.filter((o) => o.status === 'Contacted' || o.status === 'Closed')
  const dismissed = opportunities.filter((o) => o.status === 'Dismissed')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Opportunities</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Research-based reasons to reach out — with a clear why now.
        </p>
      </div>

      {open.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <GroupHeader label="Open" count={open.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {open.map((opp) => {
              const lead = opp.lead_id ? leadMap.get(opp.lead_id) : undefined
              const company = companyMap.get(opp.company_id)
              const href = opp.lead_id ? `/leads/${opp.lead_id}` : `/companies/${opp.company_id}`
              return (
                <Link key={opp.opportunity_id} href={href}>
                  <OppCard opp={opp} lead={lead} company={company} />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {actioned.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <GroupHeader label="Actioned" count={actioned.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {actioned.map((opp) => {
              const lead = opp.lead_id ? leadMap.get(opp.lead_id) : undefined
              const company = companyMap.get(opp.company_id)
              const href = opp.lead_id ? `/leads/${opp.lead_id}` : `/companies/${opp.company_id}`
              return (
                <Link key={opp.opportunity_id} href={href}>
                  <OppCard opp={opp} lead={lead} company={company} muted />
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {open.length === 0 && actioned.length === 0 && (
        <div className="empty-state">
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No opportunities yet.</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Add research findings on a lead to generate opportunities, or run a Claude analysis.</div>
        </div>
      )}
    </div>
  )
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
        {label}
      </h2>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{count}</span>
    </div>
  )
}

function OppCard({
  opp,
  lead,
  company,
  muted,
}: {
  opp: ReturnType<typeof Array.prototype.find> & { urgency: 'High' | 'Medium' | 'Low'; confidence: number; opportunity_type: string; summary: string; why_now: string; recommended_action: string; created_at: string }
  lead: { full_name: string; title?: string } | undefined
  company: { company_name: string } | undefined
  muted?: boolean
}) {
  return (
    <div
      className="hover-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px 18px',
        opacity: muted ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{lead?.full_name ?? '—'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{company?.company_name}</span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>
            {opp.opportunity_type}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{opp.confidence}%</span>
          <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
        </div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 8 }}>{opp.summary}</div>

      <div style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--accent)', padding: '8px 12px', borderRadius: '0 4px 4px 0', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Why now</div>
        <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{opp.why_now}</div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--accent)' }}>→ {opp.recommended_action}</div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>
        Added {new Date(opp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
    </div>
  )
}
