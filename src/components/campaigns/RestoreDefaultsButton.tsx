'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CampaignChannel, CampaignCadence } from '@/lib/types'
import { IconLoader, IconCheck } from '@/components/ui/icons'

// The four campaigns Demian had running before the sheet was cleared to
// fix the column-misalignment bug. Hardcoded here as a one-shot
// restore. Visible on the campaigns page only when zero campaigns exist.
// Safe to delete this component once Demian has restored them.

interface CampaignDefault {
  name: string
  description: string
  cta: string
  channels: CampaignChannel[]
  cadence: CampaignCadence
  location?: string
  pain_point?: string
}

const DEFAULTS: CampaignDefault[] = [
  {
    name: 'Anchor Clients',
    description: 'Quarterly strategic check-ins with top active clients to deepen the relationship and surface new pipeline.',
    cta: 'Set a discovery meeting',
    channels: ['Email'],
    cadence: 'Quarterly',
    location: 'Miami, New York, France',
  },
  {
    name: 'Past Events Leads',
    description: 'Reconnect with leads met in person at 2026 events while the relationship is still warm.',
    cta: 'Set a discovery meeting',
    channels: ['Email', 'LinkedIn'],
    cadence: 'Weekly',
  },
  {
    name: 'Past Clients Rekindling',
    description: "Re-engage past clients who stopped sending work. Show Oaki's upgraded capabilities and address pricing concerns.",
    cta: 'Set a discovery meeting',
    channels: ['Email'],
    cadence: 'Weekly',
    location: 'New York, Miami',
    pain_point: 'Pricing was a concern',
  },
  {
    name: 'Outreach Campaign',
    description: 'Cold outreach to high-fit architects, interior designers, and developers in New York.',
    cta: 'Set a discovery meeting',
    channels: ['Letter', 'Email', 'LinkedIn'],
    cadence: 'Twice weekly',
    location: 'New York',
    pain_point: 'Need to excel in a competitive global market to win work, investment, and attention',
  },
]

export default function RestoreDefaultsButton() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [error, setError]   = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  async function restore() {
    setStatus('running')
    setError(null)
    setProgress(0)
    try {
      for (let i = 0; i < DEFAULTS.length; i++) {
        const res = await fetch('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...DEFAULTS[i], status: 'Active' }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(`${DEFAULTS[i].name}: ${data.error ?? `HTTP ${res.status}`}`)
        }
        setProgress(i + 1)
      }
      setStatus('done')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--green)',
        padding: '6px 12px',
        background: 'var(--green-dim)',
        border: '1px solid rgba(76,175,134,0.3)',
        borderRadius: 'var(--r-sm)',
      }}>
        <IconCheck size={12} /> Restored {DEFAULTS.length} campaigns
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={restore}
        disabled={status === 'running'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 16px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#000',
          fontSize: 13, fontWeight: 600,
          cursor: status === 'running' ? 'default' : 'pointer',
          opacity: status === 'running' ? 0.6 : 1,
          alignSelf: 'flex-start',
        }}
      >
        {status === 'running' && <IconLoader size={12} />}
        {status === 'running'
          ? `Restoring ${progress}/${DEFAULTS.length}…`
          : `Restore default ${DEFAULTS.length} campaigns`}
      </button>
      {error && (
        <div style={{
          fontSize: 12, color: 'var(--red)',
          padding: '8px 12px',
          background: 'var(--red-dim)',
          border: '1px solid rgba(224,92,92,0.25)',
          borderRadius: 'var(--r-sm)',
        }}>
          {error}
        </div>
      )}
    </div>
  )
}
