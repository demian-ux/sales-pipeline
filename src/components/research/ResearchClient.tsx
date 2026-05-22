'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Icon, type IconName } from '@/components/ui/icons'
import { Pill, Empty } from '@/components/ui/primitives'
import ResearchIngestForm from './ResearchIngestForm'
import type { Lead, ResearchFinding } from '@/lib/types'

type Kind = 'article' | 'linkedin' | 'note'
type GroupBy = 'lead' | 'source' | 'date'

interface ResearchItem {
  finding: ResearchFinding
  kind: Kind
  leadId?: string
  leadName: string
  companyName?: string
  excerpt?: string
  tags: string[]
  added: string | null
}

interface Group {
  label: string
  company?: string
  leadId?: string
  items: ResearchItem[]
}

const KIND_META: Record<Kind, { label: string; icon: IconName }> = {
  article:  { label: 'Article',  icon: 'external' },
  linkedin: { label: 'LinkedIn', icon: 'linkedin' },
  note:     { label: 'Note',     icon: 'edit' },
}

// Source types from the ingest form map onto three browse kinds.
function kindOf(sourceType: string): Kind {
  const s = (sourceType || '').toLowerCase()
  if (s.includes('linkedin')) return 'linkedin'
  if (s.includes('press') || s.includes('website') || s.includes('instagram') || s.includes('article')) {
    return 'article'
  }
  return 'note'
}

const KINDS: { key: 'all' | Kind; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'article',  label: 'Articles' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'note',     label: 'Notes' },
]

