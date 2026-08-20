'use client'

import { useCallback, useEffect, useState } from 'react'

interface Touch { signal_ref: string; sent_at: string | null; reply_status: string }
interface SeatRow {
  seat_id: string
  firm_id: string
  candidate_name: string | null
  title: string | null
  email: string | null
  email_status: string
  seat_status: string
  fail_reason: string | null
  seat_source: string | null
  credits_spent: number
  linkedin_url: string | null
  found_at: string | null
  firm_pool: { name: string; domain: string | null; geo: string | null; categories: string[]; icp_notes: string | null } | null
  touches: Touch[]
}
interface ApiResponse {
  seats: SeatRow[]
  budget: { weekly: number; spent_this_week: number | null }
  error?: string
}

const TABS = [
  { key: 'seat_pending', label: 'Pending' },
  { key: 'unworked', label: 'Waterfall' },
  { key: 'lead_created', label: 'Approved' },
  { key: 'seat_failed', label: 'Failed' },
] as const

export default function SeatsQueueClient() {
  const [tab, setTab] = useState<string>('seat_pending')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [refresh, setRefresh] = useState(0)
  const load = useCallback(() => setRefresh((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/seats?status=${tab}`)
        const json = (await res.json()) as ApiResponse
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
        if (!cancelled) { setData(json); setError(null) }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [tab, refresh])

  const act = async (seatId: string, action: 'approve' | 'reject') => {
    let body: string | undefined
    if (action === 'reject') {
      const reason = window.prompt('Reject reason:')
      if (!reason?.trim()) return
      body = JSON.stringify({ reason: reason.trim() })
    }
    setBusy(seatId)
    try {
      const res = await fetch(`/api/seats/${seatId}/${action}`, {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      load()
    } catch (e) {
      window.alert(`${action} failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  const budget = data?.budget
  return (
    <div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
              fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--ink-1)' : 'var(--ink-3)',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
        {budget && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-2)' }}>
            Credits this week:{' '}
            <strong style={{ color: (budget.spent_this_week ?? 0) >= budget.weekly ? 'var(--red, #c0392b)' : 'var(--ink-1)' }}>
              {budget.spent_this_week ?? '—'}
            </strong>{' '}
            / {budget.weekly}
          </span>
        )}
      </div>

      {error && <p style={{ color: 'var(--red, #c0392b)', fontSize: 13 }}>{error}</p>}
      {loading && <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading…</p>}
      {!loading && !error && (data?.seats.length ?? 0) === 0 && (
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Nothing here.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data?.seats ?? []).map((s) => (
          <div key={s.seat_id} style={{ border: '1px solid var(--line, #e3e0da)', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{s.firm_pool?.name ?? s.firm_id}</strong>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {s.firm_pool?.geo}{s.firm_pool?.categories?.length ? ` · ${s.firm_pool.categories.join(', ')}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>
                {s.credits_spent} credit{s.credits_spent === 1 ? '' : 's'}{s.seat_source ? ` · ${s.seat_source}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              {s.candidate_name ?? '—'}{s.title ? ` — ${s.title}` : ''}
              {s.email && (
                <>
                  {' · '}<span style={{ fontFamily: 'monospace' }}>{s.email}</span>
                  <span style={{ fontSize: 11, color: s.email_status.includes('verified') ? 'var(--green, #27ae60)' : 'var(--ink-3)', marginLeft: 6 }}>
                    {s.email_status}
                  </span>
                </>
              )}
              {s.linkedin_url && (
                <> {' · '}<a href={s.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>LinkedIn</a></>
              )}
            </div>
            {s.fail_reason && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Reason: {s.fail_reason}</div>}
            {s.touches.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6 }}>
                Previous touches:{' '}
                {s.touches.map((t) => `${t.signal_ref}${t.sent_at ? ` (sent ${t.sent_at.slice(0, 10)})` : ' (staged)'}`).join(' · ')}
              </div>
            )}
            {s.seat_status === 'seat_pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  disabled={busy === s.seat_id}
                  onClick={() => act(s.seat_id, 'approve')}
                  style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--green, #27ae60)', color: 'var(--green, #27ae60)', background: 'none', cursor: 'pointer' }}
                >
                  {busy === s.seat_id ? '…' : 'Approve → lead'}
                </button>
                <button
                  disabled={busy === s.seat_id}
                  onClick={() => act(s.seat_id, 'reject')}
                  style={{ fontSize: 13, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--line, #e3e0da)', color: 'var(--ink-2)', background: 'none', cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
