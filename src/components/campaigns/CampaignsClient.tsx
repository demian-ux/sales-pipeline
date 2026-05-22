'use client'

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { StatusBadge, StageBadge, Pill, Empty } from '@/components/ui/primitives'
import CampaignActionsMenu from './CampaignActionsMenu'
import CampaignStatusFilter, { type StatusFilterValue } from './CampaignStatusFilter'
import { relativeDate, dueDateStatus } from '@/lib/utils'
import type { Campaign, Lead, Opportunity, PipelineStage, CampaignStatus } from '@/lib/types'

const FILTER_KEY = 'oaki:campaigns:statusFilter'

// The progression funnel shown in the pipeline bar. Off-funnel stages
// (Nurture / Dormant / Lost) aren't bars — those leads still list below.
const FUNNEL: { stage: PipelineStage; label: string }[] = [
  { stage: 'New Lead',      label: 'New' },
  { stage: 'Contacted',     label: 'Contacted' },
  { stage: 'Replied',       label: 'Replied' },
  { stage: 'Discovery',     label: 'Discovery' },
  { stage: 'Proposal Sent', label: 'Proposal' },
  { stage: 'Negotiation',   label: 'Negotiation' },
  { stage: 'Won',           label: 'Won' },
]

const STATUS_TONE: Record<CampaignStatus, 'ok' | 'warn' | 'info'> = {
  Active: 'ok',
  Paused: 'warn',
  Archived: 'info',
}

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

  const filtered = useMemo(
    () => (filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter)),
    [campaigns, filter],
  )

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <CampaignStatusFilter value={filter} counts={counts} onChange={setAndPersist} />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <Empty title="No campaigns in this view.">
            Switch the filter, or create a campaign.
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {filtered.map((c) => (
            <CampaignSection
              key={c.campaign_id}
              campaign={c}
              leads={leads}
              opportunities={opportunities}
            />
          ))}
        </div>
      )}
    </>
  )
}