export default function ResearchClient({
  leads,
  findings,
}: {
  leads: Lead[]
  findings: ResearchFinding[]
}) {
  const [view, setView] = useState<'browse' | 'new'>('browse')
  const [kind, setKind] = useState<'all' | Kind>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('lead')
  const [search, setSearch] = useState('')

  const leadMap = useMemo(() => new Map(leads.map((l) => [l.lead_id, l])), [leads])

  const items: ResearchItem[] = useMemo(() => {
    return findings.map((f) => {
      const lead = f.lead_id ? leadMap.get(f.lead_id) : undefined
      const excerpt = f.design_observations || f.market_positioning || f.visual_identity_notes || undefined
      const tags = (f.signals_detected ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      let added: string | null = null
      if (f.created_at) {
        const dt = new Date(f.created_at)
        if (!Number.isNaN(dt.getTime())) added = format(dt, 'MMM d')
      }
      return {
        finding: f,
        kind: kindOf(f.source_type),
        leadId: f.lead_id,
        leadName: lead?.full_name ?? 'Unattached',
        companyName: lead?.company_name,
        excerpt,
        tags,
        added,
      }
    })
  }, [findings, leadMap])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length, article: 0, linkedin: 0, note: 0 }
    items.forEach((it) => { c[it.kind] += 1 })
    return c
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      if (kind !== 'all' && it.kind !== kind) return false
      if (q) {
        const hay = [it.finding.research_summary, it.excerpt, it.leadName, it.companyName, it.tags.join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, kind, search])

  const groups: Group[] = useMemo(() => {
    if (groupBy === 'date') {
      const sorted = [...filtered].sort(
        (a, b) => new Date(b.finding.created_at).getTime() - new Date(a.finding.created_at).getTime(),
      )
      return [{ label: 'Most recent first', items: sorted }]
    }
    if (groupBy === 'source') {
      return (['article', 'linkedin', 'note'] as Kind[])
        .map((k) => ({ label: `${KIND_META[k].label}s`, items: filtered.filter((it) => it.kind === k) }))
        .filter((g) => g.items.length > 0)
    }
    // by lead
    const byLead = new Map<string, ResearchItem[]>()
    filtered.forEach((it) => {
      const key = it.leadId ?? '__none'
      const list = byLead.get(key)
      if (list) list.push(it)
      else byLead.set(key, [it])
    })
    return Array.from(byLead.entries()).map(([key, list]) => ({
      label: list[0].leadName,
      company: list[0].companyName,
      leadId: key === '__none' ? undefined : key,
      items: list,
    }))
  }, [filtered, groupBy])

  // ── New-research view ──────────────────────────────────────────────────
  if (view === 'new') {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="page-eyebrow">Intelligence</div>
            <div className="page-title">Research</div>
            <div className="page-sub">Add a finding — Claude extracts the signals and opportunities.</div>
          </div>
          <div className="page-actions">
            <button className="btn" onClick={() => setView('browse')}>
              <Icon name="chevleft" size={12} /> Back to research
            </button>
          </div>
        </div>
        <ResearchIngestForm leads={leads} />
      </>
    )
  }

  // ── Browse view ────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <div className="page-title">Research</div>
          <div className="page-sub">
            {findings.length} items collected. Article clips, LinkedIn posts, manual notes — all keyed to a lead.
          </div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setView('new')}>
            <Icon name="plus" size={12} /> New research
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="row" style={{ gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="seg">
          {KINDS.map((k) => (
            <button
              key={k.key}
              className={`seg-btn ${kind === k.key ? 'active' : ''}`}
              onClick={() => setKind(k.key)}
            >
              {k.label}
              <span className="ct">{String(counts[k.key] ?? 0).padStart(2, '0')}</span>
            </button>
          ))}
        </div>

        <div className="vdiv" style={{ height: 22, alignSelf: 'center' }} />

        <span className="micro" style={{ color: 'var(--ink-3)' }}>Group by</span>
        <div className="seg">
          {(['lead', 'source', 'date'] as GroupBy[]).map((g) => (
            <button
              key={g}
              className={`seg-btn ${groupBy === g ? 'active' : ''}`}
              onClick={() => setGroupBy(g)}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ width: 260 }}>
          <input
            className="input input-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search summary, excerpt, tag…"
          />
        </div>
      </div>

      {/* Groups */}
      {filtered.length === 0 ? (
        <div className="card">
          <Empty title="No research yet.">
            Paste a LinkedIn post, a press clip, or call notes — Claude pulls the signals.
          </Empty>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {groups.map((g, gi) => (
            <section key={gi}>
              <div className="row" style={{ gap: 10, marginBottom: 10, alignItems: 'baseline' }}>
                <span className="micro micro-ink" style={{ fontSize: 10.5 }}>{g.label}</span>
                {g.company && <span className="ink-3" style={{ fontSize: 11.5 }}>· {g.company}</span>}
                <span className="micro" style={{ color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>
                  {String(g.items.length).padStart(2, '0')}
                </span>
                <span style={{ flex: 1, borderTop: '1px solid var(--line-subtle)' }} />
                {g.leadId && (
                  <Link className="btn btn-xs btn-ghost" href={`/leads/${g.leadId}`}>
                    Open lead <Icon name="arrow" size={10} />
                  </Link>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                  gap: 12,
                }}
              >
                {g.items.map((it) => (
                  <ResearchCard key={it.finding.finding_id} item={it} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}

function ResearchCard({ item }: { item: ResearchItem }) {
  const meta = KIND_META[item.kind]
  const f = item.finding

  return (
    <div
      className="card card-hover"
      style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Kind + added */}
      <div className="between">
        <div className="row" style={{ gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              borderRadius: 'var(--r-xs)',
              background: 'var(--surface-2)',
              color: 'var(--ink-2)',
              border: '1px solid var(--line)',
            }}
          >
            <Icon name={meta.icon} size={11} />
          </span>
          <span className="micro" style={{ color: 'var(--ink-2)' }}>{meta.label}</span>
        </div>
        {item.added && <span className="micro" style={{ color: 'var(--ink-3)' }}>{item.added}</span>}
      </div>

      {/* Summary */}
      <div
        className="ink"
        style={{
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: 'var(--t-tight)',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {f.research_summary}
      </div>

      {/* Source */}
      <div className="ink-3" style={{ fontSize: 11.5 }}>{f.source_type}</div>

      {/* Excerpt */}
      {item.excerpt && (
        <div
          className="ink-2"
          style={{
            fontSize: 12,
            lineHeight: 1.55,
            maxWidth: '50ch',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.excerpt}
        </div>
      )}

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          {item.tags.map((t, i) => <Pill key={i}>{t}</Pill>)}
        </div>
      )}

      {/* Footer */}
      <div
        className="between"
        style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid var(--line-subtle)' }}
      >
        {item.leadId ? (
          <Link
            className="btn btn-xs btn-ghost"
            href={`/leads/${item.leadId}`}
            style={{ marginLeft: -6 }}
          >
            {item.leadName} <Icon name="arrow" size={10} />
          </Link>
        ) : (
          <span className="ink-3" style={{ fontSize: 11.5 }}>Unattached</span>
        )}
        {f.source_url && (
          <a
            className="btn btn-xs btn-ghost"
            href={f.source_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open source"
          >
            <Icon name="external" size={11} />
          </a>
        )}
      </div>
    </div>
  )
}
