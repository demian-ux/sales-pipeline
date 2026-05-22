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
    <div className="seg">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          className={`seg-btn ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          <span className="ct">{counts[opt.value] ?? 0}</span>
        </button>
      ))}
    </div>
  )
}
