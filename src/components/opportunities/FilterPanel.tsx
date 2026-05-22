'use client'

import { OPP_TYPES } from '@/lib/constants/opportunity-types'

export type OpportunityStatusFilter = 'active' | 'touched' | 'closed' | 'archived'

export interface OpportunityFilterState {
  status: OpportunityStatusFilter
  urgency: '' | 'High' | 'Medium' | 'Low'
  confidence_min: 0 | 50 | 75
  type: string
  source: string
  lead_attached: '' | 'yes' | 'no'
  date_from: string
  date_to: string
  search: string
  sort_by: 'score' | 'urgency' | 'date'
}

export const DEFAULT_OPPORTUNITY_FILTERS: OpportunityFilterState = {
  status: 'active',
  urgency: '',
  confidence_min: 0,
  type: '',
  source: '',
  lead_attached: '',
  date_from: '',
  date_to: '',
  search: '',
  sort_by: 'score',
}

const STATUS_OPTIONS: { value: OpportunityStatusFilter; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'touched',  label: 'Touched' },
  { value: 'closed',   label: 'Closed' },
  { value: 'archived', label: 'Archived' },
]

const URGENCY_OPTIONS = [
  { value: '',       label: 'All urgencies' },
  { value: 'High',   label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low',    label: 'Low' },
]

const CONFIDENCE_OPTIONS = [
  { value: 0,  label: 'All scores' },
  { value: 50, label: '50+' },
  { value: 75, label: '75+' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  ...OPP_TYPES.map((t) => ({ value: t, label: t })),
]

const LEAD_OPTIONS = [
  { value: '',    label: 'All' },
  { value: 'yes', label: 'With lead' },
  { value: 'no',  label: 'Company-only' },
]

interface Props {
  filters: OpportunityFilterState
  onChange: (next: OpportunityFilterState) => void
}

export default function OpportunityFilterPanel({ filters, onChange }: Props) {
  function set<K extends keyof OpportunityFilterState>(key: K, value: OpportunityFilterState[K]) {
    onChange({ ...filters, [key]: value })
  }

  const hasActive = Object.entries(filters).some(
    ([k, v]) => k !== 'status' && k !== 'sort_by' && v !== '' && v !== 0,
  )

  return (
    <aside className="filters">
      <div className="between" style={{ marginBottom: 4 }}>
        <span className="micro micro-ink">Filters</span>
        {hasActive && (
          <button
            className="btn btn-xs btn-ghost"
            onClick={() => onChange(DEFAULT_OPPORTUNITY_FILTERS)}
          >
            Reset
          </button>
        )}
      </div>

      <div className="filter-section">
        <input
          className="input input-search"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search summary, lead, type"
        />
      </div>

      <div className="filter-section">
        <span className="filter-label">Status</span>
        <div className="seg" style={{ width: '100%' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`seg-btn ${filters.status === opt.value ? 'active' : ''}`}
              onClick={() => set('status', opt.value)}
              style={{ flex: 1, justifyContent: 'center', padding: '4px 4px', fontSize: 11 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <span className="filter-label">Urgency</span>
        <Select
          value={filters.urgency}
          options={URGENCY_OPTIONS}
          onChange={(v) => set('urgency', v as OpportunityFilterState['urgency'])}
        />
      </div>
      <div className="filter-section">
        <span className="filter-label">Min confidence</span>
        <Select
          value={String(filters.confidence_min)}
          options={CONFIDENCE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => set('confidence_min', parseInt(v, 10) as OpportunityFilterState['confidence_min'])}
        />
      </div>
      <div className="filter-section">
        <span className="filter-label">Type</span>
        <Select value={filters.type} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Source</span>
        <input
          className="input"
          value={filters.source}
          onChange={(e) => set('source', e.target.value)}
          placeholder="e.g. Discovery"
        />
      </div>
      <div className="filter-section">
        <span className="filter-label">Lead</span>
        <Select
          value={filters.lead_attached}
          options={LEAD_OPTIONS}
          onChange={(v) => set('lead_attached', v as OpportunityFilterState['lead_attached'])}
        />
      </div>
      <div className="filter-section">
        <span className="filter-label">Date range</span>
        <div className="row" style={{ gap: 6 }}>
          <input
            type="date"
            className="input"
            value={filters.date_from}
            onChange={(e) => set('date_from', e.target.value)}
            style={{ width: '50%', colorScheme: 'dark' }}
          />
          <input
            type="date"
            className="input"
            value={filters.date_to}
            onChange={(e) => set('date_to', e.target.value)}
            style={{ width: '50%', colorScheme: 'dark' }}
          />
        </div>
      </div>
    </aside>
  )
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} style={{ background: 'var(--surface)' }}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
