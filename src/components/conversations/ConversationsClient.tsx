'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { Empty } from '@/components/ui/primitives'
import { relativeDate } from '@/lib/utils'
import AnalyzeThreadButton from './AnalyzeThreadButton'
import type {
  ParsedThread,
  ParsedMessage,
  ConversationAnalysis,
  ConversationState,
} from '@/lib/gmail/types'

export interface EnrichedThread {
  thread: ParsedThread
  analysis: ConversationAnalysis | null
  leadName: string
  leadCompany: string
  state: ConversationState
}

type Tone = 'risk' | 'ok' | 'warn' | 'info'

interface ChipDef {
  key: string
  label: string
  tone: Tone | null
  states: ConversationState[]
}

const CHIPS: ChipDef[] = [
  { key: 'reply',    label: 'Reply needed',  tone: 'risk', states: ['waiting_for_us'] },
  { key: 'active',   label: 'Active',         tone: 'ok',   states: ['active'] },
  { key: 'awaiting', label: 'Awaiting them',  tone: 'warn', states: ['waiting_for_them'] },
  { key: 'cold',     label: 'Cold',           tone: 'info', states: ['cooling', 'dormant'] },
]

const STATE_BADGE: Record<ConversationState, { label: string; tone: Tone }> = {
  waiting_for_us:   { label: 'Reply',    tone: 'risk' },
  active:           { label: 'Active',   tone: 'ok' },
  waiting_for_them: { label: 'Awaiting', tone: 'warn' },
  cooling:          { label: 'Cold',     tone: 'info' },
  dormant:          { label: 'Cold',     tone: 'info' },
}

export default function ConversationsClient({ threads }: { threads: EnrichedThread[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: threads.length }
    CHIPS.forEach((ch) => {
      c[ch.key] = threads.filter((t) => ch.states.includes(t.state)).length
    })
    return c
  }, [threads])

  const [filter, setFilter] = useState<string>(() => (counts.reply > 0 ? 'reply' : 'all'))
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const chip = CHIPS.find((c) => c.key === filter)
    const q = search.trim().toLowerCase()
    return threads.filter((t) => {
      if (chip && !chip.states.includes(t.state)) return false
      if (q) {
        const hay = [t.thread.subject, t.thread.snippet, t.leadName, t.leadCompany]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [threads, filter, search])

  const selected = filtered.find((t) => t.thread.thread_id === openId) ?? filtered[0] ?? null

  const STRIP = [...CHIPS, { key: 'all', label: 'All', tone: null, states: [] as ConversationState[] }]

  return (
    <>
      {/* State filter strip */}
      <div className="row" style={{ gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {STRIP.map((ch) => (
          <button
            key={ch.key}
            className={`state-chip ${ch.tone ?? ''} ${filter === ch.key ? 'active' : ''}`}
            onClick={() => setFilter(ch.key)}
          >
            <span className="state-chip-dot" />
            <span>{ch.label}</span>
            <span className="state-chip-ct">{String(counts[ch.key] ?? 0).padStart(2, '0')}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ width: 280 }}>
          <input
            className="input input-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, lead…"
          />
        </div>
      </div>

      {/* Two-pane */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 420px) 1fr',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.map((t, i) => (
            <ThreadRow
              key={t.thread.thread_id}
              t={t}
              open={t === selected}
              last={i === filtered.length - 1}
              onOpen={() => setOpenId(t.thread.thread_id)}
            />
          ))}
          {filtered.length === 0 && (
            <Empty title="All clear in this view.">No threads in this state.</Empty>
          )}
        </div>

        {selected && <ThreadDetail t={selected} />}
      </div>
    </>
  )
}

function ThreadRow({
  t,
  open,
  last,
  onOpen,
}: {
  t: EnrichedThread
  open: boolean
  last: boolean
  onOpen: () => void
}) {
  const badge = STATE_BADGE[t.state]
  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative',
        padding: '14px 16px 14px 18px',
        borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
        cursor: 'pointer',
        background: open ? 'var(--surface-2)' : 'transparent',
        transition: 'background var(--dur) var(--ease)',
      }}
      onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = 'var(--surface-2)' }}
      onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = 'transparent' }}
    >
      {open && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            top: 12,
            bottom: 12,
            width: 2,
            background: 'var(--accent)',
            borderRadius: 2,
          }}
        />
      )}
      <div className="between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <span
              className="ink truncate"
              style={{ fontSize: 13, fontWeight: 500, flex: '1 1 auto', minWidth: 0 }}
            >
              {t.leadName}
            </span>
            <span className="ink-3 truncate" style={{ fontSize: 12, flexShrink: 1, minWidth: 0 }}>
              · {t.leadCompany}
            </span>
          </div>
          <span className="ink-2 truncate" style={{ fontSize: 12.5 }}>{t.thread.subject}</span>
          <span
            className="ink-3"
            style={{
              fontSize: 11.5,
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {t.thread.snippet}
          </span>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span className="micro" style={{ color: 'var(--ink-3)' }}>
            {relativeDate(t.thread.last_message_at)}
          </span>
          <span className={`badge-status ${badge.tone}`} style={{ fontSize: 9.5 }}>
            <span className="dot" />
            {badge.label}
          </span>
        </div>
      </div>
    </div>
  )
}