function CampaignSection({
  campaign,
  leads,
  opportunities,
}: {
  campaign: Campaign
  leads: Lead[]
  opportunities: Opportunity[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  const campaignLeads = leads.filter((l) => l.campaign_id === campaign.campaign_id)
  const openOpps = opportunities.filter(
    (o) => o.campaign_id === campaign.campaign_id && o.status === 'Open',
  )
  const cascadeOpps = opportunities.filter((o) => o.campaign_id === campaign.campaign_id)
  const dueCount = campaignLeads.filter((l) => {
    const s = dueDateStatus(l.next_followup_date)
    return s === 'overdue' || s === 'today' || s === 'soon'
  }).length

  const stageCounts: Partial<Record<PipelineStage, number>> = {}
  campaignLeads.forEach((l) => {
    stageCounts[l.pipeline_stage] = (stageCounts[l.pipeline_stage] ?? 0) + 1
  })

  const rank = (s: string) => (s === 'overdue' ? 0 : s === 'today' ? 1 : s === 'soon' ? 2 : 3)
  const sortedLeads = [...campaignLeads].sort((a, b) => {
    const d = rank(dueDateStatus(a.next_followup_date)) - rank(dueDateStatus(b.next_followup_date))
    if (d !== 0) return d
    return (b.priority_score ?? 0) - (a.priority_score ?? 0)
  })

  return (
    <section className="card">
      {editing ? (
        <CampaignEditForm
          campaign={campaign}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh() }}
        />
      ) : (
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line-subtle)' }}>
          <div className="between" style={{ alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <div className="col" style={{ gap: 6, minWidth: 0, flex: 1 }}>
              <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
                <span className="ink" style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.012em' }}>
                  {campaign.name}
                </span>
                <StatusBadge tone={STATUS_TONE[campaign.status]}>{campaign.status}</StatusBadge>
              </div>
              {campaign.description && (
                <div
                  className="ink-2"
                  style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: '70ch', marginTop: 4 }}
                >
                  {campaign.description}
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 22, alignItems: 'center' }}>
              <Stat n={campaignLeads.length} l="Leads" />
              <Stat n={dueCount} l="Due" tone={dueCount > 0 ? 'warn' : null} />
              <Stat n={openOpps.length} l="Open opps" tone={openOpps.length > 0 ? 'accent' : null} />
              <CampaignActionsMenu
                campaign={campaign}
                cascadeCounts={{ leads: campaignLeads.length, opportunities: cascadeOpps.length }}
                onEdit={() => setEditing(true)}
              />
            </div>
          </div>

          <div className="row" style={{ gap: 24, marginTop: 16, flexWrap: 'wrap', fontSize: 11.5 }}>
            <Meta k="Channels" v={campaign.channels.join(' · ') || '—'} />
            <Meta k="Cadence" v={campaign.cadence} />
            {campaign.location && <Meta k="Location" v={campaign.location} />}
            {campaign.cta && <Meta k="CTA" v={campaign.cta} />}
            {campaign.pain_point && <Meta k="Pain" v={campaign.pain_point} />}
          </div>
        </div>
      )}

      {/* Pipeline bar */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--line-subtle)' }}>
        <div className="micro" style={{ marginBottom: 8 }}>Pipeline</div>
        <div className="pipeline">
          {FUNNEL.map((f) => {
            const n = stageCounts[f.stage] ?? 0
            return (
              <div key={f.stage} className={`pipeline-step ${n === 0 ? 'empty' : ''}`}>
                <span className="pipeline-step-label">{f.label}</span>
                <span className="pipeline-step-n">{String(n).padStart(2, '0')}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Leads */}
      <div>
        <div className="row" style={{ padding: '14px 24px 8px', justifyContent: 'space-between' }}>
          <span className="micro">Leads</span>
          <span className="micro" style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
            {String(campaignLeads.length).padStart(2, '0')}
          </span>
        </div>
        {campaignLeads.length > 0 ? (
          <div>
            {sortedLeads.map((l, i) => (
              <CampaignLeadRow
                key={l.lead_id}
                lead={l}
                last={i === sortedLeads.length - 1}
                openOpps={
                  opportunities.filter((o) => o.lead_id === l.lead_id && o.status === 'Open').length
                }
              />
            ))}
          </div>
        ) : (
          <div className="ink-3" style={{ padding: '6px 24px 18px', fontSize: 12 }}>
            No leads assigned to this campaign yet.
          </div>
        )}
      </div>
    </section>
  )
}

function CampaignEditForm({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(campaign.name)
  const [description, setDescription] = useState(campaign.description)
  const [cta, setCta] = useState(campaign.cta)
  const [notes, setNotes] = useState(campaign.notes ?? '')
  const [status, setStatus] = useState<CampaignStatus>(campaign.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.campaign_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, cta, notes, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Save failed (${res.status})`)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setBusy(false)
    }
  }

  const areaStyle: React.CSSProperties = {
    height: 'auto',
    minHeight: 60,
    padding: '8px 12px',
    lineHeight: 1.5,
    resize: 'vertical',
  }

  return (
    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--line-subtle)' }}>
      <div className="col" style={{ gap: 12 }}>
        <span className="card-head-name">Edit campaign</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12 }}>
          <EditField label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </EditField>
          <EditField label="Status">
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as CampaignStatus)}
            >
              <option value="Active">Active</option>
              <option value="Paused">Paused</option>
              <option value="Archived">Archived</option>
            </select>
          </EditField>
        </div>
        <EditField label="Description">
          <textarea
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={areaStyle}
          />
        </EditField>
        <EditField label="CTA">
          <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
        </EditField>
        <EditField label="Notes">
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...areaStyle, minHeight: 48 }}
          />
        </EditField>
        {error && <span className="risk" style={{ fontSize: 12 }}>{error}</span>}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save campaign'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
        <span className="ink-3" style={{ fontSize: 11 }}>
          Channels, cadence, location, and pain point aren&apos;t editable here yet.
        </span>
      </div>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <span className="micro" style={{ color: 'var(--ink-3)' }}>{label}</span>
      {children}
    </div>
  )
}

function Stat({ n, l, tone }: { n: number; l: string; tone?: 'warn' | 'accent' | null }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'accent' ? 'var(--accent)' : 'var(--ink)'
  return (
    <div className="col" style={{ alignItems: 'flex-end', gap: 2 }}>
      <span
        className="mono tabular"
        style={{ fontSize: 18, fontWeight: 500, color, lineHeight: 1, letterSpacing: '-0.015em' }}
      >
        {String(n).padStart(2, '0')}
      </span>
      <span className="micro" style={{ fontSize: 9.5 }}>{l}</span>
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="row" style={{ gap: 6 }}>
      <span className="micro" style={{ color: 'var(--ink-4)' }}>{k}</span>
      <span className="ink-2">{v}</span>
    </div>
  )
}

function CampaignLeadRow({
  lead,
  last,
  openOpps,
}: {
  lead: Lead
  last: boolean
  openOpps: number
}) {
  const status = dueDateStatus(lead.next_followup_date)
  const followUp =
    status === 'overdue' ? { label: 'Overdue',   color: 'var(--risk)' }
    : status === 'today' ? { label: 'Due today', color: 'var(--warn)' }
    : status === 'soon'  ? { label: 'Due soon',  color: 'var(--ink-2)' }
    : { label: 'On track', color: 'var(--ink-3)' }

  return (
    <Link href={`/leads/${lead.lead_id}`}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.1fr) auto auto auto minmax(0,1fr)',
          gap: 16,
          alignItems: 'center',
          padding: '12px 24px',
          borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
          transition: 'background var(--dur) var(--ease)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <div className="col" style={{ gap: 1, minWidth: 0 }}>
          <span className="ink truncate" style={{ fontSize: 13, fontWeight: 500 }}>{lead.full_name}</span>
          <span className="ink-3 truncate" style={{ fontSize: 11.5 }}>{lead.title ?? '—'}</span>
        </div>
        <span className="ink-2 truncate" style={{ fontSize: 12.5 }}>{lead.company_name}</span>
        <StageBadge stage={lead.pipeline_stage} />
        <span className="micro" style={{ color: 'var(--ink-3)' }}>
          {relativeDate(lead.last_touch_date)}
        </span>
        <span className="micro" style={{ color: followUp.color }}>{followUp.label}</span>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
          <span className="ink-2 truncate" style={{ fontSize: 12 }}>{lead.next_action ?? '—'}</span>
          {openOpps > 0 && <Pill tone="gold">{openOpps} opp</Pill>}
        </div>
      </div>
    </Link>
  )
}
