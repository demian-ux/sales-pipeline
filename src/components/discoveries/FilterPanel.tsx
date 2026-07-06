'use client'

import type { DiscoveryKind } from '@/lib/types'

export interface DiscoveryFilterState {
  // Which discovery mode's board to show. Driven by the board's mode toggle,
  // not a sidebar filter; sent as the discovery_kind query param. '' = All
  // (both kinds mixed).
  discovery_kind: DiscoveryKind | ''
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
  // Event-type gate + CRM cross-reference
  signal_type: string
  engagement: string
  // ICP-fit filters
  fit_tier: string
  tenure: string
  sector_fit: string
  hide_disqualified: boolean
  // Work-tracking view (2026-07-06). 'active' (default) hides worked material
  // (held / rejected / already_engaged) so the board shows only new signals;
  // 'all' reveals it. The existing-account view is the Account = "Existing
  // accounts" filter (engagement=engaged).
  work_view: 'active' | 'all'
  // 'combined' = blended fit×deal (default) | 'score' = raw deal score | 'date'
  sort_by: 'combined' | 'score' | 'date'
}

interface FilterPanelProps {
  filters: DiscoveryFilterState
  onChange: (filters: DiscoveryFilterState) => void
  // The active board mode. In opportunity_signal mode the launch-only controls
  // (Signal, Type, Client, Tenure, Sector fit) are hidden — those columns are
  // NULL on opp rows, so the filters would only ever empty the board. '' = All.
  mode?: DiscoveryKind | ''
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
  { value: '',                     label: 'All sectors' },
  { value: 'hospitality',          label: 'Hospitality' },
  { value: 'aviation_hospitality', label: 'Aviation / Lounges' },
  { value: 'luxury_residential',   label: 'Luxury Residential' },
  { value: 'mixed_use',            label: 'Mixed-Use' },
  { value: 'cultural',             label: 'Cultural / Civic' },
  { value: 'airports',             label: 'Airport infra' },
  { value: 'office',               label: 'Office' },
  { value: 'transport',            label: 'Transport' },
  { value: 'retail',               label: 'Retail' },
  { value: 'other',                label: 'Other' },
]

// Event type behind the article. KEEP types surface on the active board; the
// "(off)" types are auto-archived — listed so the Archived view is inspectable.
const SIGNAL_TYPE_OPTIONS = [
  { value: '',                    label: 'All signals' },
  { value: 'new_development',     label: 'New development' },
  { value: 'approval_filing',     label: 'Approval / filing' },
  { value: 'groundbreaking',      label: 'Groundbreaking' },
  { value: 'sales_launch',        label: 'Sales launch' },
  { value: 'branded_partnership', label: 'Branded partnership' },
  { value: 'redesign',            label: 'Redesign' },
  { value: 'capital_event',       label: 'Capital event' },
  { value: 'transaction',         label: 'Transaction (off)' },
  { value: 'financing',           label: 'Financing (off)' },
  { value: 'completion',          label: 'Completion (off)' },
  { value: 'policy',              label: 'Policy (off)' },
  { value: 'government_program',  label: 'Government program (off)' },
  { value: 'corporate_pr',        label: 'Corporate PR (off)' },
  { value: 'market_roundup',      label: 'Market roundup (off)' },
  { value: 'infrastructure',      label: 'Infrastructure (off)' },
  { value: 'other',               label: 'Other' },
]

