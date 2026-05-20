import {
  getLeadById,
  getCompanyById,
  getResearchForLead,
  getInteractionsForLead,
  getMeetingPrep,
} from '@/lib/sheets'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { stageVariant, relativeDate, scoreColor } from '@/lib/utils'
import MeetingPrepClient from '@/components/meeting-prep/MeetingPrepClient'

export const dynamic = 'force-dynamic'

export default async function MeetingPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) notFound()

  const [company, research, interactions, existingPrep] = await Promise.all([
    getCompanyById(lead.company_id),
    getResearchForLead(id),
    getInteractionsForLead(id),
    Promise.resolve(getMeetingPrep(id)),
  ])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      <Link href={`/leads/${id}`} style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 16 }}>
        ← {lead.full_name}
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
            Meeting Prep
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{lead.full_name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {lead.title}{lead.title && lead.company_name ? ' · ' : ''}{lead.company_name}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
            {lead.relationship_temperature && (
              <Badge
                label={lead.relationship_temperature}
                variant={lead.relationship_temperature === 'Warm' ? 'yellow' : lead.relationship_temperature === 'Hot' ? 'green' : 'muted'}
              />
            )}
          </div>
        </div>

        {/* Quick context */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Quick context</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ContextRow label="Last touch" value={relativeDate(lead.last_touch_date)} />
            <ContextRow label="Priority" value={lead.priority_score ? `${lead.priority_score}/10` : '—'} valueColor={scoreColor(lead.priority_score)} />
            <ContextRow label="Research" value={`${research.length} finding${research.length !== 1 ? 's' : ''}`} />
            <ContextRow label="Interactions" value={`${interactions.length} total`} />
            {company?.design_quality_score && (
              <ContextRow label="Design quality" value={`${company.design_quality_score}/10`} valueColor={scoreColor(company.design_quality_score)} />
            )}
          </div>
        </div>
      </div>

      {/* Main client component handles generation + display */}
      <MeetingPrepClient
        leadId={id}
        leadName={lead.full_name}
        existingPrep={existingPrep}
        knownPainPoints={lead.known_pain_points}
        nextAction={lead.next_action}
        notes={lead.notes}
        company={company ?? undefined}
        research={research}
        interactions={interactions}
      />
    </div>
  )
}

function ContextRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: valueColor ?? 'var(--text-muted)' }}>{value}</span>
    </div>
  )
}
