'use client'

import type { CampaignStatus } from '@/lib/types'

export type StatusFilterValue = CampaignStatus | 'all'

interface Props {
  value: StatusFilterValue
  counts: Record<CampaignStatus, number> & { all: number }
  onChange: (value: StatusFilterValue) => void
}

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: 'Active',   label: 'Active' },
  { value: 'Paused',   label: 'Paused' },
  { value: 'Archived', label: 'Archived' },
  { value: 'all',      label: 'All' },
]

export default function CampaignStatusFilter({ value, counts, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        const count = counts[opt.value] ?? 0
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: '7px 14px',
              fontSize: 12,
              border: 'none',
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? 'var(--text)' : 'var(--text-faint)',
              fontWeight: active ? 500 : 400,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {opt.label}
            <span style={{ fontSize: 10, color: active ? 'var(--text-muted)' : 'var(--text-faint)', opacity: 0.7 }}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
