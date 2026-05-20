'use client'

import { useState } from 'react'

export default function SyncButton() {
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{ synced_leads: number; total_threads: number } | null>(null)

  async function handleSync() {
    setState('syncing')
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)
      setState('done')
      setTimeout(() => window.location.reload(), 1000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={state === 'syncing' || state === 'done'}
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: '7px 14px',
        background: state === 'done' ? 'var(--green-dim)' : state === 'error' ? 'rgba(224,92,92,0.1)' : 'var(--surface-2)',
        color: state === 'done' ? 'var(--green)' : state === 'error' ? 'var(--red)' : 'var(--text-muted)',
        border: `1px solid ${state === 'done' ? 'rgba(76,175,134,0.3)' : state === 'error' ? 'rgba(224,92,92,0.3)' : 'var(--border)'}`,
        borderRadius: 6,
        cursor: state === 'syncing' || state === 'done' ? 'default' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {state === 'idle' && '↻ Sync Gmail'}
      {state === 'syncing' && 'Syncing…'}
      {state === 'done' && `✓ ${result?.total_threads ?? 0} threads — reloading`}
      {state === 'error' && 'Sync failed'}
    </button>
  )
}
