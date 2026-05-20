'use client'

import { useState } from 'react'

interface Props {
  text: string
  label?: string
}

export default function CopyButton({ text, label = 'Copy' }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback for older browsers
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <button
      onClick={handleCopy}
      style={{
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 5,
        border: '1px solid var(--border)',
        background: copied ? 'var(--green-dim)' : 'var(--surface-2)',
        color: copied ? 'var(--green)' : 'var(--text-faint)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
