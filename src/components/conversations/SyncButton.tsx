'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconRefresh } from '@/components/ui/icons'

export default function SyncButton() {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')

  async function handleSync() {
    setState('syncing')
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      setState('done')
      setTimeout(() => router.refresh(), 800)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button className="btn" onClick={handleSync} disabled={state === 'syncing' || state === 'done'}>
      <IconRefresh size={12} />
      {state === 'idle' && 'Sync Gmail'}
      {state === 'syncing' && 'Syncing…'}
      {state === 'done' && 'Synced — reloading'}
      {state === 'error' && 'Sync failed'}
    </button>
  )
}
