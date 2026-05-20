import { getLeads, getResearchFindings } from '@/lib/sheets'
import ResearchIngestForm from '@/components/research/ResearchIngestForm'
import { relativeDate } from '@/lib/utils'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ResearchInboxPage() {
  const [leads, allFindings] = await Promise.all([
    getLeads(),
    getResearchFindings(),
  ])

  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  const recentFindings = [...allFindings]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Research Inbox</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Paste raw research. Claude extracts signals, scores opportunities, and drafts outreach.
        </p>
      </div>

      <ResearchIngestForm leads={leads} />

      {recentFindings.length > 0 && (
        <div style={{ marginTop: 36 }}>
          <div className="section-label">Recent findings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentFindings.map((f) => {
              const lead = f.lead_id ? leadMap.get(f.lead_id) : null
              return (
                <div key={f.finding_id} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                      {lead
                        ? <Link href={`/leads/${lead.lead_id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{lead.full_name}</Link>
                        : <span style={{ fontSize: 13, fontWeight: 500 }}>Unknown lead</span>
                      }
                      {lead && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.company_name}</span>}
                      <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{f.source_type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.research_summary}
                    </div>
                    {f.signals_detected && (
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>{f.signals_detected}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{relativeDate(f.created_at)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
