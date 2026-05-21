'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { IconLoader, IconX } from '@/components/ui/icons'
import { relativeDate, stageVariant, tempVariant, scoreColor } from '@/lib/utils'
import { STAGE_ORDER } from '@/lib/types'
import type { Lead, Company, Opportunity, Interaction, Campaign, PipelineStage } from '@/lib/types'

const CATEGORY_GROUPS = [
  { key: 'anchor',  label: 'Anchor Clients',  description: 'Current top clients',
    filter: (l: Lead) => l.pipeline_stage === 'Won' || l.pipeline_stage === 'Nurture' },
  { key: 'warm',    label: 'Warm Leads',      description: 'Engaged and responsive',
    filter: (l: Lead) => l.relationship_temperature === 'Warm' && l.pipeline_stage !== 'Won' },
  { key: 'event',   label: 'Event Leads',     description: 'Met in person at events',
    filter: (l: Lead) => !!(l.source?.toLowerCase().includes('event')
                        || l.source?.toLowerCase().includes('gala')
                        || l.source?.toLowerCase().includes('conference')) },
  { key: 'past',    label: 'Past Clients',    description: 'Previously worked together',
    filter: (l: Lead) => l.source === 'Past Client' },
  { key: 'cold',    label: 'Cold Prospects',  description: 'Outreach not yet started',
    filter: (l: Lead) => l.pipeline_stage === 'New Lead' },
  { key: 'dormant', label: 'Dormant',         description: 'High-value, gone quiet',
    filter: (l: Lead) => l.pipeline_stage === 'Dormant' || l.relationship_temperature === 'Cold' },
]

type GroupBy = 'category' | 'stage'
const GROUPBY_KEY = 'oaki:relationships:groupBy'

interface Props {
  leads: Lead[]
  companies: Company[]
  opportunities: Opportunity[]
  interactions: Interaction[]
  campaigns: Campaign[]
}

