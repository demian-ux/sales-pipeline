'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Lead, Opportunity } from '@/lib/types'
import type {
  HealthGroup,
  LeadHealth,
  DiscoveryGroup,
  DiscoveryLead,
  TimelineEvent,
} from '@/app/strategic-map/page'

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  leads: Lead[]
  leadMap: Record<string, Lead>
  openOpps: Opportunity[]
  allOpps: Opportunity[]
  healthGroups: Record<HealthGroup, LeadHealth[]>
  discoveryGroups: Record<DiscoveryGroup, DiscoveryLead[]>
  timeline: TimelineEvent[]
}

// ── Tab types ──────────────────────────────────────────────────────────────

type Tab = 'overview' | 'opportunities' | 'health' | 'discovery' | 'timeline'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'opportunities', label: 'Opportunity Board' },
  { id: 'health', label: 'Relationship Health' },
  { id: 'discovery', label: 'Discovery Pipeline' },
  { id: 'timeline', label: 'Timeline' },
]

// ── Color maps ─────────────────────────────────────────────────────────────

const HEALTH_COLORS: Record<HealthGroup, { bg: string; border: string; text: string; dot: string }> = {
  Strong:    { bg: 'rgba(80,180,120,0.07)',  border: 'rgba(80,180,120,0.25)',  text: 'var(--green)',       dot: '#50b478' },
  Warm:      { bg: 'rgba(230,180,80,0.07)',  border: 'rgba(230,180,80,0.25)',  text: 'var(--yellow)',      dot: '#e6b450' },
  Cooling:   { bg: 'rgba(200,169,110,0.07)', border: 'rgba(200,169,110,0.25)', text: 'var(--accent)',      dot: '#c8a96e' },
  Dormant:   { bg: 'rgba(120,120,130,0.06)', border: 'rgba(120,120,130,0.2)',  text: 'var(--text-faint)',  dot: '#787882' },
  'At Risk': { bg: 'rgba(224,92,92,0.07)',   border: 'rgba(224,92,92,0.25)',   text: 'var(--red)',         dot: '#e05c5c' },
}

const HEALTH_ORDER: HealthGroup[] = ['At Risk', 'Strong', 'Warm', 'Cooling', 'Dormant']

const DISCOVERY_COLORS: Record<DiscoveryGroup, string> = {
  Candidates:       'var(--text-faint)',
  Scheduled:        'var(--yellow)',
  'In Discovery':   'var(--accent)',
  'Needs Proposal': 'var(--green)',
  'Follow-up':      'var(--red)',
}

const DISCOVERY_ORDER: DiscoveryGroup[] = ['In Discovery', 'Needs Proposal', 'Follow-up', 'Scheduled', 'Candidates']

const URGENCY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

const TIMELINE_COLORS: Record<string, string> = {
  interaction: 'var(--accent)',
  research:    'var(--yellow)',
  opportunity: 'var(--green)',
  insight:     '#9b8be0',
  stage_change: 'var(--text-faint)',
}

const TIMELINE_LABELS: Record<string, string> = {
  interaction: 'Touch',
  research:    'Research',
  opportunity: 'Opp',
  insight:     'AI',
  stage_change: 'Stage',
}

// ── Helper ─────────────────────────────────────────────────────────────────

function relDate(dateStr: string): string {
  const d = new Date(dateStr)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 28 }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: active === t.id ? 600 : 400,
            color: active === t.id ? 'var(--text)' : 'var(--text-muted)',
            background: 'none',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: -1,
            letterSpacing: '0.01em',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 24, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

// ── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({
  leads,
  openOpps,
  healthGroups,
  discoveryGroups,
}: {
  leads: Lead[]
  openOpps: Opportunity[]
  healthGroups: Record<HealthGroup, LeadHealth[]>
  discoveryGroups: Record<DiscoveryGroup, DiscoveryLead[]>
}) {
  const activeLeads = leads.filter((l) => l.lead_status === 'Active')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        <StatChip label="Active leads" value={activeLeads.length} color="var(--text)" />
        <StatChip label="Open opportunities" value={openOpps.length} color="var(--accent)" />
        <StatChip label="Strong relationships" value={healthGroups.Strong.length} color="var(--green)" />
        <StatChip label="At risk" value={healthGroups['At Risk'].length} color="var(--red)" />
        <StatChip label="In discovery" value={discoveryGroups['In Discovery'].length} color="var(--yellow)" />
      </div>

      {/* Health summary */}
      <div>
        <SectionLabel>Relationship health snapshot</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {HEALTH_ORDER.map((group) => {
            const items = healthGroups[group]
            const c = HEALTH_COLORS[group]
            return (
              <div
                key={group}
                style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '14px 16px' }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: c.text, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  {group}
                </div>
                <div style={{ fontSize: 22, fontWeight: 600, color: c.text, lineHeight: 1, marginBottom: 10 }}>
                  {items.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.slice(0, 3).map((lh) => (
                    <Link
                      key={lh.lead.lead_id}
                      href={`/leads/${lh.lead.lead_id}`}
                      style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {lh.lead.full_name}
                    </Link>
                  ))}
                  {items.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>+{items.length - 3} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top opportunities */}
      <div>
        <SectionLabel>Top open opportunities</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {openOpps
            .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1))
            .slice(0, 5)
            .map((opp) => (
              <OppRow key={opp.opportunity_id} opp={opp} />
            ))}
          {openOpps.length === 0 && (
            <EmptyState>No open opportunities</EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Opportunity Board tab ──────────────────────────────────────────────────

type OppGroupBy = 'urgency' | 'type' | 'status'

function OpportunityBoardTab({
  openOpps,
  leadMap,
}: {
  openOpps: Opportunity[]
  leadMap: Record<string, Lead>
}) {
  const [groupBy, setGroupBy] = useState<OppGroupBy>('urgency')

  function getGroupKey(opp: Opportunity): string {
    if (groupBy === 'urgency') return opp.urgency
    if (groupBy === 'type') return opp.opportunity_type || 'Other'
    return opp.status
  }

  const groups: Record<string, Opportunity[]> = {}
  for (const opp of openOpps) {
    const key = getGroupKey(opp)
    if (!groups[key]) groups[key] = []
    groups[key].push(opp)
  }

  const urgencyGroupOrder = ['High', 'Medium', 'Low']
  const keys =
    groupBy === 'urgency'
      ? urgencyGroupOrder.filter((k) => groups[k])
      : Object.keys(groups).sort()

  const urgencyColor = (u: string) =>
    u === 'High' ? 'var(--red)' : u === 'Medium' ? 'var(--yellow)' : 'var(--text-faint)'

  return (
    <div>
      {/* Group-by controls */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginRight: 4 }}>Group by:</span>
        {(['urgency', 'type', 'status'] as OppGroupBy[]).map((opt) => (
          <button
            key={opt}
            onClick={() => setGroupBy(opt)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: groupBy === opt ? 'var(--surface-2)' : 'transparent',
              color: groupBy === opt ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {opt}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
          {openOpps.length} open
        </span>
      </div>

      {openOpps.length === 0 && <EmptyState>No open opportunities</EmptyState>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {keys.map((key) => (
          <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: groupBy === 'urgency' ? urgencyColor(key) : 'var(--text-muted)' }}>
                {key}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{groups[key].length}</span>
            </div>
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
              {groups[key]
                .sort((a, b) => Number(b.confidence) - Number(a.confidence))
                .map((opp) => {
                  const lead = leadMap[opp.lead_id]
                  return (
                    <Link
                      key={opp.opportunity_id}
                      href={`/leads/${opp.lead_id}`}
                      style={{ padding: '8px 14px', display: 'block', borderBottom: '1px solid var(--border-subtle)' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                            {lead?.full_name ?? opp.lead_id}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opp.summary}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                          {opp.confidence}%
                        </span>
                      </div>
                      {opp.why_now && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {opp.why_now}
                        </div>
                      )}
                    </Link>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Relationship Health tab ────────────────────────────────────────────────

function RelationshipHealthTab({ healthGroups }: { healthGroups: Record<HealthGroup, LeadHealth[]> }) {
  const [activeGroup, setActiveGroup] = useState<HealthGroup | 'All'>('All')

  const visibleGroups: HealthGroup[] = activeGroup === 'All' ? HEALTH_ORDER : [activeGroup]

  return (
    <div>
      {/* Group filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['All', ...HEALTH_ORDER] as const).map((g) => {
          const c = g === 'All' ? null : HEALTH_COLORS[g]
          const isActive = activeGroup === g
          return (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                borderRadius: 5,
                border: `1px solid ${isActive && c ? c.border : 'var(--border)'}`,
                background: isActive && c ? c.bg : 'transparent',
                color: isActive && c ? c.text : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {g}
              {g !== 'All' && (
                <span style={{ marginLeft: 5, opacity: 0.7 }}>{healthGroups[g].length}</span>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {visibleGroups.map((group) => {
          const items = healthGroups[group]
          if (items.length === 0) return null
          const c = HEALTH_COLORS[group]

          return (
            <div key={group}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: c.text }}>
                  {group}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{items.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
                {items.map((lh) => (
                  <Link key={lh.lead.lead_id} href={`/leads/${lh.lead.lead_id}`}>
                    <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{lh.lead.full_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lh.lead.company_name}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, paddingTop: 2 }}>
                          {lh.lead.pipeline_stage}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: c.text, marginTop: 6, lineHeight: 1.35 }}>
                        {lh.reason}
                      </div>
                      {lh.lead.next_action && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                          → {lh.lead.next_action}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Discovery Pipeline tab ─────────────────────────────────────────────────

function DiscoveryPipelineTab({ discoveryGroups }: { discoveryGroups: Record<DiscoveryGroup, DiscoveryLead[]> }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {DISCOVERY_ORDER.map((group) => {
          const items = discoveryGroups[group]
          const color = DISCOVERY_COLORS[group]

          return (
            <div key={group} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color }}>
                  {group}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{items.length}</span>
              </div>
              <div style={{ padding: '8px 0' }}>
                {items.length === 0 && (
                  <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-faint)' }}>—</div>
                )}
                {items.map(({ lead, days_since_touch }) => (
                  <Link key={lead.lead_id} href={`/leads/${lead.lead_id}`}>
                    <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{lead.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                        {lead.company_name}
                        {days_since_touch !== Infinity && (
                          <span style={{ marginLeft: 6 }}>· {days_since_touch}d</span>
                        )}
                      </div>
                      {lead.next_action && (
                        <div style={{ fontSize: 10, color: color, marginTop: 3 }}>→ {lead.next_action}</div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              {group === 'In Discovery' && items.length > 0 && (
                <div style={{ padding: '8px 14px' }}>
                  <Link
                    href="/discovery"
                    style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    Open discovery prep →
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline tab ───────────────────────────────────────────────────────────

function TimelineTab({ timeline }: { timeline: TimelineEvent[] }) {
  const [filter, setFilter] = useState<string>('all')

  const types = ['all', 'interaction', 'research', 'opportunity', 'insight']
  const visible = filter === 'all' ? timeline : timeline.filter((e) => e.type === filter)

  // Group by calendar date
  const grouped: { date: string; events: TimelineEvent[] }[] = []
  for (const event of visible.slice(0, 120)) {
    const dateLabel = new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const existing = grouped.find((g) => g.date === dateLabel)
    if (existing) existing.events.push(event)
    else grouped.push({ date: dateLabel, events: [event] })
  }

  return (
    <div>
      {/* Type filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              borderRadius: 5,
              border: '1px solid var(--border)',
              background: filter === t ? 'var(--surface-2)' : 'transparent',
              color: filter === t ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t === 'all' ? 'All' : TIMELINE_LABELS[t] ?? t}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>
          {visible.length} events
        </span>
      </div>

      {visible.length === 0 && <EmptyState>No events found</EmptyState>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {grouped.map(({ date, events }) => (
          <div key={date}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {date}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map((event) => {
                const color = TIMELINE_COLORS[event.type] || 'var(--text-faint)'
                const label = TIMELINE_LABELS[event.type] || event.type

                return (
                  <div
                    key={event.id}
                    style={{ display: 'flex', gap: 12, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, alignItems: 'flex-start' }}
                  >
                    <div style={{ width: 36, flexShrink: 0, paddingTop: 1 }}>
                      <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color, background: `color-mix(in srgb, ${color} 12%, transparent)`, padding: '2px 5px', borderRadius: 3 }}>
                        {label}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                          {event.lead_name ? (
                            <Link href={`/leads/${event.lead_id}`} style={{ color: 'var(--text)' }}>
                              {event.lead_name}
                            </Link>
                          ) : (
                            event.title
                          )}
                          {event.lead_name && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>
                              · {event.title}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>
                          {relDate(event.date)}
                        </span>
                      </div>
                      {event.company_name && (
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{event.company_name}</div>
                      )}
                      {event.body && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {event.body}
                        </div>
                      )}
                    </div>
                    {event.meta && (
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, paddingTop: 2 }}>{event.meta}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Shared small components ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
      {children}
    </h2>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
      {children}
    </div>
  )
}

function OppRow({ opp }: { opp: Opportunity }) {
  const urgencyColor = opp.urgency === 'High' ? 'var(--red)' : opp.urgency === 'Medium' ? 'var(--yellow)' : 'var(--text-faint)'

  return (
    <Link href={`/leads/${opp.lead_id}`}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: urgencyColor, flexShrink: 0, marginTop: 4 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{opp.summary}</div>
          {opp.why_now && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {opp.why_now}
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: urgencyColor, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {opp.urgency}
        </span>
      </div>
    </Link>
  )
}

// ── Root component ─────────────────────────────────────────────────────────

export default function StrategicMapClient({
  leads,
  leadMap,
  openOpps,
  healthGroups,
  discoveryGroups,
  timeline,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Strategic
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Strategic Map</h1>
      </div>

      <TabBar active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <OverviewTab
          leads={leads}
          openOpps={openOpps}
          healthGroups={healthGroups}
          discoveryGroups={discoveryGroups}
        />
      )}
      {tab === 'opportunities' && (
        <OpportunityBoardTab openOpps={openOpps} leadMap={leadMap} />
      )}
      {tab === 'health' && (
        <RelationshipHealthTab healthGroups={healthGroups} />
      )}
      {tab === 'discovery' && (
        <DiscoveryPipelineTab discoveryGroups={discoveryGroups} />
      )}
      {tab === 'timeline' && (
        <TimelineTab timeline={timeline} />
      )}
    </div>
  )
}
