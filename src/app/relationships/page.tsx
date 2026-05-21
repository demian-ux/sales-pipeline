import { getLeads, getCompanies, getOpportunities, getInteractions } from '@/lib/sheets'
import { relativeDate, stageVariant, tempVariant, scoreColor } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import type { Lead } from '@/lib/types'

export const dynamic = 'force-dynamic'

const GROUPS = [
  { key: 'anchor', label: 'Anchor Clients', description: 'Current top clients', filter: (l: Lead) => l.pipeline_stage === 'Won' || l.pipeline_stage === 'Nurture' },
  { key: 'warm', label: 'Warm Leads', description: 'Engaged and responsive', filter: (l: Lead) => l.relationship_temperature === 'Warm' && l.pipeline_stage !== 'Won' },
  { key: 'event', label: 'Event Leads', description: 'Met in person at events', filter: (l: Lead) => l.source?.toLowerCase().includes('event') || l.source?.toLowerCase().includes('gala') || l.source?.toLowerCase().includes('conference') },
  { key: 'past', label: 'Past Clients', description: 'Previously worked together', filter: (l: Lead) => l.source === 'Past Client' },
  { key: 'cold', label: 'Cold Prospects', description: 'Outreach not yet started', filter: (l: Lead) => l.pipeline_stage === 'New Lead' },
  { key: 'dormant', label: 'Dormant', description: 'High-value, gone quiet', filter: (l: Lead) => l.pipeline_stage === 'Dormant' || l.relationship_temperature === 'Cold' },
]

export default async function RelationshipsPage() {
  const [leads, companies, opportunities, interactions] = await Promise.all([
    getLeads(),
    getCompanies(),
    getOpportunities(),
    getInteractions(),
  ])

  const companyMap = new Map(companies.map((c) => [c.company_id, c]))

  const assignedIds = new Set<string>()
  const groups = GROUPS.map((g) => {
    const groupLeads = leads.filter((l) => !assignedIds.has(l.lead_id) && g.filter(l))
    groupLeads.forEach((l) => assignedIds.add(l.lead_id))
    return { ...g, leads: groupLeads }
  })

  const unassigned = leads.filter((l) => !assignedIds.has(l.lead_id))

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Relationships</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {leads.length} contacts across {companies.length} companies
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/import/apollo" className="btn">
            Import CSV
          </Link>
          <Link href="/leads/new" className="btn btn-primary">
            + New lead
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.filter((g) => g.leads.length > 0).map((group) => (
          <section key={group.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{group.label}</h2>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{group.description}</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{group.leads.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.leads.map((lead) => {
                const company = companyMap.get(lead.company_id)
                const oppCount = opportunities.filter((o) => o.lead_id === lead.lead_id && o.status === 'Open').length
                const lastInteraction = interactions
                  .filter((i) => i.lead_id === lead.lead_id)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

                return (
                  <Link key={lead.lead_id} href={`/leads/${lead.lead_id}`}>
                    <div
                      className="hover-card"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '240px 160px 120px 80px 100px 100px 1fr',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        marginBottom: 2,
                        gap: 12,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 500 }}>{lead.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.title}</div>
                      </div>
                      <div style={{ fontSize: 12 }}>
                        {/* Plain text — clicking the row navigates to the lead.
                            Server Components can't pass an onClick to a child,
                            which was 500ing this page. To navigate to the
                            company directly, do it from the lead detail. */}
                        <span style={{ color: 'var(--text-muted)' }}>
                          {lead.company_name}
                        </span>
                      </div>
                      <div>
                        <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
                      </div>
                      <div>
                        {lead.relationship_temperature && (
                          <Badge label={lead.relationship_temperature} variant={tempVariant(lead.relationship_temperature)} />
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {relativeDate(lead.last_touch_date)}
                      </div>
                      <div style={{ fontSize: 11 }}>
                        {lead.priority_score !== undefined && (
                          <span style={{ color: scoreColor(lead.priority_score) }}>{lead.priority_score}/10</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {oppCount > 0 && <Badge label={`${oppCount} opp`} variant="accent" />}
                        {lead.next_action && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                            {lead.next_action}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        {unassigned.length > 0 && (
          <section>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Other</h2>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{unassigned.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {unassigned.map((lead) => (
                <Link key={lead.lead_id} href={`/leads/${lead.lead_id}`}>
                  <div className="hover-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 2 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.company_name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDate(lead.last_touch_date)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
