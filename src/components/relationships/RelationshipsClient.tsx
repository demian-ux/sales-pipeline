'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { Empty } from '@/components/ui/primitives'
import { relativeDate } from '@/lib/utils'
import { STAGE_ORDER } from '@/lib/types'
import type { Lead, Company, Campaign, PipelineStage, RelationshipTemperature } from '@/lib/types'

const CATEGORY_GROUPS = [
  {
    key: 'anchor', label: 'Anchor Clients',
    description: 'The relationships the studio is built on.',
    filter: (l: Lead) => l.pipeline_stage === 'Won' || l.pipeline_stage === 'Nurture',
  },
  {
    key: 'warm', label: 'Warm Leads',
    description: 'Engaged and moving — keep the cadence.',
    filter: (l: Lead) => l.relationship_temperature === 'Warm' && l.pipeline_stage !== 'Won',
  },
  {
    key: 'event', label: 'Event Leads',
    description: 'Met in person. Convert while it is still warm.',
    filter: (l: Lead) => !!(l.source?.toLowerCase().includes('event')
                        || l.source?.toLowerCase().includes('gala')
                        || l.source?.toLowerCase().includes('conference')),
  },
  {
    key: 'past', label: 'Past Clients',
    description: 'Worked together before — worth rekindling.',
    filter: (l: Lead) => l.source === 'Past Client',
  },
  {
    key: 'cold', label: 'Cold Prospects',
    description: 'Researched, not yet approached.',
    filter: (l: Lead) => l.pipeline_stage === 'New Lead',
  },
  {
    key: 'dormant', label: 'Dormant',
    description: 'High-value, gone quiet.',
    filter: (l: Lead) => l.pipeline_stage === 'Dormant' || l.relationship_temperature === 'Cold',
  },
]

const TEMP_DOT: Record<RelationshipTemperature, string> = {
  Hot: 'hot', Warm: 'warm', Cool: 'cool', Cold: 'cold',
}

type GroupBy = 'category' | 'stage'
const GROUPBY_KEY = 'oaki:relationships:groupBy'

interface Props {
  leads: Lead[]
  companies: Company[]
  campaigns: Campaign[]
}

interface Group {
  key: string
  label: string
  note?: string
  leads: Lead[]
}