function ThreadDetail({ t }: { t: EnrichedThread }) {
  const { thread, analysis } = t
  const gmailUrl = `https://mail.google.com/mail/u/0/#all/${thread.thread_id}`

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* Header */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div className="between" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div className="col" style={{ gap: 6, minWidth: 0, flex: 1 }}>
            <div className="ink" style={{ fontSize: 16, fontWeight: 500, letterSpacing: '-0.012em' }}>
              {thread.subject}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="ink-2" style={{ fontSize: 12.5 }}>{t.leadName}</span>
              <span className="ink-3">·</span>
              <span className="ink-2" style={{ fontSize: 12.5 }}>{t.leadCompany}</span>
              <span className="ink-3">·</span>
              <span className="micro" style={{ color: 'var(--ink-3)' }}>
                {thread.message_count} messages · last {relativeDate(thread.last_message_at)}
              </span>
            </div>
          </div>
          <Link className="btn btn-sm" href={`/leads/${thread.lead_id}`}>
            Open lead <Icon name="arrow" size={11} />
          </Link>
        </div>
      </div>

      {/* Analysis / suggested response */}
      {analysis ? (
        <div className="card" style={{ padding: '16px 22px', borderColor: 'var(--accent-line)' }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <Icon name="sparkle" size={12} style={{ color: 'var(--accent)' }} />
            <span className="micro" style={{ color: 'var(--accent)' }}>Suggested response</span>
          </div>
          <div className="ink" style={{ fontSize: 13, lineHeight: 1.55, maxWidth: '62ch', marginBottom: 12 }}>
            {analysis.recommended_response || analysis.summary}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href={gmailUrl} target="_blank" rel="noopener noreferrer">
              Open in Gmail <Icon name="external" size={11} />
            </a>
            {analysis.response_deadline && (
              <span className="badge-pill">{analysis.response_deadline}</span>
            )}
          </div>
          {analysis.objections.length > 0 && (
            <div
              className="ink-3"
              style={{
                fontSize: 11.5,
                lineHeight: 1.55,
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid var(--line-subtle)',
              }}
            >
              Objections: {analysis.objections.join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div className="card card-pad" style={{ borderColor: 'var(--accent-line)' }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <Icon name="sparkle" size={12} style={{ color: 'var(--accent)' }} />
            <span className="micro" style={{ color: 'var(--accent)' }}>Not yet analyzed</span>
          </div>
          <div className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 }}>
            Run Claude on this thread to classify its state and draft a suggested response.
          </div>
          <div className="row" style={{ gap: 6 }}>
            <AnalyzeThreadButton threadId={thread.thread_id} leadId={thread.lead_id} />
            <a className="btn btn-sm" href={gmailUrl} target="_blank" rel="noopener noreferrer">
              Open in Gmail <Icon name="external" size={11} />
            </a>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="card">
        <div className="card-head">
          <div className="card-head-title">
            <span className="card-head-name">Thread</span>
            <span className="card-head-count">{thread.messages.length} MESSAGES</span>
          </div>
        </div>
        <div className="col">
          {thread.messages.map((m, i) => (
            <MessageRow key={m.message_id} m={m} last={i === thread.messages.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MessageRow({ m, last }: { m: ParsedMessage; last: boolean }) {
  const inbound = m.direction === 'inbound'
  return (
    <div
      style={{
        padding: '16px 22px',
        borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
        display: 'flex',
        gap: 14,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          marginTop: 3,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: inbound ? 'var(--ok)' : 'var(--info)',
        }}
      />
      <div className="col" style={{ gap: 6, flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <span className="ink truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>
            {inbound ? m.from : 'You'}
          </span>
          <span className="micro" style={{ color: inbound ? 'var(--ok)' : 'var(--info)' }}>
            {inbound ? '↓ IN' : '↑ OUT'}
          </span>
          <span className="micro" style={{ color: 'var(--ink-3)' }}>{relativeDate(m.date)}</span>
        </div>
        <div
          className="ink-2"
          style={{ fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-wrap', maxWidth: '70ch' }}
        >
          {m.body}
        </div>
      </div>
    </div>
  )
}
