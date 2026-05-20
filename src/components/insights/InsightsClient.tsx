'use client'
/* eslint-disable react/no-unescaped-entities */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import type { AIInsight, Lead, IntentLevel } from '@/lib/types'
import { relativeDate } from '@/lib/utils'

type EnrichedInsight = AIInsight & { lead?: Lead }

type SortKey = 'created_at' | 'confidence' | 'intent_level'
type FilterIntent = 'all' | IntentLevel

const INTENT_ORDER: Record<IntentLevel, number> = { high: 0, medium: 1, low: 2 }

interface Props {
  insights: EnrichedInsight[]
}

export default function InsightsClient({ insights }: Props) {
  const [sort, setSort] = useState<SortKey>('created_at')
  const [filterIntent, setFilterIntent] = useState<FilterIntent>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = filterIntent === 'all' ? insights : insights.filter((i) => i.intent_level === filterIntent)
    list = [...list].sort((a, b) => {
      if (sort === 'confidence') return b.confidence - a.confidence
      if (sort === 'intent_level') return INTENT_ORDER[a.intent_level] - INTENT_ORDER[b.intent_level]
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return list
  }, [insights, sort, filterIntent])

  const intentCounts = useMemo(() => ({
    high: insights.filter((i) => i.intent_level === 'high').length,
    medium: insights.filter((i) => i.intent_level === 'medium').length,
    low: insights.filter((i) => i.intent_level === 'low').length,
  }), [insights])

  if (insights.length === 0) {
    return (
      <div style={{ padding: '40px 24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No analyses yet.</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Open a lead and click "Analyze — Why now?" to generate your first insight.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        {/* Intent filter */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'high', 'medium', 'low'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setFilterIntent(level)}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: filterIntent === level ? 600 : 400,
                cursor: 'pointer',
                border: filterIntent === level ? 'none' : '1px solid var(--border)',
                background: filterIntent === level
                  ? level === 'high' ? 'var(--green-dim)'
                    : level === 'medium' ? 'var(--yellow-dim)'
                    : level === 'low' ? 'var(--surface-3)'
                    : 'var(--surface-2)'
                  : 'transparent',
                color: filterIntent === level
                  ? level === 'high' ? 'var(--green)'
                    : level === 'medium' ? 'var(--yellow)'
                    : level === 'low' ? 'var(--text-faint)'
                    : 'var(--text-muted)'
                  : 'var(--text-faint)',
              }}
            >
              {level === 'all' ? `All ${insights.length}` : `${level} ${intentCounts[level]}`}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Sort</span>
          {([['created_at', 'Recent'], ['confidence', 'Confidence'], ['intent_level', 'Intent']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: sort === key ? 'var(--surface-2)' : 'transparent',
                color: sort === key ? 'var(--text)' : 'var(--text-faint)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Insights list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((insight) => (
          <InsightCard
            key={insight.insight_id}
            insight={insight}
            expanded={expanded === insight.insight_id}
            onToggle={() => setExpanded(expanded === insight.insight_id ? null : insight.insight_id)}
          />
        ))}
      </div>
    </div>
  )
}

function InsightCard({
  insight,
  expanded,
  onToggle,
}: {
  insight: EnrichedInsight
  expanded: boolean
  onToggle: () => void
}) {
  const intentVariant = insight.intent_level === 'high' ? 'green' : insight.intent_level === 'medium' ? 'yellow' : 'muted'
  const confVariant = insight.confidence >= 80 ? 'green' : insight.confidence >= 60 ? 'yellow' : 'muted'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${expanded ? 'var(--border-hover, #3a3a3a)' : 'var(--border)'}`,
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row — always visible */}
      <div
        onClick={onToggle}
        style={{
          display: 'grid',
          gridTemplateColumns: '200px 1fr auto',
          alignItems: 'center',
          padding: '12px 16px',
          cursor: 'pointer',
          gap: 16,
        }}
      >
        {/* Lead */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{insight.lead?.full_name ?? insight.lead_id}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{insight.lead?.company_name}</div>
        </div>

        {/* Why now preview */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {insight.why_now}
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Badge label={`${insight.confidence}%`} variant={confVariant} />
          <Badge label={insight.intent_level} variant={intentVariant} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 48, textAlign: 'right' }}>
            {relativeDate(insight.created_at)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', paddingLeft: 4 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* Summary + Why now */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Section title="Summary">
                <p style={paraStyle}>{insight.summary}</p>
              </Section>
              <Section title="Why now">
                <div style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--accent)', padding: '8px 12px', borderRadius: '0 4px 4px 0' }}>
                  <p style={{ ...paraStyle, margin: 0 }}>{insight.why_now}</p>
                </div>
              </Section>
              <Section title="Next action">
                <p style={{ ...paraStyle, color: 'var(--accent)' }}>→ {insight.recommended_next_action}</p>
              </Section>
            </div>

            {/* Suggested messages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {insight.suggested_email && (
                <Section title="Suggested email">
                  <pre style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6, maxHeight: 180, overflow: 'auto' }}>
                    {insight.suggested_email}
                  </pre>
                </Section>
              )}
              {insight.suggested_linkedin_dm && (
                <Section title="LinkedIn DM">
                  <pre style={{ fontFamily: 'inherit', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                    {insight.suggested_linkedin_dm}
                  </pre>
                </Section>
              )}
            </div>
          </div>

          {/* Questions + risks row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {insight.discovery_questions.length > 0 && (
              <Section title="Discovery questions">
                <QuestionList items={insight.discovery_questions} />
              </Section>
            )}
            {insight.objections.length > 0 && (
              <Section title="Likely objections">
                <QuestionList items={insight.objections} bullet="▲" color="var(--yellow)" />
              </Section>
            )}
            {insight.opportunities.length > 0 && (
              <Section title="Opportunities">
                <QuestionList items={insight.opportunities} bullet="◆" color="var(--accent)" />
              </Section>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Badge label={`Risk: ${insight.risk_level}`} variant={insight.risk_level === 'high' ? 'red' : insight.risk_level === 'medium' ? 'yellow' : 'green'} />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Generated {relativeDate(insight.created_at)}</span>
            </div>
            <Link
              href={`/leads/${insight.lead_id}`}
              style={{ fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)' }}
            >
              Open lead →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function QuestionList({ items, bullet = '→', color = 'var(--text-muted)' }: { items: string[]; bullet?: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 9, color: 'var(--text-faint)', flexShrink: 0, paddingTop: 3 }}>{bullet}</span>
          <span style={{ fontSize: 11, color, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

const paraStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  margin: 0,
}
