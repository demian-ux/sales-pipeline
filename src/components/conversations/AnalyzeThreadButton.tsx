'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icons'

interface Props {
  threadId: string
  leadId: string
}

export default function AnalyzeThreadButton({ threadId, leadId }: Props) {
  const router = useRouter()
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
      setTimeout(() => router.refresh(), 600)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed')
      setState('error')
      setTimeout(() => setState('idle'), 4000)
    }
  }

  return (
    <button
      className="btn btn-sm btn-primary"
      onClick={handle}
      disabled={state !== 'idle'}
      title={state === 'error' ? errorMsg : undefined}
    >
      <Icon name="sparkle" size={11} />
      {state === 'idle' && 'Analyze conversation'}
      {state === 'analyzing' && 'Analyzing…'}
      {state === 'done' && 'Done'}
      {state === 'error' && 'Error'}
    </button>
  )
}
