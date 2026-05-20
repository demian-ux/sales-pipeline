'use client'

import { IconSearch, IconX, IconChevronDown } from '@/components/ui/icons'

export interface DiscoveryFilterState {
  region: string
  country: string
  city: string
  sector: string
  opportunity_type: string
  client_type: string
  score_min: number
  source: string
  date_from: string
  date_to: string
  status: string
  search: string
  sort_by: 'score' | 'date'
}

interface FilterPanelProps {
  filters: DiscoveryFilterState
  onChange: (filters: DiscoveryFilterState) => void
}

const REGION_OPTIONS = [
  { value: '',         label: 'All Regions' },
  { value: 'new_york', label: 'New York' },
  { value: 'miami',    label: 'Miami' },
  { value: 'france',   label: 'France' },
  { value: 'europe',   label: 'Europe' },
  { value: 'other',    label: 'Other' },
]

const SECTOR_OPTIONS = [
  { value: '',                   label: 'All Sectors' },
  { value: 'hospitality',        label: 'Hospitality' },
  { value: 'luxury_residential', label: 'Luxury Residential' },
  { value: 'mixed_use',          label: 'Mixed-Use' },
  { value: 'airports',           label: 'Airports' },
  { value: 'office',             label: 'Office' },
  { value: 'transport',          label: 'Transport' },
  { value: 'cultural',           label: 'Cultural' },
  { value: 'retail',             label: 'Retail' },
]

const OPP_TYPE_OPTIONS = [
  { value: '',        label: 'All Types' },
  { value: 'service', label: 'Service' },
  { value: 'tender',  label: 'Tender / RFP' },
  { value: 'trend',   label: 'Strategic Trend' },
]

const CLIENT_TYPE_OPTIONS = [
  { value: '',                      label: 'All Clients' },
  { value: 'architecture_firm',     label: 'Architecture Firm' },
  { value: 'real_estate_developer', label: 'Developer' },
  { value: 'interior_designer',     label: 'Interior Designer' },
  { value: 'urban_planner',         label: 'Urban Planner' },
]

const STATUS_OPTIONS = [
  { value: 'active',   label: 'Active' },
  { value: 'saved',    label: 'Saved' },
  { value: 'archived', label: 'Archived' },
]

const SCORE_OPTIONS = [
  { value: 0,  label: 'All scores' },
  { value: 80, label: '80+ · High' },
  { value: 60, label: '60+ · Review' },
  { value: 40, label: '40+ · Low' },
]

const DEFAULT_FILTERS: DiscoveryFilterState = {
  region: '',
  country: '',
  city: '',
  sector: '',
  opportunity_type: '',
  client_type: '',
  score_min: 0,
  source: '',
  date_from: '',
  date_to: '',
  status: 'active',
  search: '',
  sort_by: 'score',
}

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

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  function set<K extends keyof DiscoveryFilterState>(key: K, value: DiscoveryFilterState[K]) {
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
            onClick={() => onChange(DEFAULT_FILTERS)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--text-faint)',
              background: 'transparent',
              border: 'none',
              padding: 0,
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
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => set('status', opt.value)}
              style={{
                flex: 1,
                fontSize: 11,
                padding: '4px 0',
                borderRadius: 'var(--r-xs)',
                border: '1px solid',
                background: filters.status === opt.value ? 'var(--surface-2)' : 'transparent',
                borderColor: filters.status === opt.value ? 'var(--border-hover)' : 'var(--border)',
                color: filters.status === opt.value ? 'var(--text)' : 'var(--text-faint)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label="Region">
        <NativeSelect value={filters.region} options={REGION_OPTIONS} onChange={(v) => set('region', v)} />
      </Section>
      <Section label="Sector">
        <NativeSelect value={filters.sector} options={SECTOR_OPTIONS} onChange={(v) => set('sector', v)} />
      </Section>
      <Section label="Type">
        <NativeSelect value={filters.opportunity_type} options={OPP_TYPE_OPTIONS} onChange={(v) => set('opportunity_type', v)} />
      </Section>
      <Section label="Client">
        <NativeSelect value={filters.client_type} options={CLIENT_TYPE_OPTIONS} onChange={(v) => set('client_type', v)} />
      </Section>
      <Section label="Min Score">
        <NativeSelect
          value={String(filters.score_min)}
          options={SCORE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => set('score_min', parseInt(v, 10))}
        />
      </Section>
      <Section label="City">
        <input
          type="text"
          value={filters.city}
          onChange={(e) => set('city', e.target.value)}
          placeholder="e.g. Miami"
          style={inputStyle}
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

export { DEFAULT_FILTERS }
