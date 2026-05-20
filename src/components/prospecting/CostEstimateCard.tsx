'use client'

import type { ProspectingMeta } from '@/lib/prospecting/analyze'

interface Props {
  meta: ProspectingMeta
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: 4,
  }).format(value)
}

export default function CostEstimateCard({ meta }: Props) {
  const c = meta.costEstimate

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
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-2)',
        }}
      >
        <h3
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-faint)',
            margin: 0,
          }}
        >
          Run cost
        </h3>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Total</span>
          <span
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--text)',
              fontFamily: 'SF Mono, ui-monospace, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatUsd(c.totalUsd)}
          </span>
        </div>

        <div style={{ height: 1, background: 'var(--border-subtle)' }} />

        <Row label="Tavily" value={formatUsd(c.tavilyUsd)} note={`${c.tavilyQueries} search${c.tavilyQueries === 1 ? '' : 'es'}`} />
        <Row
          label="Claude"
          value={formatUsd(c.claudeUsd)}
          note={`${c.inputTokens.toLocaleString()} in / ${c.outputTokens.toLocaleString()} out`}
        />
        <Row label="Model" value={meta.model} mono />
        <Row label="Duration" value={`${(meta.durationMs / 1000).toFixed(1)}s`} />
        <Row label="Article" value={`${meta.articleChars.toLocaleString()} chars`} />
        <Row label="Tavily hits" value={`${meta.tavilyResults}`} />
      </div>
    </div>
  )
}

function Row({ label, value, note, mono }: { label: string; value: string; note?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{label}</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text)',
            fontFamily: mono ? 'SF Mono, ui-monospace, monospace' : 'inherit',
            fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </span>
        {note && (
          <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{note}</span>
        )}
      </div>
    </div>
  )
}
