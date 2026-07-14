'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import OpportunityFilterPanel, {
  DEFAULT_OPPORTUNITY_FILTERS,
  type OpportunityFilterState,
  type OpportunityStatusFilter,
} from '@/components/opportunities/FilterPanel'
import OpportunityCard, { type EnrichedOpportunity } from '@/components/opportunities/OpportunityCard'
import { Empty } from '@/components/ui/primitives'

const STATUS_GROUPS: Record<OpportunityStatusFilter, string[]> = {
  active:   ['Open', 'In Progress'],
  touched:  ['Contacted', 'Snoozed'],
  closed:   ['Closed', 'Dismissed'],
  archived: ['Archived'],
}

const STATUS_LABEL: Record<OpportunityStatusFilter, string> = {
  active:   'Open',
  touched:  'Touched',
  closed:   'Closed',
  archived: 'Archived',
}

const URGENCY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

const SORT_OPTIONS: [OpportunityFilterState['sort_by'], string][] = [
  ['score', 'Score'],
  ['urgency', 'Urgency'],
  ['date', 'Date'],
]

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
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Pipeline · Retired</div>
          <div className="page-title">Opportunities</div>
          <div className="page-sub">Historical record of the excavation model. Nothing writes here any more.</div>
        </div>
      </div>

      {/* Retired notice (2026-07-14). This page renders the excavation model —
          fan one signal out to named leads — which v6 of the prospecting process
          replaced with the value lane (a firm-pool batch per signal). It has no
          writer, so it can only ever show closed rows. Kept reachable for audit;
          removed from the sidebar so it never reads as live work. */}
      <div
        className="card"
        style={{ padding: '10px 14px', marginBottom: 16, borderLeft: '2px solid var(--accent)' }}
      >
        <span className="ink-3" style={{ fontSize: 12 }}>
          <strong className="ink">Retired model.</strong> Lead-excavation from signals ended with v6 of the
          prospecting process — no new Opportunities are created, and every row here is closed or dismissed.
          Live work lives in <a href="/discoveries">Discoveries</a> and the <a href="/firm-pool">Firm Pool</a>.
        </span>
      </div>

      {/* Body — filters + result grid */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <OpportunityFilterPanel filters={filters} onChange={setFilters} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Result toolbar */}
          <div className="between" style={{ marginBottom: 16 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>
                {loading
                  ? 'Loading…'
                  : `${filtered.length} ${filtered.length === 1 ? 'opportunity' : 'opportunities'}`}
              </span>
              <span className="ink-3" style={{ fontSize: 12 }}>· {STATUS_LABEL[filters.status]}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="micro" style={{ color: 'var(--ink-3)' }}>Sort</span>
              <div className="seg">
                {SORT_OPTIONS.map(([key, label]) => (
                  <button
                    key={key}
                    className={`seg-btn ${filters.sort_by === key ? 'active' : ''}`}
                    onClick={() => setFilters((f) => ({ ...f, sort_by: key }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div
              className="card card-pad"
              style={{ borderColor: 'var(--risk-line)', marginBottom: 16 }}
            >
              <span className="risk" style={{ fontSize: 12 }}>{error}</span>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && (
            <div className="card">
              <Empty title="No opportunities match this filter.">
                Try a different status, or reset the filters.
              </Empty>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {filtered.map((opp) => (
              <OpportunityCard key={opp.opportunity_id} opp={opp} onChanged={fetchData} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
