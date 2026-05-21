'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  oppId: string
  currentStatus: string
  onChanged?: () => void
}

export default function OpportunityActionsMenu({ oppId, currentStatus, onChanged }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function patchStatus(status: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Update failed (${res.status})`)
      setOpen(false)
      if (onChanged) onChanged()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    const ok = window.confirm('Permanently delete this opportunity? This cannot be undone.')
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${oppId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Delete failed (${res.status})`)
      setOpen(false)
      if (onChanged) onChanged()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  // Status-aware menu items. Snooze is always available; Dismiss + Archive only
  // make sense when the opp isn't already in that state.
  const items: { label: string; action: () => void }[] = []
  if (currentStatus !== 'Snoozed')   items.push({ label: 'Snooze',  action: () => patchStatus('Snoozed') })
  if (currentStatus !== 'Dismissed') items.push({ label: 'Dismiss', action: () => patchStatus('Dismissed') })
  if (currentStatus !== 'Archived')  items.push({ label: 'Archive', action: () => patchStatus('Archived') })

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Opportunity actions"
        style={{
          width: 26,
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          color: 'var(--text-muted)',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.5 : 1,
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 140,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 30,
            padding: 4,
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.action}
              disabled={busy}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                fontSize: 12,
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--r-xs)',
                color: 'var(--text)',
                cursor: busy ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {it.label}
            </button>
          ))}
          {items.length > 0 && (
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '7px 12px',
              fontSize: 12,
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--r-xs)',
              color: 'var(--red)',
              cursor: busy ? 'default' : 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(224,92,92,0.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            Delete
          </button>
          {error && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--red)' }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
