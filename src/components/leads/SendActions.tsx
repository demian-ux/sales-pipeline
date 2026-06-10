'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Send-side actions for the lead draft tabs: create a real Gmail draft from
// the email draft, and mark a draft as sent (which writes through to the
// lead's interaction history, stage, last touch, and next follow-up).

function parseEmailDraft(raw: string): { subject: string; body: string } {
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/im)
  const subject = subjectMatch?.[1]?.trim() ?? '(No subject)'
  const body = raw
    .replace(/^Subject:.*$/im, '')
    .trim()
  return { subject, body }
}

const btnStyle = (tone: 'default' | 'done'): React.CSSProperties => ({
  fontSize: 11,
  padding: '5px 10px',
  borderRadius: 5,
  border: tone === 'done' ? '1px solid transparent' : '1px solid var(--border)',
  background: tone === 'done' ? 'var(--ok-dim, rgba(94,170,120,0.12))' : 'transparent',
  color: tone === 'done' ? 'var(--ok, var(--green))' : 'var(--ink-2)',
  cursor: tone === 'done' ? 'default' : 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
})

export function MarkSentButton({
  leadId,
  kind,
  content,
}: {
  leadId: string
  kind: 'email' | 'linkedin' | 'letter'
  content: string
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    if (state !== 'idle') return
    setState('loading')
    setError(null)
    try {
      const subject = kind === 'email' ? parseEmailDraft(content).subject : undefined
      const res = await fetch(`/api/leads/${leadId}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: kind,
          subject,
          body_summary: content.slice(0, 240),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)
      setState('done')
      router.refresh()
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Failed to mark sent')
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={handle}
        disabled={state !== 'idle'}
        title="Log this as sent: adds an interaction, updates last touch + stage, schedules the follow-up"
        style={btnStyle(state === 'done' ? 'done' : 'default')}
      >
        {state === 'done' ? '✓ Sent' : state === 'loading' ? '…' : 'Mark sent'}
      </button>
      {error && <span style={{ fontSize: 10, color: 'var(--risk, var(--red))', maxWidth: 220 }}>{error}</span>}
    </div>
  )
}

export function CreateGmailDraftButton({
  leadId,
  leadEmail,
  content,
}: {
  leadId: string
  leadEmail: string
  content: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handle() {
    if (state !== 'idle') return
    setState('loading')
    setError(null)
    try {
      const { subject, body } = parseEmailDraft(content)
      const res = await fetch('/api/gmail/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: leadEmail, subject, body, lead_id: leadId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`)
      setState('done')
    } catch (e) {
      setState('idle')
      setError(e instanceof Error ? e.message : 'Failed to create Gmail draft')
    }
  }

  if (state === 'done') {
    return (
      <a
        href="https://mail.google.com/mail/#drafts"
        target="_blank"
        rel="noopener noreferrer"
        style={{ ...btnStyle('done'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
        title="Draft created — review and send it from Gmail"
      >
        ✓ In Gmail — open drafts
      </a>
    )
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <button
        type="button"
        onClick={handle}
        disabled={state !== 'idle'}
        title={`Create a Gmail draft to ${leadEmail} — nothing is sent automatically`}
        style={btnStyle('default')}
      >
        {state === 'loading' ? '…' : 'Create Gmail draft'}
      </button>
      {error && <span style={{ fontSize: 10, color: 'var(--risk, var(--red))', maxWidth: 220 }}>{error}</span>}
    </div>
  )
}
