'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import OpportunityFilterPanel, {
  DEFAULT_OPPORTUNITY_FILTERS,
  type OpportunityFilterState,
  type OpportunityStatusFilter,
} from '@/components/opportunities/FilterPanel'
import OpportunityCard from '@/components/opportunities/OpportunityCard'
import { IconLoader, IconTrendingUp, IconCalendar, IconZap } from '@/components/ui/icons'
import type { Opportunity, Lead, Company } from '@/lib/types'

interface EnrichedOpportunity extends Opportunity {
  lead?: Lead
  company?: Company
}

const STATUS_GROUPS: Record<OpportunityStatusFilter, string[]> = {
  active:   ['Open', 'In Progress'],
  touched:  ['Contacted', 'Snoozed'],
  closed:   ['Closed', 'Dismissed'],
  archived: ['Archived'],
}

const URGENCY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

export default function OpportunitiesPage() {
  const [filters, setFilters] = useState<OpportunityFilterState>(DEFAULT_OPPORTUNITY_FILTERS)
  const [opportunities, setOpportunities] = useState<EnrichedOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/opportunities')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      setOpportunities(data.opportunities ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load opportunities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const filtered = useMemo(() => {
    const allowedStatuses = new Set(STATUS_GROUPS[filters.status])
    const q = filters.search.trim().toLowerCase()

    const matches = opportunities.filter((o) => {
      if (!allowedStatuses.has(o.status)) return false
      if (filters.urgency && o.urgency !== filters.urgency) return false
      if (filters.confidence_min > 0 && Number(o.confidence) < filters.confidence_min) return false
      if (filters.type && o.opportunity_type !== filters.type) return false
      if (filters.source && !(o.source ?? '').toLowerCase().includes(filters.source.toLowerCase())) return false
      if (filters.lead_attached === 'yes' && !o.lead_id) return false
      if (filters.lead_attached === 'no'  &&  o.lead_id) return false
      if (filters.date_from && new Date(o.created_at) < new Date(filters.date_from)) return false
      if (filters.date_to   && new Date(o.created_at) > new Date(`${filters.date_to}T23:59:59`)) return false
      if (q) {
        const hay = [
          o.summary, o.why_now, o.recommended_action,
          o.company?.company_name, o.lead?.full_name,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    return [...matches].sort((a, b) => {
      if (filters.sort_by === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (filters.sort_by === 'urgency') {
        const u = (URGENCY_RANK[a.urgency] ?? 1) - (URGENCY_RANK[b.urgency] ?? 1)
        if (u !== 0) return u
        return Number(b.confidence) - Number(a.confidence)
      }
      // 'score' (default)
      return Number(b.confidence) - Number(a.confidence)
    })
  }, [opportunities, filters])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Opportunities</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Research-based reasons to reach out — with a clear why now.
          </p>
        </div>
        {!loading && (
          <span style={{
            fontSize: 11,
            fontFamily: 'SF Mono, ui-monospace, monospace',
            color: 'var(--text-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {filtered.length}
          </span>
        )}
      </div>

      {/* Body — filters + grid */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{
          width: 220,
          flexShrink: 0,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}>
          <OpportunityFilterPanel filters={filters} onChange={setFilters} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Sort toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontFamily: 'SF Mono, ui-monospace, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {loading ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <SortButton
                active={filters.sort_by === 'score'}
                onClick={() => setFilters((f) => ({ ...f, sort_by: 'score' }))}
                icon={<IconTrendingUp size={11} />}
                label="Score"
              />
              <SortButton
                active={filters.sort_by === 'urgency'}
                onClick={() => setFilters((f) => ({ ...f, sort_by: 'urgency' }))}
                icon={<IconZap size={11} />}
                label="Urgency"
              />
              <SortButton
                active={filters.sort_by === 'date'}
                onClick={() => setFilters((f) => ({ ...f, sort_by: 'date' }))}
                icon={<IconCalendar size={11} />}
                label="Date"
              />
            </div>
          </div>

          {error && (
            <div style={{
              padding: 12,
              fontSize: 12,
              color: 'var(--red)',
              background: 'var(--red-dim)',
              border: '1px solid rgba(224,92,92,0.2)',
              borderRadius: 'var(--r-md)',
            }}>
              {error}
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-faint)', fontSize: 12 }}>
              <IconLoader size={12} /> Loading…
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="empty-state">
              <div style={{ marginBottom: 6, color: 'var(--text-muted)' }}>No opportunities match this filter.</div>
              <div style={{ fontSize: 11 }}>
                Try the All status pill, or reset filters.
              </div>
            </div>
          )}

          <div style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          }}>
            {filtered.map((opp) => (
              <OpportunityCard
                key={opp.opportunity_id}
                opp={opp}
                lead={opp.lead}
                company={opp.company}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SortButton({
  active, onClick, icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 'var(--r-xs)',
        border: 'none',
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
