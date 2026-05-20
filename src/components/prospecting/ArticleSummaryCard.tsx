'use client'

import type { ProspectingArticle } from '@/lib/types'
import { IconExternalLink } from '@/components/ui/icons'

interface Props {
  article: ProspectingArticle
  sourceUrl: string
}

export default function ArticleSummaryCard({ article, sourceUrl }: Props) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-faint)',
          }}
        >
          Article
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {article.title}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Type" value={article.project_type} />
          <Field label="Scale" value={article.scale} />
          <Field label="Location" value={article.location} />
        </div>

        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: 'var(--text-faint)',
            wordBreak: 'break-all',
          }}
        >
          <IconExternalLink size={11} style={{ flexShrink: 0 }} />
          {sourceUrl}
        </a>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-faint)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value}</div>
    </div>
  )
}
