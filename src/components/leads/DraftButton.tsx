'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  leadId: string
  kind: 'email' | 'linkedin' | 'letter'
  hasInsight: boolean
  hasExistingDraft: boolean
}

export default function DraftButton({ leadId, kind, hasInsight, hasExistingDraft }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    setLoading(true)
    setError(null)
    try {
      const endpoint =
        kind === 'email' ? `/api/leads/${leadId}/draft-email`
        : kind === 'letter' ? `/api/leads/${leadId}/draft-letter`
        : `/api/leads/${leadId}/draft-linkedin`
      const res = await fetch(endpoint, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Draft failed (${res.status})`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Draft failed')
    } finally {
      setLoading(false)
    }
  }

  const label = kind === 'email' ? 'email' : kind === 'letter' ? 'letter' : 'LinkedIn DM'
  const verb = hasExistingDraft ? 'Regenerate' : 'Draft'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={handle}
        disabled={loading}
        title={hasInsight ? `Generate a fresh ${label} draft for this lead` : `Run "Analyze — why now?" first for stronger context`}
        style={{
          fontSize: 11,
          padding: '5px 10px',
          borderRadius: 5,
          background: loading ? 'var(--surface-3)' : 'var(--accent-dim)',
          border: '1px solid rgba(200,169,110,0.3)',
          color: loading ? 'var(--text-faint)' : 'var(--accent)',
          cursor: loading ? 'default' : 'pointer',
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? '…' : `${verb} ${label}`}
      </button>
      {error && <span style={{ fontSize: 10, color: 'var(--red)', maxWidth: 200 }}>{error}</span>}
    </div>
  )
}