export default function RelationshipsClient({ leads, companies, opportunities, campaigns }: Props) {
  const router = useRouter()
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [busyKind, setBusyKind]   = useState<null | 'assign' | 'delete'>(null)
  const [error, setError]         = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [groupBy, setGroupBy]     = useState<GroupBy>('category')

  // Restore groupBy from localStorage on mount (client-only — SSR uses default)
  useEffect(() => {
    const stored = window.localStorage.getItem(GROUPBY_KEY)
    if (stored === 'category' || stored === 'stage') setGroupBy(stored)
  }, [])

  const setAndPersistGroupBy = useCallback((next: GroupBy) => {
    setGroupBy(next)
    try { window.localStorage.setItem(GROUPBY_KEY, next) } catch { /* private mode etc. */ }
  }, [])

  // ── Filter (search) then group (category or stage) ────────────────────────
  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((l) =>
      l.full_name.toLowerCase().includes(q) ||
      (l.company_name?.toLowerCase().includes(q) ?? false),
    )
  }, [leads, searchQuery])

  const { groups, unassigned } = useMemo(() => {
    if (groupBy === 'stage') {
      // One bucket per pipeline stage, in canonical order; empty stages hidden.
      const stageMap = new Map<PipelineStage, Lead[]>()
      STAGE_ORDER.forEach((s) => stageMap.set(s, []))
      filteredLeads.forEach((l) => {
        const bucket = stageMap.get(l.pipeline_stage)
        if (bucket) bucket.push(l)
      })
      const stageGroups = STAGE_ORDER
        .filter((s) => (stageMap.get(s)?.length ?? 0) > 0)
        .map((s) => ({
          key: `stage:${s}`,
          label: s,
          description: '',
          leads: stageMap.get(s)!,
        }))
      return { groups: stageGroups, unassigned: [] as Lead[] }
    }

    // Category mode (default)
    const assignedIds = new Set<string>()
    const grouped = CATEGORY_GROUPS.map((g) => {
      const groupLeads = filteredLeads.filter((l) => !assignedIds.has(l.lead_id) && g.filter(l))
      groupLeads.forEach((l) => assignedIds.add(l.lead_id))
      return { ...g, leads: groupLeads }
    })
    const rest = filteredLeads.filter((l) => !assignedIds.has(l.lead_id))
    return { groups: grouped, unassigned: rest }
  }, [filteredLeads, groupBy])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allLeadIds = useMemo(() => filteredLeads.map((l) => l.lead_id), [filteredLeads])
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

  const selectAll = useCallback(() => setSelected(new Set(allLeadIds)), [allLeadIds])
  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // ── Bulk actions ──────────────────────────────────────────────────────────
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
    const ok = window.confirm(
      `Permanently delete ${selected.size} lead${selected.size === 1 ? '' : 's'}? This cannot be undone.`,
    )
    if (!ok) return
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

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.company_id, c])), [companies])
  const campaignMap = useMemo(() => new Map(campaigns.map((c) => [c.campaign_id, c])), [campaigns])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16 }}>
        <div>
          <h1 className="page-title">Relationships</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {leads.length} contacts across {companies.length} companies
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/import/apollo" className="btn">Import CSV</Link>
          <Link href="/leads/new" className="btn btn-primary">+ New lead</Link>
        </div>
      </div>

      {/* View controls — search + group-by */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or company"
            style={{
              width: '100%',
              padding: '8px 32px 8px 12px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-faint)',
                cursor: 'pointer',
                padding: 4,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <IconX size={12} />
            </button>
          )}
        </div>

        {/* Group-by segmented control */}
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', flexShrink: 0 }}>
          {(['category', 'stage'] as const).map((g) => {
            const active = groupBy === g
            return (
              <button
                key={g}
                type="button"
                onClick={() => setAndPersistGroupBy(g)}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  border: 'none',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  color: active ? 'var(--text)' : 'var(--text-faint)',
                  fontWeight: active ? 500 : 400,
                  cursor: 'pointer',
                }}
              >
                {g === 'category' ? 'Relationship type' : 'Pipeline stage'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selection toolbar (sticky) */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        marginBottom: 16,
        background: 'var(--bg)',
        paddingBottom: 8,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: someSelected ? 'var(--accent-dim)' : 'var(--surface)',
          borderColor: someSelected ? 'rgba(200,169,110,0.4)' : 'var(--border)',
          fontSize: 12,
          flexWrap: 'wrap',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={() => (allSelected ? clearSelection() : selectAll())}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ color: someSelected ? 'var(--accent)' : 'var(--text-muted)', fontWeight: someSelected ? 500 : 400 }}>
              {someSelected
                ? `${selected.size} selected`
                : searchQuery
                ? `Select all (${filteredLeads.length} matching)`
                : `Select all (${leads.length})`}
            </span>
          </label>

          {someSelected && (
            <>
              <CampaignAssigner
                campaigns={campaigns}
                disabled={busyKind !== null}
                busy={busyKind === 'assign'}
                onPick={assignCampaign}
              />
              <button
                type="button"
                onClick={deleteSelected}
                disabled={busyKind !== null}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12,
                  padding: '6px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid rgba(224,92,92,0.4)',
                  background: 'transparent',
                  color: 'var(--red)',
                  cursor: busyKind ? 'default' : 'pointer',
                  opacity: busyKind ? 0.5 : 1,
                }}
              >
                {busyKind === 'delete' && <IconLoader size={11} />}
                {busyKind === 'delete' ? 'Deleting…' : `Delete ${selected.size}`}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={busyKind !== null}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-faint)',
                  cursor: busyKind ? 'default' : 'pointer',
                  marginLeft: 'auto',
                }}
              >
                <IconX size={10} /> Clear
              </button>
            </>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid rgba(224,92,92,0.25)',
            borderRadius: 'var(--r-sm)',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.filter((g) => g.leads.length > 0).map((group) => (
          <section key={group.key}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{group.label}</h2>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{group.description}</span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{group.leads.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {group.leads.map((lead) => (
                <LeadRow
                  key={lead.lead_id}
                  lead={lead}
                  company={companyMap.get(lead.company_id) ?? null}
                  campaign={lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? null : null}
                  openOpps={opportunities.filter((o) => o.lead_id === lead.lead_id && o.status === 'Open').length}
                  isSelected={selected.has(lead.lead_id)}
                  onToggle={() => toggleOne(lead.lead_id)}
                />
              ))}
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
                <LeadRow
                  key={lead.lead_id}
                  lead={lead}
                  company={companyMap.get(lead.company_id) ?? null}
                  campaign={lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? null : null}
                  openOpps={opportunities.filter((o) => o.lead_id === lead.lead_id && o.status === 'Open').length}
                  isSelected={selected.has(lead.lead_id)}
                  onToggle={() => toggleOne(lead.lead_id)}
                  compact
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// ─── Lead row ───────────────────────────────────────────────────────────────

function LeadRow({
  lead, company, campaign, openOpps, isSelected, onToggle, compact,
}: {
  lead: Lead
  company: Company | null
  campaign: Campaign | null
  openOpps: number
  isSelected: boolean
  onToggle: () => void
  compact?: boolean
}) {
  void company // reserved for future row enrichment

  const campaignName = campaign?.name && campaign.name.length > 20
    ? `${campaign.name.slice(0, 19)}…`
    : campaign?.name

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact
          ? '28px 1fr auto auto'
          : '28px 240px 160px 120px 80px 100px 100px 1fr',
        alignItems: 'center',
        padding: '10px 14px',
        background: isSelected ? 'var(--accent-dim)' : 'var(--surface)',
        border: '1px solid',
        borderColor: isSelected ? 'rgba(200,169,110,0.4)' : 'var(--border)',
        borderRadius: 6,
        marginBottom: 2,
        gap: 12,
        fontSize: 13,
        transition: 'background 0.1s ease',
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Select ${lead.full_name}`}
        style={{ cursor: 'pointer', justifySelf: 'center' }}
      />

      <Link
        href={`/leads/${lead.lead_id}`}
        style={{
          display: 'contents',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        {compact ? (
          <>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.company_name}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
              {campaignName && <CampaignPill name={campaignName} />}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDate(lead.last_touch_date)}</div>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontWeight: 500 }}>{lead.full_name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lead.title}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.company_name}</div>
            <div>
              <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
            </div>
            <div>
              {lead.relationship_temperature && (
                <Badge label={lead.relationship_temperature} variant={tempVariant(lead.relationship_temperature)} />
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDate(lead.last_touch_date)}</div>
            <div style={{ fontSize: 11 }}>
              {lead.priority_score !== undefined && (
                <span style={{ color: scoreColor(lead.priority_score) }}>{lead.priority_score}/10</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {campaignName && <CampaignPill name={campaignName} />}
              {openOpps > 0 && <Badge label={`${openOpps} opp`} variant="accent" />}
              {lead.next_action && (
                <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                  {lead.next_action}
                </span>
              )}
            </div>
          </>
        )}
      </Link>
    </div>
  )
}

// ─── Campaign pill (lead row badge) ────────────────────────────────────────

function CampaignPill({ name }: { name: string }) {
  return (
    <span
      title={`Campaign: ${name}`}
      style={{
        fontSize: 10,
        color: 'var(--accent)',
        background: 'var(--accent-dim)',
        border: '1px solid rgba(200,169,110,0.3)',
        padding: '2px 7px',
        borderRadius: 10,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </span>
  )
}

// ─── Campaign assigner dropdown ─────────────────────────────────────────────

function CampaignAssigner({
  campaigns, disabled, busy, onPick,
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12,
          padding: '6px 12px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#000',
          fontWeight: 600,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {busy && <IconLoader size={11} />}
        {busy ? 'Assigning…' : 'Assign campaign ▾'}
      </button>
      {open && !disabled && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 20 }}
          />
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              minWidth: 240,
              maxHeight: 280,
              overflowY: 'auto',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 21,
              padding: 4,
            }}
          >
            {active.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-faint)' }}>
                No active campaigns. Create one in <Link href="/campaigns/new" style={{ color: 'var(--accent)' }}>Campaigns → New</Link>.
              </div>
            ) : (
              <>
                {active.map((c) => (
                  <button
                    key={c.campaign_id}
                    type="button"
                    onClick={() => { setOpen(false); onPick(c.campaign_id) }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 12,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 'var(--r-xs)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {c.name}
                  </button>
                ))}
                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                <button
                  type="button"
                  onClick={() => { setOpen(false); onPick(null) }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 12,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--r-xs)',
                    color: 'var(--text-faint)',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  (Unassign)
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
