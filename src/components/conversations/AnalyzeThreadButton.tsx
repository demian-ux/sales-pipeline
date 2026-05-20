'use client'

import { useState } from 'react'

interface Props {
  threadId: string
  leadId: string
}

export default function AnalyzeThreadButton({ threadId, leadId }: Props) {
  const [state, setState] = useState<'idle' | 'analyzing' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handle() {
    setState('analyzing')
    try {
      const res = await fetch('/api/gmail/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setState('done')
      setTimeout(() => window.location.reload(), 600)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed')
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={state !== 'idle'}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 5,
        border: state === 'error' ? '1px solid rgba(224,92,92,0.4)' : '1px solid rgba(200,169,110,0.3)',
        background: state === 'error' ? 'rgba(224,92,92,0.08)' : 'var(--accent-dim)',
        color: state === 'error' ? 'var(--red)' : 'var(--accent)',
        cursor: state === 'idle' ? 'pointer' : 'default',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
      title={state === 'error' ? errorMsg : undefined}
    >
      {state === 'idle' && 'Analyze →'}
      {state === 'analyzing' && 'Analyzing…'}
      {state === 'done' && '✓ Done'}
      {state === 'error' && 'Error'}
    </button>
  )
}
