'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icons'

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
      onChanged?.()
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
      onChanged?.()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="btn btn-sm btn-icon"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Opportunity actions"
      >
        <Icon name="more" size={13} />
      </button>
      {open && (
        <div className="menu">
          {currentStatus !== 'Snoozed' && (
            <button className="menu-item" onClick={() => patchStatus('Snoozed')} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                <Icon name="snooze" size={12} /> Snooze
              </span>
            </button>
          )}
          {currentStatus !== 'Dismissed' && (
            <button className="menu-item" onClick={() => patchStatus('Dismissed')} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                <Icon name="x" size={12} /> Dismiss
              </span>
            </button>
          )}
          {currentStatus !== 'Archived' && (
            <button className="menu-item" onClick={() => patchStatus('Archived')} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                <Icon name="archive" size={12} /> Archive
              </span>
            </button>
          )}
          <div className="menu-sep" />
          <button className="menu-item danger" onClick={handleDelete} disabled={busy}>
            <span className="row" style={{ gap: 8 }}>
              <Icon name="trash" size={12} /> Delete
            </span>
          </button>
          {error && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--risk)' }}>{error}</div>
          )}
        </div>
      )}
    </div>
  )
}
