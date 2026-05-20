import { getLeads } from '@/lib/sheets'
import { stageVariant, relativeDate, scoreColor } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import type { PipelineStage } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STAGE_ORDER: PipelineStage[] = [
  'New Lead',
  'Contacted',
  'Replied',
  'Discovery',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Nurture',
  'Dormant',
  'Lost',
]

export default async function PipelinePage() {
  const leads = await getLeads()

  const byStage = new Map<PipelineStage, typeof leads>()
  STAGE_ORDER.forEach((s) => byStage.set(s, []))
  leads.forEach((l) => {
    const arr = byStage.get(l.pipeline_stage) ?? []
    arr.push(l)
    byStage.set(l.pipeline_stage, arr)
  })

  const activeStages = STAGE_ORDER.filter((s) => (byStage.get(s)?.length ?? 0) > 0)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Pipeline</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{leads.length} leads across {activeStages.length} stages</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {activeStages.map((stage) => {
          const stageLeads = (byStage.get(stage) ?? []).sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
          return (
            <section key={stage}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Badge label={stage} variant={stageVariant(stage)} />
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{stageLeads.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {stageLeads.map((lead) => (
                  <Link key={lead.lead_id} href={`/leads/${lead.lead_id}`}>
                    <div style={{ display: 'grid', gridTemplateColumns: '200px 160px 100px 80px 1fr 120px', alignItems: 'center', padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, gap: 12, fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{lead.full_name}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{lead.company_name}</div>
                      <div style={{ color: 'var(--text-faint)' }}>{lead.location}</div>
                      <div style={{ color: scoreColor(lead.priority_score), fontWeight: 600 }}>
                        {lead.priority_score ? `${lead.priority_score}/10` : '—'}
                      </div>
                      <div style={{ color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.next_action}
                      </div>
                      <div style={{ textAlign: 'right', color: 'var(--text-faint)' }}>
                        {relativeDate(lead.last_touch_date)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
