'use client'

import { IconLoader } from '@/components/ui/icons'

interface Props {
  selectedCount: number
  isExporting: boolean
  onExport: () => void
}

export default function ExportBar({ selectedCount, isExporting, onExport }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {selectedCount} firm{selectedCount !== 1 ? 's' : ''} selected
      </div>

      <button
        type="button"
        onClick={onExport}
        disabled={selectedCount === 0 || isExporting}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 14px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          fontSize: 12,
          cursor: selectedCount === 0 || isExporting ? 'default' : 'pointer',
          opacity: selectedCount === 0 || isExporting ? 0.5 : 1,
        }}
      >
        {isExporting && <IconLoader size={11} />}
        {isExporting ? 'Exporting…' : 'Export CSV'}
      </button>
    </div>
  )
}
