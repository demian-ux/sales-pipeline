'use client'

import { useState } from 'react'

interface Props {
  oppId: string
  status: string
  label: string
  variant?: 'default' | 'accent'
}

export default function OppStatusButton({ oppId, status, label, variant = 'default' }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (loading || done) return
    setLoading(true)
    try {
      await fetch(`/api/opportunities/${oppId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setDone(true)
      setTimeout(() => window.location.reload(), 600)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handle}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 5,
        border: done
          ? 'none'
          : variant === 'accent'
          ? '1px solid var(--accent)'
          : '1px solid var(--border)',
        background: done
          ? 'var(--green-dim)'
          : variant === 'accent'
          ? 'rgba(200,169,110,0.08)'
          : 'transparent',
        color: done
          ? 'var(--green)'
          : variant === 'accent'
          ? 'var(--accent)'
          : 'var(--text-faint)',
        cursor: loading || done ? 'default' : 'pointer',
        transition: 'all 0.15s',
        flexShrink: 0,
        opacity: loading ? 0.5 : 1,
      }}
    >
      {done ? '✓ Done' : loading ? '…' : label}
    </button>
  )
}
