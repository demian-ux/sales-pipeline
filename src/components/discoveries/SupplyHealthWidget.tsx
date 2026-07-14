'use client'

// Supply-health widget (2026-07-06, Workstream D). A trailing-14-day read on the
// cold lane's real inventory and yield, so the July monthly audit sees the
// supply problem quantitatively. Collapsed to a one-line summary by default.

import { useEffect, useState, useCallback } from 'react'

interface RunPoint {
  id: string
  started_at: string
  discovery_kind: string | null
  net_new: number
  status: string
}

interface SupplyHealth {
  window_days: number
  runs: RunPoint[]
  inventory: { new: number; benched: number; prime: number; workable: number; workable_plus: number }
  totals: { runs: number; net_new: number; drafted: number; draft_rate: number }
}

export default function SupplyHealthWidget() {
  const [data, setData] = useState<SupplyHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  // No synchronous setState here — `loading` initializes true and this runs
  // once on mount, so the effect stays a pure async fetch (react-hooks rule).
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/discoveries/supply-health')
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Request failed (${res.status})`)
        setData(null)
        return
      }
      setData((await res.json()) as SupplyHealth)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading && !data) return null
  if (error) return null // stay quiet on the board if instrumentation isn't ready

  const inv = data?.inventory
  const totals = data?.totals
  const fresh = inv?.new ?? 0
  const runs = data?.runs ?? []
  const doneRuns = runs.filter((r) => r.status === 'done')
  const maxNetNew = Math.max(1, ...doneRuns.map((r) => r.net_new))

  return (
    <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}
      >
        <span className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span className="micro" style={{ color: 'var(--ink-3)' }}>SUPPLY HEALTH · {data?.window_days ?? 14}d</span>
          {/* "New" = never reviewed. Reads 0 after a full triage pass — a benched
              row is reviewed and kept, not backlog, so it is counted separately. */}
          <span className="ink" style={{ fontSize: 13, fontWeight: 600 }}>
            {fresh} new since last review
          </span>
          {fresh > 0 && (
            <span className="ink-3" style={{ fontSize: 11.5 }}>
              ({inv?.prime ?? 0} prime · {inv?.workable ?? 0} workable)
            </span>
          )}
          <span className="ink-3" style={{ fontSize: 11.5 }}>
            · {inv?.benched ?? 0} benched · {totals?.drafted ?? 0} drafted ({data?.window_days ?? 14}d)
          </span>
        </span>
        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          {doneRuns.length === 0 ? (
            <span className="ink-3" style={{ fontSize: 12 }}>No completed runs in the window yet.</span>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 3, alignItems: 'flex-end', height: 56 }}>
                {/* Bars are net-new per run. There is deliberately no per-run
                    draft marker: drafting happens outside the run (lead created
                    from a discovery, days later), so attributing a draft to one
                    run was always a fiction — the honest count is the window total. */}
                {doneRuns.map((r) => {
                  const h = Math.round((r.net_new / maxNetNew) * 48) + 2
                  return (
                    <div
                      key={r.id}
                      title={`${new Date(r.started_at).toLocaleDateString()} · ${r.discovery_kind ?? 'run'} · ${r.net_new} net-new`}
                      style={{ flex: 1, minWidth: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                    >
                      <div
                        style={{
                          width: '100%', maxWidth: 18, height: h, borderRadius: 2,
                          background: r.discovery_kind === 'opportunity_signal' ? 'var(--blue-dim)' : 'var(--accent-dim)',
                          border: `1px solid ${r.discovery_kind === 'opportunity_signal' ? 'rgba(92,142,212,0.35)' : 'rgba(200,169,110,0.35)'}`,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
                <Legend swatch="var(--accent-dim)" label="Launch net-new" />
                <Legend swatch="var(--blue-dim)" label="Opp net-new" />
                <span className="ink-3" style={{ fontSize: 11 }}>
                  {totals?.net_new ?? 0} net-new → {totals?.drafted ?? 0} drafted over {totals?.runs ?? 0} runs
                  {' · '}draft rate {totals?.draft_rate ?? 0} per net-new
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Legend({ swatch, label, dot }: { swatch: string; label: string; dot?: boolean }) {
  return (
    <span className="row" style={{ gap: 5, alignItems: 'center' }}>
      <span style={{ width: dot ? 6 : 10, height: dot ? 6 : 10, borderRadius: dot ? '50%' : 2, background: swatch, display: 'inline-block' }} />
      <span className="ink-3" style={{ fontSize: 11 }}>{label}</span>
    </span>
  )
}
