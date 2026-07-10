// Firm Pool — read-only table of the value-lane population + outreach state.
// The primary consumer of this data is the weekly skill run via the API
// (/api/firm-pool, /api/value-outreach); this page is just for eyeballing.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { FirmPool, ValueTouch } from '@/lib/types'

export const dynamic = 'force-dynamic'

const STATUS_ORDER: Record<string, number> = { active: 0, candidate: 1, parked: 2, excluded: 3, converted: 4 }
const STATUS_TONE: Record<string, string> = {
  active: 'var(--green)', candidate: 'var(--accent)', parked: 'var(--ink-3)',
  excluded: 'var(--ink-3)', converted: 'var(--blue)',
}

const CATEGORY_LABEL: Record<string, string> = {
  development: 'Dev', architecture: 'Arch', interior_design: 'Interior',
  hospitality_design: 'Hospitality', landscape: 'Landscape', experiential: 'Experiential',
}
const GEO_LABEL: Record<string, string> = {
  nyc: 'NYC', south_florida: 'S. Florida', europe: 'Europe', middle_east: 'Middle East', other: 'Other',
}

export default async function FirmPoolPage() {
  if (!isSupabaseAdminConfigured()) {
    return <Shell><p className="ink-3">Supabase is not configured.</p></Shell>
  }
  const supabase = getSupabaseAdmin()
  const [{ data: firmData, error }, { data: touchData }] = await Promise.all([
    supabase.from('firm_pool').select('*'),
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

  const firms = (firmData ?? []) as FirmPool[]
  const touches = (touchData ?? []) as Pick<ValueTouch, 'firm_id' | 'signal_ref' | 'sent_at'>[]

  const touchStats = new Map<string, { count: number; lastSent: string | null }>()
  for (const t of touches) {
    const s = touchStats.get(t.firm_id) ?? { count: 0, lastSent: null }
    s.count++
    if (t.sent_at && (!s.lastSent || t.sent_at > s.lastSent)) s.lastSent = t.sent_at
    touchStats.set(t.firm_id, s)
  }

  const sorted = [...firms].sort(
    (a, b) => (STATUS_ORDER[a.pool_status] ?? 9) - (STATUS_ORDER[b.pool_status] ?? 9) || a.name.localeCompare(b.name),
  )
  const counts = firms.reduce<Record<string, number>>((m, f) => ((m[f.pool_status] = (m[f.pool_status] ?? 0) + 1), m), {})

  return (
    <Shell>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(counts).sort((a, b) => (STATUS_ORDER[a[0]] ?? 9) - (STATUS_ORDER[b[0]] ?? 9)).map(([s, n]) => (
          <span key={s} style={{ fontSize: 12, color: 'var(--ink-2)' }}>
            <strong style={{ color: STATUS_TONE[s] ?? 'var(--ink-1)' }}>{n}</strong> {s}
          </span>
        ))}
        <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 'auto' }}>{firms.length} firms total</span>
      </div>

      {firms.length === 0 ? (
        <p className="ink-3">Pool is empty — apply the migration seed or POST to /api/firm-pool.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--ink-3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <th style={{ padding: '6px 8px' }}>Firm</th>
                <th style={{ padding: '6px 8px' }}>Categories</th>
                <th style={{ padding: '6px 8px' }}>Geo</th>
                <th style={{ padding: '6px 8px' }}>Status</th>
                <th style={{ padding: '6px 8px' }}>Touches</th>
                <th style={{ padding: '6px 8px' }}>Last sent</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => {
                const st = touchStats.get(f.firm_id)
                return (
                  <tr key={f.firm_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px' }}>
                      <span style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{f.name}</span>
                      {f.pool_status === 'excluded' && f.exclusion_reason && (
                        <span className="ink-3" style={{ fontSize: 11 }}> · {f.exclusion_reason}</span>
                      )}
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
                    <td style={{ padding: '7px 8px', color: 'var(--ink-2)' }}>{f.geo ? GEO_LABEL[f.geo] ?? f.geo : '—'}</td>
                    <td style={{ padding: '7px 8px' }}>
                      <span style={{ color: STATUS_TONE[f.pool_status] ?? 'var(--ink-2)', fontWeight: 600, fontSize: 12 }}>{f.pool_status}</span>
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--ink-2)' }}>{st?.count ?? 0}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--ink-3)' }}>{st?.lastSent ? st.lastSent.slice(0, 10) : '—'}</td>
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
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 6 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink-1)' }}>Firm Pool</h1>
        <p className="ink-3" style={{ fontSize: 12.5, marginTop: 2 }}>
          The value-lane population + outreach state. Matched to upstream signals by category ∩ geo; the weekly run consumes it via the API.
        </p>
      </div>
      {children}
    </div>
  )
}
