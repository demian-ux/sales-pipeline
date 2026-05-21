'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Badge from '@/components/ui/Badge'
import { IconSearch, IconX, IconLoader } from '@/components/ui/icons'
import { urgencyVariant } from '@/lib/utils'
import type { Opportunity, Lead, Company } from '@/lib/types'

interface EnrichedOpportunity extends Opportunity {
  lead?: Lead
  company?: Company
}

interface Props {
  currentLeadId: string
  currentLeadName: string
  // Opps already attached to this lead — we exclude them from the dropdown.
  excludeOppIds: string[]
}

export default function AttachOpportunityDropdown({ currentLeadId, currentLeadName, excludeOppIds }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null) // opp_id currently being attached
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [opps, setOpps] = useState<EnrichedOpportunity[]>([])
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Load opps when opened
  useEffect(() => {
    if (!open || opps.length > 0) return
    setLoading(true)
    setError(null)
    fetch('/api/opportunities')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setOpps(data.opportunities ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [open, opps.length])

  // Outside-click close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const excludeSet = useMemo(() => new Set(excludeOppIds), [excludeOppIds])

  const selectable = useMemo(() => {
    const q = search.trim().toLowerCase()
    return opps
      .filter((o) => o.status === 'Open' || o.status === 'In Progress')
      .filter((o) => !excludeSet.has(o.opportunity_id))
      .filter((o) => {
        if (!q) return true
        const hay = [
          o.summary, o.opportunity_type, o.why_now,
          o.company?.company_name, o.lead?.full_name,
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
  }, [opps, excludeSet, search])

  async function attach(opp: EnrichedOpportunity) {
    if (opp.lead_id && opp.lead_id !== currentLeadId) {
      const otherName = opp.lead?.full_name ?? opp.lead_id
      const ok = window.confirm(
        `Move "${opp.summary || opp.opportunity_type}" from ${otherName} to ${currentLeadName}?`,
      )
      if (!ok) return
    }
    setBusy(opp.opportunity_id)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${opp.opportunity_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: currentLeadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Attach failed (${res.status})`)
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attach failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontSize: 12,
          padding: '6px 12px',
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 6,
          color: 'var(--text-faint)',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        + Attach existing opportunity
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: 380,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 30,
          }}
        >
          {/* Search */}
          <div style={{ padding: 10, borderBottom: '1px solid var(--border-subtle)', position: 'relative' }}>
            <IconSearch
              size={12}
              style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }}
            />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities…"
              style={{
                width: '100%',
                padding: '6px 10px 6px 28px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                fontSize: 12,
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>
                <IconLoader size={12} /> Loading opportunities…
              </div>
            )}
            {error && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--red)' }}>
                {error}
              </div>
            )}
            {!loading && !error && selectable.length === 0 && (
              <div style={{ padding: 16, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
                {opps.length === 0 ? 'No opportunities found.' : 'No matches.'}
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Create new ones in <a href="/opportunities" style={{ color: 'var(--accent)' }}>Opportunities</a>.
                </div>
              </div>
            )}
            {selectable.map((opp) => {
              const isOnOther = !!(opp.lead_id && opp.lead_id !== currentLeadId)
              return (
                <button
                  key={opp.opportunity_id}
                  type="button"
                  onClick={() => attach(opp)}
                  disabled={busy !== null}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    cursor: busy ? 'default' : 'pointer',
                    opacity: busy === opp.opportunity_id ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!busy) e.currentTarget.style.background = 'var(--surface-2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                      {opp.opportunity_type}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{opp.confidence}%</span>
                      <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
                    </div>
                  </div>
                  {opp.summary && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 4 }}>
                      {opp.summary.length > 120 ? `${opp.summary.slice(0, 119)}…` : opp.summary}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {opp.company?.company_name && <span>{opp.company.company_name}</span>}
                    {isOnOther && (
                      <span style={{ color: 'var(--yellow)' }}>
                        · currently on {opp.lead?.full_name ?? opp.lead_id}
                      </span>
                    )}
                    {!opp.lead_id && <span style={{ color: 'var(--text-faint)' }}>· no lead attached</span>}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: 'var(--text-faint)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <IconX size={10} /> Close
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {selectable.length} available
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