export default function RelationshipsClient({ leads, companies, campaigns }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyKind, setBusyKind] = useState<null | 'assign' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('category')

  useEffect(() => {
    const stored = window.localStorage.getItem(GROUPBY_KEY)
    if (stored === 'category' || stored === 'stage') setGroupBy(stored)
  }, [])

  const setAndPersistGroupBy = useCallback((next: GroupBy) => {
    setGroupBy(next)
    try { window.localStorage.setItem(GROUPBY_KEY, next) } catch { /* private mode */ }
  }, [])

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((l) =>
      l.full_name.toLowerCase().includes(q) ||
      (l.company_name?.toLowerCase().includes(q) ?? false) ||
      (l.location?.toLowerCase().includes(q) ?? false),
    )
  }, [leads, searchQuery])

  const groups: Group[] = useMemo(() => {
    if (groupBy === 'stage') {
      const stageMap = new Map<PipelineStage, Lead[]>()
      STAGE_ORDER.forEach((s) => stageMap.set(s, []))
      filteredLeads.forEach((l) => stageMap.get(l.pipeline_stage)?.push(l))
      return STAGE_ORDER
        .filter((s) => (stageMap.get(s)?.length ?? 0) > 0)
        .map((s) => ({ key: `stage:${s}`, label: s, leads: stageMap.get(s)! }))
    }
    const assignedIds = new Set<string>()
    const grouped: Group[] = CATEGORY_GROUPS.map((g) => {
      const groupLeads = filteredLeads.filter((l) => !assignedIds.has(l.lead_id) && g.filter(l))
      groupLeads.forEach((l) => assignedIds.add(l.lead_id))
      return { key: g.key, label: g.label, note: g.description, leads: groupLeads }
    })
    const rest = filteredLeads.filter((l) => !assignedIds.has(l.lead_id))
    if (rest.length > 0) grouped.push({ key: 'other', label: 'Other', leads: rest })
    return grouped.filter((g) => g.leads.length > 0)
  }, [filteredLeads, groupBy])

  const allSelected = selected.size > 0 && selected.size === filteredLeads.length
  const someSelected = selected.size > 0

  const toggleOne = useCallback((leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(leadId)) next.delete(leadId)
      else next.add(leadId)
      return next
    })
  }, [])

  const selectAll = useCallback(
    () => setSelected(new Set(filteredLeads.map((l) => l.lead_id))),
    [filteredLeads],
  )
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  async function assignCampaign(campaignId: string | null) {
    if (selected.size === 0) return
    setBusyKind('assign')
    setError(null)
    try {
      const res = await fetch('/api/leads/bulk-assign-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selected), campaign_id: campaignId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      clearSelection()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed')
    } finally {
      setBusyKind(null)
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!window.confirm(
      `Permanently delete ${selected.size} lead${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
    )) return
    setBusyKind('delete')
    setError(null)
    try {
      const res = await fetch('/api/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_ids: Array.from(selected) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      clearSelection()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyKind(null)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 1180, padding: '48px 56px 112px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 32,
          marginBottom: 32,
        }}
      >
        <div>
          <div className="page-eyebrow">People</div>
          <h1 className="rs-title">Relationships</h1>
          <p className="rs-lede">
            {leads.length} relationships across {companies.length} companies — the people the work
            comes through.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/import/apollo">
            <Icon name="external" size={12} /> Import
          </Link>
          <Link className="btn btn-primary" href="/leads/new">
            <Icon name="plus" size={12} /> New lead
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          paddingBottom: 22,
          borderBottom: '1px solid var(--line-subtle)',
        }}
      >
        <div className="rs-search">
          <Icon name="search" size={14} style={{ color: 'var(--ink-3)' }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search the roster — name, company, city"
          />
        </div>
        <div className="row" style={{ gap: 12, flexShrink: 0 }}>
          <span className="micro" style={{ color: 'var(--ink-4)' }}>Grouped by</span>
          <div className="seg">
            <button
              className={`seg-btn ${groupBy === 'category' ? 'active' : ''}`}
              onClick={() => setAndPersistGroupBy('category')}
            >
              Relationship
            </button>
            <button
              className={`seg-btn ${groupBy === 'stage' ? 'active' : ''}`}
              onClick={() => setAndPersistGroupBy('stage')}
            >
              Pipeline stage
            </button>
          </div>
        </div>
      </div>

      {/* Selection bar */}
      {someSelected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '11px 16px',
            marginTop: 20,
            background: 'var(--surface)',
            border: '1px solid var(--accent-line)',
            borderRadius: 'var(--r-md)',
            flexWrap: 'wrap',
          }}
        >
          <div className="row" style={{ gap: 14 }}>
            <span className="ink" style={{ fontSize: 12.5, fontWeight: 500 }}>
              {selected.size} selected
            </span>
            {!allSelected && (
              <button className="btn btn-xs btn-ghost" onClick={selectAll}>
                Select all {filteredLeads.length}
              </button>
            )}
            <button className="btn btn-xs btn-ghost" onClick={clearSelection}>Clear</button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <CampaignAssigner
              campaigns={campaigns}
              disabled={busyKind !== null}
              busy={busyKind === 'assign'}
              onPick={assignCampaign}
            />
            <button
              className="btn btn-sm"
              style={{ color: 'var(--risk)' }}
              onClick={deleteSelected}
              disabled={busyKind !== null}
            >
              <Icon name="trash" size={11} />
              {busyKind === 'delete' ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="card card-pad-sm"
          style={{ borderColor: 'var(--risk-line)', marginTop: 16 }}
        >
          <span className="risk" style={{ fontSize: 12 }}>{error}</span>
        </div>
      )}

      {/* Roster */}
      {groups.length === 0 ? (
        <div className="card" style={{ marginTop: 32 }}>
          <Empty title="No contacts match.">
            Adjust the search, or import a CSV to populate the roster.
          </Empty>
        </div>
      ) : (
        <div>
          {groups.map((group) => (
            <section key={group.key} className="rs-group">
              <div className="rs-group-head">
                <span className="rs-group-label">{group.label}</span>
                <span className="rs-group-count">{String(group.leads.length).padStart(2, '0')}</span>
                <span className="rs-group-rule" />
              </div>
              {group.note && <p className="rs-group-note">{group.note}</p>}
              <div>
                {group.leads.map((lead, i) => (
                  <LeadRow
                    key={lead.lead_id}
                    lead={lead}
                    selected={selected.has(lead.lead_id)}
                    onToggle={() => toggleOne(lead.lead_id)}
                    onOpen={() => router.push(`/leads/${lead.lead_id}`)}
                    last={i === group.leads.length - 1}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function LeadRow({
  lead,
  selected,
  onToggle,
  onOpen,
  last,
}: {
  lead: Lead
  selected: boolean
  onToggle: () => void
  onOpen: () => void
  last: boolean
}) {
  const tempCls = lead.relationship_temperature ? TEMP_DOT[lead.relationship_temperature] : ''
  const stageIdx = STAGE_ORDER.indexOf(lead.pipeline_stage)
  const stageNum = stageIdx >= 0 ? String(stageIdx).padStart(2, '0') : '··'
  const identity = [lead.title, lead.company_name].filter(Boolean).join(' · ')

  return (
    <div className={`rs-row ${selected ? 'selected' : ''}`} onClick={onOpen} data-last={last}>
      <span className="rs-mark">
        <span className={`rs-dot ${tempCls}`} />
        <input
          type="checkbox"
          className="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${lead.full_name}`}
        />
      </span>

      <div style={{ minWidth: 0 }}>
        <div className="rs-name">{lead.full_name}</div>
        <div className="rs-sub">
          {identity}
          {lead.location && <span className="city"> · {lead.location}</span>}
        </div>
      </div>

      <div className={`rs-move ${lead.next_action ? '' : 'quiet'}`}>
        <span className="rs-tick">&rarr;</span>
        <span>{lead.next_action ?? 'No next step set'}</span>
      </div>

      <div className="rs-meta">
        <span className="rs-stage">
          <span className="num">{stageNum}</span>{lead.pipeline_stage}
        </span>
        {lead.last_touch_date ? (
          <span className="rs-when">{relativeDate(lead.last_touch_date)}</span>
        ) : (
          <span className="rs-when none">No touch yet</span>
        )}
      </div>

      {lead.priority_score != null ? (
        <span className="rs-score">
          {lead.priority_score}<span className="of">&nbsp;/10</span>
        </span>
      ) : (
        <span className="rs-score empty">&mdash;</span>
      )}
    </div>
  )
}

function CampaignAssigner({
  campaigns,
  disabled,
  busy,
  onPick,
}: {
  campaigns: Campaign[]
  disabled: boolean
  busy: boolean
  onPick: (campaignId: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const active = campaigns.filter((c) => c.status === 'Active')

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} disabled={disabled}>
        {busy ? 'Assigning…' : 'Assign campaign'}
        <Icon name="chevdown" size={11} />
      </button>
      {open && !disabled && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div className="menu" style={{ minWidth: 220, maxHeight: 300, overflowY: 'auto' }}>
            {active.length === 0 ? (
              <div className="ink-3" style={{ padding: '8px 10px', fontSize: 12 }}>
                No active campaigns.
              </div>
            ) : (
              <>
                {active.map((c) => (
                  <button
                    key={c.campaign_id}
                    className="menu-item"
                    onClick={() => { setOpen(false); onPick(c.campaign_id) }}
                  >
                    <span>{c.name}</span>
                  </button>
                ))}
                <div className="menu-sep" />
                <button className="menu-item" onClick={() => { setOpen(false); onPick(null) }}>
                  <span className="ink-3">Unassign</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
