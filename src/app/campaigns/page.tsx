import { getCampaigns, getLeads, getOpportunities } from '@/lib/sheets'
import { relativeDate, dueDateStatus, stageVariant, urgencyVariant } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import Link from 'next/link'
import type { Campaign, Lead, PipelineStage } from '@/lib/types'

export const dynamic = 'force-dynamic'

const CHANNEL_ICONS: Record<string, string> = {
  Email: '✉',
  LinkedIn: 'in',
  Letter: '✦',
  Phone: '◎',
}

const STAGE_ORDER: PipelineStage[] = [
  'New Lead', 'Contacted', 'Replied', 'Discovery',
  'Proposal Sent', 'Negotiation', 'Won', 'Nurture', 'Dormant', 'Lost',
]

export default async function CampaignsPage() {
  const [campaigns, leads, opportunities] = await Promise.all([
    getCampaigns(),
    getLeads(),
    getOpportunities(),
  ])

  const activeCampaigns = campaigns.filter((c) => c.status === 'Active')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 className="page-title">Campaigns</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {activeCampaigns.length} active campaigns · {leads.length} leads total
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {campaigns.map((campaign) => {
          const campaignLeads = leads.filter((l) => l.campaign_id === campaign.campaign_id)
          const openOpps = opportunities.filter(
            (o) => o.campaign_id === campaign.campaign_id && o.status === 'Open'
          )
          const dueLeads = campaignLeads.filter((l) => {
            const s = dueDateStatus(l.next_followup_date)
            return s === 'overdue' || s === 'today' || s === 'soon'
          })

          // Stage breakdown counts
          const stageCounts: Partial<Record<PipelineStage, number>> = {}
          campaignLeads.forEach((l) => {
            stageCounts[l.pipeline_stage] = (stageCounts[l.pipeline_stage] ?? 0) + 1
          })
          const activeStages = STAGE_ORDER.filter((s) => stageCounts[s])

          return (
            <section
              key={campaign.campaign_id}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Campaign header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{campaign.name}</h2>
                      <Badge
                        label={campaign.status}
                        variant={campaign.status === 'Active' ? 'green' : 'muted'}
                      />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
                      {campaign.description}
                    </p>
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 20, flexShrink: 0, marginLeft: 24 }}>
                    <Stat value={campaignLeads.length} label="leads" />
                    <Stat value={dueLeads.length} label="due" color={dueLeads.length > 0 ? 'var(--yellow)' : undefined} />
                    <Stat value={openOpps.length} label="open opps" color={openOpps.length > 0 ? 'var(--accent)' : undefined} />
                  </div>
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
                  <MetaItem label="Channels">
                    <div style={{ display: 'flex', gap: 6 }}>
                      {campaign.channels.map((ch) => (
                        <span key={ch} style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)' }}>
                          {CHANNEL_ICONS[ch] ? `${CHANNEL_ICONS[ch]} ` : ''}{ch}
                        </span>
                      ))}
                    </div>
                  </MetaItem>
                  <MetaItem label="Cadence">
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaign.cadence}</span>
                  </MetaItem>
                  {campaign.location && (
                    <MetaItem label="Location">
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaign.location}</span>
                    </MetaItem>
                  )}
                  {campaign.cta && (
                    <MetaItem label="CTA">
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaign.cta}</span>
                    </MetaItem>
                  )}
                  {campaign.pain_point && (
                    <MetaItem label="Pain point">
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaign.pain_point}</span>
                    </MetaItem>
                  )}
                </div>

                {/* Stage pipeline bar */}
                {activeStages.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                    {activeStages.map((stage) => (
                      <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Badge label={stage} variant={stageVariant(stage)} />
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{stageCounts[stage]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leads table */}
              {campaignLeads.length > 0 ? (
                <div>
                  {/* Due first, then by priority */}
                  {[...campaignLeads]
                    .sort((a, b) => {
                      const aStatus = dueDateStatus(a.next_followup_date)
                      const bStatus = dueDateStatus(b.next_followup_date)
                      const urgency = (s: string) =>
                        s === 'overdue' ? 0 : s === 'today' ? 1 : s === 'soon' ? 2 : 3
                      const urgencyDiff = urgency(aStatus) - urgency(bStatus)
                      if (urgencyDiff !== 0) return urgencyDiff
                      return (b.priority_score ?? 0) - (a.priority_score ?? 0)
                    })
                    .map((lead, i) => (
                      <CampaignLeadRow
                        key={lead.lead_id}
                        lead={lead}
                        isLast={i === campaignLeads.length - 1}
                        openOpps={opportunities.filter((o) => o.lead_id === lead.lead_id && o.status === 'Open').length}
                      />
                    ))}
                </div>
              ) : (
                <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-faint)' }}>
                  No leads assigned to this campaign yet.
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function CampaignLeadRow({
  lead,
  isLast,
  openOpps,
}: {
  lead: Lead
  isLast: boolean
  openOpps: number
}) {
  const followupStatus = dueDateStatus(lead.next_followup_date)
  const isOverdue = followupStatus === 'overdue'
  const isToday = followupStatus === 'today'
  const isSoon = followupStatus === 'soon'

  return (
    <Link href={`/leads/${lead.lead_id}`}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 160px 110px 100px 80px 1fr 100px',
          alignItems: 'center',
          padding: '10px 20px',
          borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
          gap: 12,
          fontSize: 12,
          background: isOverdue ? 'rgba(224,92,92,0.04)' : 'transparent',
        }}
      >
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{lead.full_name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.title}</div>
        </div>

        <div style={{ color: 'var(--text-muted)' }}>{lead.company_name}</div>

        <div>
          <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Last: {relativeDate(lead.last_touch_date)}
        </div>

        <div style={{ fontSize: 11 }}>
          {lead.next_followup_date ? (
            <span style={{
              color: isOverdue ? 'var(--red)' : isToday ? 'var(--yellow)' : isSoon ? 'var(--yellow)' : 'var(--text-faint)',
              fontWeight: isOverdue || isToday ? 600 : 400,
            }}>
              {isOverdue ? '⚠ ' : isToday ? '● ' : ''}
              {isOverdue
                ? `Overdue ${relativeDate(lead.next_followup_date)}`
                : isToday
                ? 'Today'
                : new Date(lead.next_followup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          ) : (
            <span style={{ color: 'var(--text-faint)' }}>—</span>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.next_action ?? '—'}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          {openOpps > 0 && <Badge label={`${openOpps} opp`} variant="accent" />}
        </div>
      </div>
    </Link>
  )
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: color ?? 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {children}
    </div>
  )
}
