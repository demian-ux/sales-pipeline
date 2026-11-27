// Firm Pool — read-only table of every researched firm + its outreach state.
// Views split the firms to contact from the ones already in the CRM, the
// unverified ones and the ones that do not fit (2026-11-27).
// The primary consumer of this data is the weekly skill run via the API
// (/api/firm-pool, /api/value-outreach); this page is just for eyeballing.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { FirmPool, ValueTouch } from '@/lib/types'
import { selectAllPool } from '@/lib/firm-pool/query'

export const dynamic = 'force-dynamic'

const STATUS_ORDER: Record<string, number> = { active: 0, candidate: 1, parked: 2, excluded: 3, converted: 4 }
const STATUS_TONE: Record<string, string> = {
  active: 'var(--green)', candidate: 'var(--accent)', parked: 'var(--ink-3)',
  excluded: 'var(--ink-3)', converted: 'var(--blue)',
}

const CATEGORY_LABEL: Record<string, string> = {
  development: 'Dev', architecture: 'Arch', interior_design: 'Interior',
  hospitality_design: 'Hospitality', landscape: 'Landscape', experiential: 'Experiential',
  new_dev_marketing: 'New-dev mktg',
}
const GEO_LABEL: Record<string, string> = {
  nyc: 'NYC', south_florida: 'S. Florida', california: 'California', seattle: 'Seattle',
  chicago: 'Chicago', dc: 'Washington DC', europe: 'Europe', middle_east: 'Middle East', other: 'Other',
}

// Which slice of the pool to show. The pool holds every researched firm, most
// of them excluded as not fitting, so the default is the firms to work.
const VIEWS = {
  work:     { label: 'To contact',        test: (f: FirmPool) => f.pool_status === 'active' || f.pool_status === 'parked' },
  engaged:  { label: 'Already in the CRM', test: (f: FirmPool) => f.pool_status === 'excluded' && /engaged|warm/i.test(f.exclusion_reason ?? '') },
  pending:  { label: 'Not verified',      test: (f: FirmPool) => f.pool_status === 'candidate' },
  marginal: { label: 'Level C',           test: (f: FirmPool) => f.fit_level === 'C' },
  nofit:    { label: 'Does not fit',      test: (f: FirmPool) => f.fit_level === 'X' },
  all:      { label: 'Everything',        test: () => true },
} as const
type ViewKey = keyof typeof VIEWS

const LEVEL_ORDER: Record<string, number> = { A: 0, B: 1, C: 3, X: 4 }
const RELATIONSHIP_LABEL: Record<string, string> = {
  none: '—', new_lead: 'lead, not contacted', contacted: 'contacted', replied: 'replied', nurture: 'nurture',
  won: 'client', lost: 'lost', dormant: 'dormant', held: 'held',
}

