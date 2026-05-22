'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/icons'
import type { Campaign, CampaignStatus } from '@/lib/types'

interface Props {
  campaign: Campaign
  cascadeCounts: { leads: number; opportunities: number }
  onEdit: () => void
}

export default function CampaignActionsMenu({ campaign, cascadeCounts, onEdit }: Props) {
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

  async function patchStatus(status: CampaignStatus) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.campaign_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Update failed (${res.status})`)
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    const { leads, opportunities } = cascadeCounts
    const tail = leads + opportunities > 0
      ? ` This unassigns ${leads} lead${leads === 1 ? '' : 's'} and ${opportunities} opportunit${opportunities === 1 ? 'y' : 'ies'}.`
      : ''
    if (!window.confirm(`Delete "${campaign.name}"?${tail} This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaign.campaign_id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Delete failed (${res.status})`)
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const status = campaign.status
  const statusItems: { label: string; icon: IconName; action: () => void }[] = []
  if (status === 'Active') {
    statusItems.push({ label: 'Pause', icon: 'pause', action: () => patchStatus('Paused') })
    statusItems.push({ label: 'Archive', icon: 'archive', action: () => patchStatus('Archived') })
  } else if (status === 'Paused') {
    statusItems.push({ label: 'Resume', icon: 'arrowup', action: () => patchStatus('Active') })
    statusItems.push({ label: 'Archive', icon: 'archive', action: () => patchStatus('Archived') })
  } else {
    statusItems.push({ label: 'Restore', icon: 'arrowup', action: () => patchStatus('Active') })
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="btn btn-sm btn-icon"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label="Campaign actions"
      >
        <Icon name="more" size={13} />
      </button>
      {open && (
        <div className="menu">
          <button
            className="menu-item"
            onClick={() => { setOpen(false); onEdit() }}
            disabled={busy}
          >
            <span className="row" style={{ gap: 8 }}>
              <Icon name="edit" size={12} /> Edit campaign
            </span>
          </button>
          <div className="menu-sep" />
          {statusItems.map((it) => (
            <button key={it.label} className="menu-item" onClick={it.action} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                <Icon name={it.icon} size={12} /> {it.label}
              </span>
            </button>
          ))}
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
