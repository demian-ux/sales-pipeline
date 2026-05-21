'use client'

import { FormEvent, useState } from 'react'
import { IconLoader } from '@/components/ui/icons'

interface Props {
  onSubmit: (url: string) => void
  isLoading: boolean
  // Optional initial value — used when the page is entered from elsewhere
  // (e.g. a Discovery card) with the URL pre-supplied via query param.
  initialUrl?: string
}

export default function UrlForm({ onSubmit, isLoading, initialUrl = '' }: Props) {
  const [url, setUrl] = useState(initialUrl)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
      }}
    >
      <label
        htmlFor="prospecting-url"
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
        }}
      >
        Article URL
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="prospecting-url"
          type="url"
          required
          placeholder="https://www.dezeen.com/..."
          value={url}
          disabled={isLoading}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '8px 12px',
            fontSize: 13,
            color: 'var(--text)',
            outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#000',
            fontSize: 13,
            fontWeight: 600,
            cursor: isLoading || !url.trim() ? 'default' : 'pointer',
            opacity: isLoading || !url.trim() ? 0.5 : 1,
          }}
        >
          {isLoading && <IconLoader size={12} />}
          {isLoading ? 'Analyzing…' : 'Find firms'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Pipeline: Jina Reader → Claude extracts project metadata → Tavily finds candidate firms → Claude scores 5–8 prospects.
        Typically 30–60 seconds.
      </div>
    </form>
  )
}
