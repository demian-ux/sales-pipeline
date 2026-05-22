'use client'

import { useState } from 'react'
import { Icon, type IconName } from '@/components/ui/icons'
import ApolloImportClient from './ApolloImportClient'
import type { Campaign } from '@/lib/types'

type SourceKey = 'csv' | 'gmail' | 'sheets' | 'paste'

const SOURCES: { key: SourceKey; label: string; icon: IconName; detail: string }[] = [
  { key: 'csv',    label: 'CSV file',      icon: 'archive',  detail: 'Drop an Apollo export — name, email, company, role' },
  { key: 'gmail',  label: 'Gmail',         icon: 'mail',     detail: 'Pull threads matching a query into leads' },
  { key: 'sheets', label: 'Google Sheets', icon: 'external', detail: 'Sync a tab continuously into the roster' },
  { key: 'paste',  label: 'Paste',         icon: 'copy',     detail: 'Paste a list and let Claude parse the fields' },
]

const PLACEHOLDERS: Record<Exclude<SourceKey, 'csv'>, { eyebrow: string; headline: string; body: string }> = {
  gmail: {
    eyebrow: 'Gmail import',
    headline: 'Pull threads matching a query.',
    body: 'Each matching thread becomes a lead and a conversation, with Claude reading the body to fill role, company, and a starting temperature.',
  },
  sheets: {
    eyebrow: 'Sheets sync',
    headline: 'Keep a tab in sync, continuously.',
    body: 'A row added to the sheet appears in the roster on the next sync — useful for a shared list an assistant maintains.',
  },
  paste: {
    eyebrow: 'Paste',
    headline: 'Paste a list — fields get parsed.',
    body: 'Tab-separated, comma-separated, or one-lead-per-line free text. Email-and-context blocks are detected automatically.',
  },
}

export default function ImportClient({ campaigns }: { campaigns: Campaign[] }) {
  const [source, setSource] = useState<SourceKey>('csv')

  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Tools</div>
          <div className="page-title">Import</div>
          <div className="page-sub">
            Bring people in. CSV, Gmail, Sheets, paste — same destination, different paths.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, alignItems: 'flex-start' }}>
        {/* Source picker */}
        <aside className="col" style={{ gap: 6 }}>
          <span className="micro" style={{ color: 'var(--ink-3)', marginBottom: 4 }}>Source</span>
          {SOURCES.map((s) => (
            <button
              key={s.key}
              className={`import-source ${source === s.key ? 'active' : ''}`}
              onClick={() => setSource(s.key)}
            >
              <Icon name={s.icon} size={14} style={{ marginTop: 1 }} />
              <span className="col" style={{ gap: 2 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: source === s.key ? 'var(--ink)' : 'var(--ink-2)' }}>
                  {s.label}
                </span>
                <span className="ink-3" style={{ fontSize: 11, lineHeight: 1.4 }}>{s.detail}</span>
              </span>
            </button>
          ))}
        </aside>

        {/* Panel */}
        <div style={{ minWidth: 0 }}>
          {source === 'csv' ? (
            <ApolloImportClient campaigns={campaigns} />
          ) : (
            <SourcePlaceholder {...PLACEHOLDERS[source]} />
          )}
        </div>
      </div>
    </div>
  )
}

function SourcePlaceholder({
  eyebrow,
  headline,
  body,
}: {
  eyebrow: string
  headline: string
  body: string
}) {
  return (
    <div className="card card-pad-lg">
      <div className="col" style={{ gap: 6 }}>
        <span className="micro" style={{ color: 'var(--ink-3)' }}>{eyebrow}</span>
        <span className="ink" style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-0.012em' }}>
          {headline}
        </span>
        <span className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: '60ch' }}>
          {body}
        </span>
      </div>
      <div
        style={{
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--line-subtle)',
        }}
      >
        <span className="ink-3" style={{ fontSize: 11.5 }}>
          Not wired up yet — CSV import is the working path. Tell the team if you want this source built.
        </span>
      </div>
    </div>
  )
}
