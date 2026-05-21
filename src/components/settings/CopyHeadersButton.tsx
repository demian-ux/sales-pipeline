'use client'

import { useState } from 'react'
import { IconCopy, IconCheck } from '@/components/ui/icons'

interface Props {
  headers: readonly string[]
  // 'tsv' is the format Google Sheets accepts when pasting into a row — one
  // header per column, tab-separated. Paste into cell A1 to set the whole
  // header row in one go.
  format?: 'tsv' | 'csv'
}

export default function CopyHeadersButton({ headers, format = 'tsv' }: Props) {
  const [copied, setCopied] = useState(false)
  const sep = format === 'tsv' ? '\t' : ','
  const text = headers.join(sep)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 'var(--r-xs)',
        border: '1px solid var(--border)',
        background: 'transparent',
        color: 'var(--text-muted)',
        cursor: 'pointer',
      }}
    >
      {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
      {copied ? 'Copied' : `Copy headers (${headers.length})`}
    </button>
  )
}
