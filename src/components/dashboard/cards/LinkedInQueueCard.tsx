'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'

// Manual LinkedIn outreach queue. Email goes to Gmail drafts (Send queue);
// LinkedIn DMs are sent by hand, so this card lists every pending linkedin_dm
// draft with a one-click "Mark sent" that flips the draft AND logs the touch.
//
// Data: GET /api/drafts?channel=linkedin_dm&status=draft,approved (drafts from
// Supabase merged with lead display fields from Sheets). Actions go through the
// working API routes only (the relationship-card log path is broken):
//   Mark sent           → PATCH /api/drafts/{id} {status:'sent'} (the route
//                         auto-logs ONE LinkedIn interaction + bumps
//                         last_touch_date) THEN PATCH /api/leads/{id} for the
//                         LinkedIn + cadence fields. We deliberately do NOT also
//                         POST an interaction — that would double-log the touch.
//   Mark connection sent → POST interaction + PATCH connection status; the DM
//                         stays queued.

interface DraftLead {
  full_name?: string
  company_name?: string
  linkedin_url?: string
  linkedin_connection_status?: string
  linkedin_dm_status?: string
  pipeline_stage?: string
}

interface DmDraft {
  id: string
  lead_id: string
  channel: string
  subject: string | null
  body: string
  status: string
  created_at: string
  lead: DraftLead | null
}

