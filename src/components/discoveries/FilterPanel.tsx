'use client'

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
  { value: '',         label: 'All regions' },
  { value: 'new_york', label: 'New York' },
  { value: 'miami',    label: 'Miami' },
  { value: 'france',   label: 'France' },
  { value: 'europe',   label: 'Europe' },
  { value: 'other',    label: 'Other' },
]

const SECTOR_OPTIONS = [
  { value: '',                   label: 'All sectors' },
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
  { value: '',        label: 'All types' },
  { value: 'service', label: 'Service' },
  { value: 'tender',  label: 'Tender / RFP' },
  { value: 'trend',   label: 'Strategic Trend' },
]

const CLIENT_TYPE_OPTIONS = [
  { value: '',                      label: 'All clients' },
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

// Aligned with the tier thresholds in lib/discoveries/scoring.ts (70/40).
const SCORE_OPTIONS = [
  { value: 0,  label: 'All scores' },
  { value: 40, label: '40+ (Watchlist)' },
  { value: 70, label: '70+ (Strong)' },
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

export default function FilterPanel({ filters, onChange }: FilterPanelProps) {
  function set<K extends keyof DiscoveryFilterState>(key: K, value: DiscoveryFilterState[K]) {
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
          <button className="btn btn-xs btn-ghost" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </button>
        )}
      </div>

      <div className="filter-section">
        <input
          className="input input-search"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search title, source"
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
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <span className="filter-label">Region</span>
        <Select value={filters.region} options={REGION_OPTIONS} onChange={(v) => set('region', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Sector</span>
        <Select value={filters.sector} options={SECTOR_OPTIONS} onChange={(v) => set('sector', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Type</span>
        <Select value={filters.opportunity_type} options={OPP_TYPE_OPTIONS} onChange={(v) => set('opportunity_type', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Client</span>
        <Select value={filters.client_type} options={CLIENT_TYPE_OPTIONS} onChange={(v) => set('client_type', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Min score</span>
        <Select
          value={String(filters.score_min)}
          options={SCORE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
          onChange={(v) => set('score_min', parseInt(v, 10))}
        />
      </div>

      <div className="filter-section">
        <span className="filter-label">City</span>
        <input
          className="input"
          value={filters.city}
          onChange={(e) => set('city', e.target.value)}
          placeholder="e.g. Miami"
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

export { DEFAULT_FILTERS }
