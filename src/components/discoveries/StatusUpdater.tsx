'use client'

import { useState } from 'react'
import type { DiscoveryStatus } from '@/lib/types'

interface StatusUpdaterProps {
  discoveryId: string
  currentStatus: DiscoveryStatus
}

const STATUS_OPTIONS: { value: DiscoveryStatus; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'saved',    label: 'Saved' },
  { value: 'archived', label: 'Archived' },
]

export default function StatusUpdater({ discoveryId, currentStatus }: StatusUpdaterProps) {
  const [status, setStatus] = useState<DiscoveryStatus>(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function update(next: DiscoveryStatus) {
    if (next === status) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Update failed (${res.status})`)
      }
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: 14,
      background: 'var(--surface)',
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--text-faint)',
        marginBottom: 10,
      }}>
        Status
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {STATUS_OPTIONS.map((opt) => {
          const isActive = status === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => update(opt.value)}
              disabled={saving}
              style={{
                flex: 1,
                fontSize: 11,
                padding: '6px 0',
                borderRadius: 'var(--r-xs)',
                border: '1px solid',
                background: isActive
                  ? (opt.value === 'saved' ? 'var(--accent-dim)' : 'var(--surface-2)')
                  : 'transparent',
                borderColor: isActive
                  ? (opt.value === 'saved' ? 'rgba(200,169,110,0.4)' : 'var(--border-hover)')
                  : 'var(--border)',
                color: isActive
                  ? (opt.value === 'saved' ? 'var(--accent)' : 'var(--text)')
                  : 'var(--text-faint)',
                opacity: saving ? 0.5 : 1,
                cursor: saving ? 'default' : 'pointer',
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