export default function LinkedInQueueCard() {
  const [drafts, setDrafts] = useState<DmDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Record<string, string | null>>({})
  const [copied, setCopied] = useState<string | null>(null)
  // Draft id whose Dismiss is awaiting confirmation (one row at a time).
  const [confirming, setConfirming] = useState<string | null>(null)

  // Mount fetch. setState lives in the async callbacks (never synchronously in
  // the effect body) so it doesn't trip react-hooks/set-state-in-effect.
  useEffect(() => {
    let active = true
    fetch('/api/drafts?channel=linkedin_dm&status=draft,approved')
      .then(async (r) => {
        const d = await r.json().catch(() => null)
        if (!active) return
        if (!r.ok) { setError(d?.error ?? `Request failed (${r.status})`); setDrafts([]) }
        else { setError(null); setDrafts(d?.drafts ?? []) }
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Network error') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const copyDm = useCallback(async (draft: DmDraft) => {
    const { dm } = parseDmBody(draft.body)
    try {
      await navigator.clipboard.writeText(dm)
      setCopied(draft.id)
      setTimeout(() => setCopied((c) => (c === draft.id ? null : c)), 1500)
    } catch {
      setError('Clipboard blocked by the browser — copy manually.')
    }
  }, [])

  const markSent = useCallback(async (draft: DmDraft) => {
    if (busy[draft.id]) return
    setBusy((b) => ({ ...b, [draft.id]: 'sent' }))
    // Optimistically drop the row. The unified endpoint does the whole send
    // record (draft → sent, interaction, lead advance, follow-up) atomically
    // and idempotently, so the client just makes one call.
    setDrafts((cur) => cur.filter((d) => d.id !== draft.id))
    try {
      const res = await fetch(`/api/drafts/${draft.id}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        restoreRow(setDrafts, draft)
        setError((await safeErr(res)) ?? 'Failed to mark the DM sent.')
        return
      }
      setError(null)
    } catch (e) {
      restoreRow(setDrafts, draft)
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy((b) => ({ ...b, [draft.id]: null }))
    }
  }, [busy])

  const markConnectionSent = useCallback(async (draft: DmDraft) => {
    if (busy[draft.id]) return
    setBusy((b) => ({ ...b, [draft.id]: 'conn' }))
    const prev = draft.lead?.linkedin_connection_status
    // Optimistic chip update; the DM stays queued.
    setDrafts((cur) =>
      cur.map((d) =>
        d.id === draft.id && d.lead
          ? { ...d, lead: { ...d.lead, linkedin_connection_status: 'Connection Sent' } }
          : d,
      ),
    )
    try {
      const today = todayStr()
      const post = await fetch(`/api/leads/${draft.lead_id}/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'LinkedIn',
          direction: 'Outbound',
          subject: 'LinkedIn connection request sent',
          body_summary: 'Sent connection request.',
          sent_at: today,
        }),
      })
      if (!post.ok) throw new Error((await safeErr(post)) ?? 'Failed to log the connection request.')

      const patch = await fetch(`/api/leads/${draft.lead_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedin_connection_status: 'Connection Sent', last_touch_date: today }),
      })
      if (!patch.ok) throw new Error((await safeErr(patch)) ?? 'Failed to update connection status.')
      setError(null)
    } catch (e) {
      // Revert the chip.
      setDrafts((cur) =>
        cur.map((d) =>
          d.id === draft.id && d.lead
            ? { ...d, lead: { ...d.lead, linkedin_connection_status: prev } }
            : d,
        ),
      )
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy((b) => ({ ...b, [draft.id]: null }))
    }
  }, [busy])

  // Dismiss: a discard, not a send. Hard-deletes ONLY this draft row (the
  // endpoint never touches the lead, its interactions, or other-channel
  // drafts). Idempotent — a 404 means it's already gone, which we treat as
  // success.
  const dismiss = useCallback(async (draft: DmDraft) => {
    if (busy[draft.id]) return
    setBusy((b) => ({ ...b, [draft.id]: 'dismiss' }))
    setConfirming(null)
    setDrafts((cur) => cur.filter((d) => d.id !== draft.id)) // optimistic
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) {
        restoreRow(setDrafts, draft)
        setError((await safeErr(res)) ?? 'Failed to dismiss the draft.')
        return
      }
      setError(null)
    } catch (e) {
      restoreRow(setDrafts, draft)
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy((b) => ({ ...b, [draft.id]: null }))
    }
  }, [busy])

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">LinkedIn DM queue</span>
          <span className="card-head-count">{String(drafts.length).padStart(2, '0')} PENDING</span>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/leads">
          View all <Icon name="arrow" size={11} />
        </Link>
      </div>

      {error && (
        <div style={{ padding: '8px 20px' }}>
          <span className="risk" style={{ fontSize: 12 }}>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="empty"><div className="empty-title">Loading…</div></div>
      ) : drafts.length === 0 ? (
        <Empty title="No LinkedIn DMs queued.">
          Drafts created with channel linkedin_dm show up here.
        </Empty>
      ) : (
        <div>
          {drafts.map((d, i) => {
            const lead = d.lead
            const parsed = parseDmBody(d.body)
            const isExpanded = expanded.has(d.id)
            const canExpand = !!parsed.connectionNote || d.body.length > 90
            const chip = connChip(lead?.linkedin_connection_status)
            const rowBusy = busy[d.id]
            const hasUrl = !!lead?.linkedin_url
            const needsConnect =
              lead?.linkedin_connection_status === 'Not Connected' ||
              lead?.linkedin_connection_status === 'Connection Ready'

            return (
              <div
                key={d.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '14px 20px',
                  borderBottom: i === drafts.length - 1 ? 'none' : '1px solid var(--line-subtle)',
                }}
              >
                <Avatar name={lead?.full_name} />

                <div className="col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
                  {/* Identity + connection state */}
                  <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Link
                      href={`/leads/${d.lead_id}`}
                      className="ink"
                      style={{ fontSize: 13, fontWeight: 500 }}
                    >
                      {lead?.full_name ?? d.lead_id}
                    </Link>
                    {lead?.company_name && (
                      <span className="ink-3" style={{ fontSize: 12 }}>· {lead.company_name}</span>
                    )}
                    {chip && <span className="micro" style={{ color: chip.color }}>{chip.label}</span>}
                  </div>

                  {/* DM body */}
                  {!isExpanded ? (
                    <div className="ink-2 truncate" style={{ fontSize: 12 }}>
                      {parsed.connectionNote ?? parsed.dm}
                    </div>
                  ) : parsed.connectionNote ? (
                    <div className="col" style={{ gap: 8 }}>
                      <Labeled label="Connection note" text={parsed.connectionNote} />
                      <Labeled label="DM after connect" text={parsed.dm} />
                    </div>
                  ) : (
                    <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {parsed.dm}
                    </div>
                  )}

                  {needsConnect && (
                    <span className="ink-3" style={{ fontSize: 11 }}>
                      Send the connection request first — the DM follows once connected.
                    </span>
                  )}

                  {/* Actions — or the inline Dismiss confirm */}
                  {confirming === d.id ? (
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                      <span className="ink-3" style={{ fontSize: 11.5 }}>
                        Remove this DM draft? This can&apos;t be undone.
                      </span>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => setConfirming(null)}
                        disabled={rowBusy === 'dismiss'}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => dismiss(d)}
                        disabled={rowBusy === 'dismiss'}
                        style={{ color: 'var(--red)' }}
                      >
                        {rowBusy === 'dismiss' ? '…' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                      {canExpand && (
                        <button className="btn btn-xs btn-ghost" onClick={() => toggleExpand(d.id)}>
                          {isExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                      <button className="btn btn-xs btn-ghost" onClick={() => copyDm(d)}>
                        <Icon name="copy" size={11} /> {copied === d.id ? 'Copied' : 'Copy DM'}
                      </button>
                      {hasUrl ? (
                        <a
                          className="btn btn-xs btn-ghost"
                          href={lead!.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Icon name="external" size={11} /> Open LinkedIn
                        </a>
                      ) : (
                        <button
                          className="btn btn-xs btn-ghost"
                          disabled
                          title="No LinkedIn URL on this lead"
                          style={{ opacity: 0.5 }}
                        >
                          <Icon name="external" size={11} /> Open LinkedIn
                        </button>
                      )}
                      {needsConnect && (
                        <button
                          className="btn btn-xs btn-ghost"
                          onClick={() => markConnectionSent(d)}
                          disabled={!!rowBusy}
                        >
                          {rowBusy === 'conn' ? '…' : 'Mark connection sent'}
                        </button>
                      )}
                      <button
                        className="btn btn-xs"
                        onClick={() => markSent(d)}
                        disabled={!!rowBusy}
                      >
                        {rowBusy === 'sent' ? '…' : <><Icon name="check" size={11} /> Mark sent</>}
                      </button>
                      {/* Dismiss — low-prominence, pushed to the far end so it
                          can't be confused with Mark sent. */}
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => setConfirming(d.id)}
                        disabled={!!rowBusy}
                        aria-label="Dismiss this DM draft"
                        title="Dismiss — remove this draft from the queue"
                        style={{ marginLeft: 'auto', color: 'var(--ink-3)' }}
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Row helpers ────────────────────────────────────────────────────────────

function Avatar({ name }: { name?: string }) {
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0,
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'var(--surface-2)',
        border: '1px solid var(--line-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--ink-2)',
      }}
    >
      {initials(name)}
    </div>
  )
}

function Labeled({ label, text }: { label: string; text: string }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      <span className="micro" style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className="ink-2" style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</span>
    </div>
  )
}

// ─── Pure helpers ─────────────────────────────────────────────────────────

// Cold-lead drafts carry both halves: "[Connection note] … [DM after connect] …".
function parseDmBody(body: string): { connectionNote?: string; dm: string } {
  const m = body.match(/\[Connection note\]([\s\S]*?)\[DM after connect\]([\s\S]*)/i)
  if (m) return { connectionNote: m[1].trim(), dm: m[2].trim() }
  return { dm: body.trim() }
}

function connChip(status?: string): { label: string; color: string } | null {
  switch (status) {
    case 'Connected':       return { label: 'Connected',       color: 'var(--green)' }
    case 'Connection Sent': return { label: 'Connection sent',  color: 'var(--info)' }
    case 'Connection Ready':return { label: 'Connection ready', color: 'var(--accent)' }
    case 'Not Connected':   return { label: 'Not connected',    color: 'var(--ink-3)' }
    default:                return null
  }
}

function initials(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase() || '?'
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

async function safeErr(res: Response): Promise<string | null> {
  try {
    const j = await res.json()
    return (j?.error as string) ?? null
  } catch {
    return null
  }
}

function restoreRow(
  setDrafts: React.Dispatch<React.SetStateAction<DmDraft[]>>,
  draft: DmDraft,
) {
  setDrafts((cur) =>
    [draft, ...cur.filter((d) => d.id !== draft.id)].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    ),
  )
}
