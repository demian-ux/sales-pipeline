'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import CampaignActionsMenu from './CampaignActionsMenu'
import CampaignStatusFilter, { type StatusFilterValue } from './CampaignStatusFilter'
import { relativeDate, dueDateStatus, stageVariant } from '@/lib/utils'
import { STAGE_ORDER } from '@/lib/types'
import type { Campaign, Lead, Opportunity, PipelineStage } from '@/lib/types'

const CHANNEL_ICONS: Record<string, string> = {
  Email: '✉',
  LinkedIn: 'in',
  Letter: '✦',
  Phone: '◎',
}

const FILTER_KEY = 'oaki:campaigns:statusFilter'

interface Props {
  campaigns: Campaign[]
  leads: Lead[]
  opportunities: Opportunity[]
}

export default function CampaignsClient({ campaigns, leads, opportunities }: Props) {
  const [filter, setFilter] = useState<StatusFilterValue>('Active')

  useEffect(() => {
    const stored = window.localStorage.getItem(FILTER_KEY)
    if (stored === 'Active' || stored === 'Paused' || stored === 'Archived' || stored === 'all') {
      setFilter(stored)
    }
  }, [])

  const setAndPersist = useCallback((next: StatusFilterValue) => {
    setFilter(next)
    try { window.localStorage.setItem(FILTER_KEY, next) } catch { /* noop */ }
  }, [])

  const counts = useMemo(() => ({
    Active:   campaigns.filter((c) => c.status === 'Active').length,
    Paused:   campaigns.filter((c) => c.status === 'Paused').length,
    Archived: campaigns.filter((c) => c.status === 'Archived').length,
    all:      campaigns.length,
  }), [campaigns])

  const filtered = useMemo(() => {
    if (filter === 'all') return campaigns
    return campaigns.filter((c) => c.status === filter)
  }, [campaigns, filter])

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 18 }}>
        <CampaignStatusFilter value={filter} counts={counts} onChange={setAndPersist} />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            No campaigns match this filter.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {filtered.map((campaign) => (
          <CampaignCard
            key={campaign.campaign_id}
            campaign={campaign}
            leads={leads}
            opportunities={opportunities}
          />
        ))}
      </div>
    </div>
  )
}

function CampaignCard({
  campaign,
  leads,
  opportunities,
}: {
  campaign: Campaign
  leads: Lead[]
  opportunities: Opportunity[]
}) {
  const campaignLeads = leads.filter((l) => l.campaign_id === campaign.campaign_id)
  const openOpps = opportunities.filter(
    (o) => o.campaign_id === campaign.campaign_id && o.status === 'Open',
  )
  const cascadeOpps = opportunities.filter((o) => o.campaign_id === campaign.campaign_id)
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

  const isArchived = campaign.status === 'Archived'
  const statusVariant: 'green' | 'yellow' | 'muted' =
    campaign.status === 'Active'   ? 'green'
    : campaign.status === 'Paused' ? 'yellow'
                                   : 'muted'

  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        opacity: isArchived ? 0.7 : 1,
      }}
    >
      {/* Campaign header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{campaign.name}</h2>
              <Badge label={campaign.status} variant={statusVariant} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, maxWidth: 560, lineHeight: 1.5 }}>
              {campaign.description}
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, flexShrink: 0, marginLeft: 12, alignItems: 'flex-start' }}>
            <Stat value={campaignLeads.length} label="leads" />
            <Stat value={dueLeads.length}      label="due"        color={dueLeads.length > 0 ? 'var(--yellow)' : undefined} />
            <Stat value={openOpps.length}      label="open opps"  color={openOpps.length > 0 ? 'var(--accent)' : undefined} />
            <CampaignActionsMenu
              campaign={campaign}
              cascadeCounts={{ leads: campaignLeads.length, opportunities: cascadeOpps.length }}
            />
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
