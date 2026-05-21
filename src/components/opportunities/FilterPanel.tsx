'use client'

import { IconSearch, IconX, IconChevronDown } from '@/components/ui/icons'
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
  { value: '',       label: 'All Urgencies' },
  { value: 'High',   label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low',    label: 'Low' },
]

const CONFIDENCE_OPTIONS = [
  { value: 0,  label: 'All scores' },
  { value: 75, label: '75+' },
  { value: 50, label: '50+' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...OPP_TYPES.map((t) => ({ value: t, label: t })),
]

const LEAD_OPTIONS = [
  { value: '',    label: 'All' },
  { value: 'yes', label: 'With lead' },
  { value: 'no',  label: 'Company-only' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
}

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
    <aside style={{ display: 'flex', flexDirection: 'column', fontSize: 12 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
        }}>
          Filters
        </span>
        {hasActive && (
          <button
            onClick={() => onChange(DEFAULT_OPPORTUNITY_FILTERS)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <IconX size={10} /> Reset
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ position: 'relative' }}>
          <IconSearch
            size={12}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-faint)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search…"
            style={{ ...inputStyle, paddingLeft: 28 }}
          />
        </div>
      </div>

      {/* Status (segmented) */}
      <Section label="Status">
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set('status', opt.value)}
              style={{
                flex: '1 1 calc(50% - 2px)',
                fontSize: 11,
                padding: '4px 0',
                borderRadius: 'var(--r-xs)',
                border: '1px solid',
                background: filters.status === opt.value ? 'var(--surface-2)' : 'transparent',
                borderColor: filters.status === opt.value ? 'var(--border-hover)' : 'var(--border)',
                color: filters.status === opt.value ? 'var(--text)' : 'var(--text-faint)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Urgency">
        <NativeSelect
          value={filters.urgency}
          options={URGENCY_OPTIONS}
          onChange={(v) => set('urgency', v as OpportunityFilterState['urgency'])}
        />
      </Section>
      <Section label="Min Confidence">
        <NativeSelect
          value={String(filters.confidence_min)}
          options={CONFIDENCE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => set('confidence_min', parseInt(v, 10) as OpportunityFilterState['confidence_min'])}
        />
      </Section>
      <Section label="Type">
        <NativeSelect value={filters.type} options={TYPE_OPTIONS} onChange={(v) => set('type', v)} />
      </Section>
      <Section label="Source">
        <input
          type="text"
          value={filters.source}
          onChange={(e) => set('source', e.target.value)}
          placeholder="e.g. Discovery"
          style={inputStyle}
        />
      </Section>
      <Section label="Lead">
        <NativeSelect
          value={filters.lead_attached}
          options={LEAD_OPTIONS}
          onChange={(v) => set('lead_attached', v as OpportunityFilterState['lead_attached'])}
        />
      </Section>
      <Section label="Date range">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="date" value={filters.date_from} onChange={(e) => set('date_from', e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          <input type="date" value={filters.date_to}   onChange={(e) => set('date_to', e.target.value)}   style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>
      </Section>
    </aside>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{
        display: 'block',
        fontSize: 10,
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-faint)',
        marginBottom: 8,
      }}>
        {label}
      </span>
      {children}
    </div>
  )
}

function NativeSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          appearance: 'none',
          paddingRight: 24,
          cursor: 'pointer',
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} style={{ background: 'var(--surface)' }}>
            {opt.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={12}
        style={{
          position: 'absolute',
          right: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-faint)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