export default async function FirmPoolPage({ searchParams }: { searchParams: Promise<{ view?: string; geo?: string }> }) {
  if (!isSupabaseAdminConfigured()) {
    return <Shell><p className="ink-3">Supabase is not configured.</p></Shell>
  }
  const sp = await searchParams
  const view: ViewKey = sp.view && sp.view in VIEWS ? (sp.view as ViewKey) : 'work'
  const geoFilter = sp.geo && sp.geo in GEO_LABEL ? sp.geo : ''

  const supabase = getSupabaseAdmin()
  // The pool is larger than one PostgREST page — page through it.
  const [{ data: firmData, error }, { data: touchData }] = await Promise.all([
    selectAllPool<FirmPool>(supabase, '*'),
    supabase.from('value_touches').select('firm_id, signal_ref, sent_at'),
  ])

  if (error) {
    return (
      <Shell>
        <p className="ink-3">
          {error.code === '42P01'
            ? 'The firm_pool table does not exist yet — apply supabase/migrations/2026-07-10_firm_pool.sql.'
            : `Error: ${error.message}`}
        </p>
      </Shell>
    )
  }

  const firms = firmData
  const touches = (touchData ?? []) as Pick<ValueTouch, 'firm_id' | 'signal_ref' | 'sent_at'>[]

  const touchStats = new Map<string, { count: number; lastSent: string | null }>()
  for (const t of touches) {
    const s = touchStats.get(t.firm_id) ?? { count: 0, lastSent: null }
    s.count++
    if (t.sent_at && (!s.lastSent || t.sent_at > s.lastSent)) s.lastSent = t.sent_at
    touchStats.set(t.firm_id, s)
  }

  const inView = firms.filter(VIEWS[view].test)
  const shown = geoFilter ? inView.filter((f) => f.geo === geoFilter) : inView
  const sorted = [...shown].sort(
    (a, b) =>
      (STATUS_ORDER[a.pool_status] ?? 9) - (STATUS_ORDER[b.pool_status] ?? 9) ||
      (LEVEL_ORDER[a.fit_level ?? ''] ?? 2) - (LEVEL_ORDER[b.fit_level ?? ''] ?? 2) ||
      a.name.localeCompare(b.name),
  )
  const geoCounts = inView.reduce<Record<string, number>>((m, f) => { const k = f.geo ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m }, {})
  const href = (v: ViewKey, g: string) => `/firm-pool?view=${v}${g ? `&geo=${g}` : ''}`
  const tab = (active: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-xs)', textDecoration: 'none',
    border: '1px solid var(--border)', color: active ? 'var(--ink-1)' : 'var(--ink-2)',
    background: active ? 'var(--surface-2)' : 'transparent', fontWeight: active ? 600 : 400,
  })

  return (
    <Shell>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {(Object.keys(VIEWS) as ViewKey[]).map((v) => (
          <a key={v} href={href(v, '')} style={tab(v === view)}>
            {VIEWS[v].label} <span className="ink-3">{firms.filter(VIEWS[v].test).length}</span>
          </a>
        ))}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <a href={href(view, '')} style={tab(!geoFilter)}>All geos <span className="ink-3">{inView.length}</span></a>
        {Object.entries(geoCounts).filter(([g]) => g in GEO_LABEL).sort((a, b) => b[1] - a[1]).map(([g, n]) => (
          <a key={g} href={href(view, g)} style={tab(g === geoFilter)}>{GEO_LABEL[g]} <span className="ink-3">{n}</span></a>
        ))}
      </div>

      {sorted.length === 0 ? (
        <p className="ink-3">No firms in this view.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '6px 8px' }}>Lvl</th>
                <th style={{ padding: '6px 8px' }}>Firm</th>
                <th style={{ padding: '6px 8px' }}>Based in</th>
                <th style={{ padding: '6px 8px' }}>Categories</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>CRM</th>
                <th style={{ padding: '6px 8px' }}>Touches</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => {
                const st = touchStats.get(f.firm_id)
                const where = [f.hq_city, f.hq_state].filter(Boolean).join(', ')
                const why = f.pool_status === 'excluded' ? f.exclusion_reason : f.fit_reason
                return (
                  <tr key={f.firm_id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600, color: f.fit_level === 'A' ? 'var(--green)' : 'var(--ink-2)' }}>{f.fit_level ?? '·'}</td>
                    <td style={{ padding: '7px 8px', maxWidth: 420 }}>
                      {f.domain ? (
                        <a href={`https://${f.domain}`} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{f.name}</a>
                      ) : (
                        <span style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{f.name}</span>
                      )}
                      {f.work_types && <div className="ink-2" style={{ fontSize: 12 }}>{f.work_types}</div>}
                      {f.recent_project && <div className="ink-3" style={{ fontSize: 11.5 }}>{f.recent_project}</div>}
                      {why && <div className="ink-3" style={{ fontSize: 11.5 }}>{why}</div>}
                      {f.visualization && <div className="ink-3" style={{ fontSize: 11.5 }}>Viz: {f.visualization}</div>}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--ink-2)' }}>
                      {where || '—'}
                      <div className="ink-3" style={{ fontSize: 11 }}>
                        {f.geo ? GEO_LABEL[f.geo] ?? f.geo : 'no geo'}
                        {f.verification_status && f.verification_status !== 'verified' ? ` · ${f.verification_status.replace(/_/g, ' ')}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        {(f.categories ?? []).map((c) => (
                          <span key={c} style={{ fontSize: 10.5, padding: '1px 6px', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', color: 'var(--ink-2)' }}>
                            {CATEGORY_LABEL[c] ?? c}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td style={{ padding: '7px 8px' }}>
                      <span style={{ color: STATUS_TONE[f.pool_status] ?? 'var(--ink-2)', fontWeight: 600, fontSize: 12 }}>{f.pool_status}</span>
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--ink-2)', fontSize: 12 }}>
                      {RELATIONSHIP_LABEL[f.crm_relationship ?? 'none'] ?? f.crm_relationship}
                      {f.crm_leads ? <span className="ink-3"> · {f.crm_leads}</span> : null}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--ink-2)' }}>
                      {st?.count ?? 0}
                      {st?.lastSent ? <div className="ink-3" style={{ fontSize: 11 }}>{st.lastSent.slice(0, 10)}</div> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)' }}>Firm Pool</h1>
        <p className="ink-3" style={{ fontSize: 12.5, marginTop: 2 }}>
          Every firm that has been researched, with where it is based, how well it fits and its relationship with oaki. Signals are matched to the firms to contact by category across the focus geos; the weekly run consumes it via the API.
        </p>
      </div>
      {children}
    </div>
  )
}