const ENGAGEMENT_OPTIONS = [
  { value: '',        label: 'All firms' },
  { value: 'new',     label: 'New firms only' },
  { value: 'engaged', label: 'Existing accounts' },
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

const FIT_TIER_OPTIONS = [
  { value: '',             label: 'All fit tiers' },
  { value: 'prime',        label: 'Prime fit' },
  { value: 'complement',   label: 'Complement' },
  { value: 'workable',     label: 'Workable' },
  { value: 'weak',         label: 'Weak fit' },
  { value: 'disqualified', label: 'Disqualified' },
]

const TENURE_OPTIONS = [
  { value: '',               label: 'All tenures' },
  { value: 'for_sale',       label: 'For-sale' },
  { value: 'rental',         label: 'Rental' },
  { value: 'owner_occupied', label: 'Owner-occupied' },
  { value: 'mixed',          label: 'Mixed' },
  { value: 'unknown',        label: 'Unknown' },
]

const SECTOR_FIT_OPTIONS = [
  { value: '',       label: 'All sector fit' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
]

// Aligned with the tier thresholds in lib/discoveries/scoring.ts (70/40).
const SCORE_OPTIONS = [
  { value: 0,  label: 'All scores' },
  { value: 40, label: '40+ (Watchlist)' },
  { value: 70, label: '70+ (Strong)' },
]

const DEFAULT_FILTERS: DiscoveryFilterState = {
  discovery_kind: 'project_launch',
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
  signal_type: '',
  engagement: '',
  fit_tier: '',
  tenure: '',
  sector_fit: '',
  hide_disqualified: true,
  work_view: 'active',
  sort_by: 'combined',
}

export default function FilterPanel({ filters, onChange, mode }: FilterPanelProps) {
  const isOpp = mode === 'opportunity_signal'

  function set<K extends keyof DiscoveryFilterState>(key: K, value: DiscoveryFilterState[K]) {
    onChange({ ...filters, [key]: value })
  }

  const hasActive = Object.entries(filters).some(
    ([k, v]) =>
      k !== 'status' && k !== 'sort_by' && k !== 'hide_disqualified' &&
      k !== 'discovery_kind' && k !== 'work_view' && v !== '' && v !== 0,
  )

  return (
    <aside className="filters">
      <div className="between" style={{ marginBottom: 4 }}>
        <span className="micro micro-ink">Filters</span>
        {hasActive && (
          <button
            className="btn btn-xs btn-ghost"
            onClick={() => onChange({ ...DEFAULT_FILTERS, discovery_kind: filters.discovery_kind })}
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

      {/* ICP fit — the headline lens: can oaki sell into this deal? */}
      <div className="filter-section">
        <span className="filter-label">Fit tier</span>
        <Select value={filters.fit_tier} options={FIT_TIER_OPTIONS} onChange={(v) => set('fit_tier', v)} />
      </div>
      {!isOpp && (
        <>
          <div className="filter-section">
            <span className="filter-label">Tenure</span>
            <Select value={filters.tenure} options={TENURE_OPTIONS} onChange={(v) => set('tenure', v)} />
          </div>
          <div className="filter-section">
            <span className="filter-label">Sector fit</span>
            <Select value={filters.sector_fit} options={SECTOR_FIT_OPTIONS} onChange={(v) => set('sector_fit', v)} />
          </div>
        </>
      )}
      <div className="filter-section">
        <label className="row" style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={filters.hide_disqualified}
            onChange={(e) => set('hide_disqualified', e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span className="filter-label" style={{ marginBottom: 0 }}>Hide disqualified</span>
        </label>
      </div>
      <div className="filter-section">
        <label
          className="row"
          style={{ gap: 8, cursor: 'pointer', alignItems: 'center' }}
          title="Reveal worked material — held, rejected, and already-engaged rows the board hides by default"
        >
          <input
            type="checkbox"
            checked={filters.work_view === 'all'}
            onChange={(e) => set('work_view', e.target.checked ? 'all' : 'active')}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          <span className="filter-label" style={{ marginBottom: 0 }}>Show worked (held / rejected)</span>
        </label>
      </div>
      <div className="filter-section">
        <span className="filter-label">Account</span>
        <Select value={filters.engagement} options={ENGAGEMENT_OPTIONS} onChange={(v) => set('engagement', v)} />
      </div>

      <div className="filter-section">
        <span className="filter-label">Region</span>
        <Select value={filters.region} options={REGION_OPTIONS} onChange={(v) => set('region', v)} />
      </div>
      <div className="filter-section">
        <span className="filter-label">Sector</span>
        <Select value={filters.sector} options={SECTOR_OPTIONS} onChange={(v) => set('sector', v)} />
      </div>
      {!isOpp && (
        <>
          <div className="filter-section">
            <span className="filter-label">Signal</span>
            <Select value={filters.signal_type} options={SIGNAL_TYPE_OPTIONS} onChange={(v) => set('signal_type', v)} />
          </div>
          <div className="filter-section">
            <span className="filter-label">Type</span>
            <Select value={filters.opportunity_type} options={OPP_TYPE_OPTIONS} onChange={(v) => set('opportunity_type', v)} />
          </div>
          <div className="filter-section">
            <span className="filter-label">Client</span>
            <Select value={filters.client_type} options={CLIENT_TYPE_OPTIONS} onChange={(v) => set('client_type', v)} />
          </div>
        </>
      )}
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
