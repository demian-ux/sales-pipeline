'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AIInsight, Lead, Opportunity, WorkflowAction } from '@/lib/types'

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  drafts: AIInsight[]
  leadMap: Record<string, Lead>
  oppMap: Record<string, Opportunity>
  gmailReady: boolean
  workflowActions: WorkflowAction[]
}

// ── Gmail draft parser ─────────────────────────────────────────────────────

function parseEmailDraft(raw: string): { subject: string; body: string } {
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/im)
  const subject = subjectMatch?.[1]?.trim() ?? '(No subject)'
  const body = raw
    .replace(/^Subject:.*$/im, '')
    .replace(/^\s*\n/, '')
    .trim()
  return { subject, body }
}

// ── Action state helpers ───────────────────────────────────────────────────

type ActionStatus = 'idle' | 'loading' | 'done' | 'error'

function actionKey(insightId: string, channel: 'email' | 'linkedin') {
  return `${insightId}:${channel}`
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DraftQueueClient({ drafts, leadMap, oppMap, gmailReady, workflowActions }: Props) {
  const [filter, setFilter] = useState<'all' | 'email' | 'linkedin'>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [gmailStatus, setGmailStatus] = useState<Record<string, { status: ActionStatus; message?: string }>>({})
  const [copiedKeys, setCopiedKeys] = useState<Set<string>>(new Set())
  const [sentKeys, setSentKeys] = useState<Set<string>>(
    new Set(
      workflowActions
        .filter((a) => a.type === 'draft_sent' || a.type === 'gmail_draft_created')
        .map((a) => `${a.insight_id}:${a.channel}`)
    )
  )

  const visible = drafts.filter((d) => {
    if (filter === 'email') return !!d.suggested_email
    if (filter === 'linkedin') return !!d.suggested_linkedin_dm
    return true
  })

  const emailCount = drafts.filter((d) => d.suggested_email).length
  const linkedinCount = drafts.filter((d) => d.suggested_linkedin_dm).length

  async function trackAction(
    type: WorkflowAction['type'],
    insight: AIInsight,
    channel: 'email' | 'linkedin'
  ) {
    await fetch('/api/workflow/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, lead_id: insight.lead_id, insight_id: insight.insight_id, channel }),
    })
  }

  async function handleCopy(insight: AIInsight, text: string, channel: 'email' | 'linkedin') {
    await navigator.clipboard.writeText(text)
    const key = actionKey(insight.insight_id, channel)
    setCopiedKeys((prev) => new Set([...prev, key]))
    await trackAction('draft_copied', insight, channel)
  }

  async function handleMarkSent(insight: AIInsight, channel: 'email' | 'linkedin') {
    const key = actionKey(insight.insight_id, channel)
    setSentKeys((prev) => new Set([...prev, key]))
    await trackAction('draft_sent', insight, channel)
  }

  async function handleCreateGmailDraft(insight: AIInsight) {
    if (!insight.suggested_email) return
    const key = actionKey(insight.insight_id, 'email')
    setGmailStatus((prev) => ({ ...prev, [key]: { status: 'loading' } }))

    const lead = leadMap[insight.lead_id]
    const { subject, body } = parseEmailDraft(insight.suggested_email)

    try {
      const res = await fetch('/api/gmail/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: lead?.email ?? '', subject, body }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGmailStatus((prev) => ({ ...prev, [key]: { status: 'error', message: data.error } }))
        return
      }
      setGmailStatus((prev) => ({ ...prev, [key]: { status: 'done', message: data.message } }))
      setSentKeys((prev) => new Set([...prev, key]))
      await trackAction('gmail_draft_created', insight, 'email')
    } catch {
      setGmailStatus((prev) => ({ ...prev, [key]: { status: 'error', message: 'Network error' } }))
    }
  }

  async function handleDismiss(insight: AIInsight, channel: 'email' | 'linkedin') {
    const key = actionKey(insight.insight_id, channel)
    setSentKeys((prev) => new Set([...prev, key]))
    await trackAction('draft_dismissed', insight, channel)
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            Outreach
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Draft Queue</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Human-approved only. No message is sent automatically.
          </p>
        </div>
        {!gmailReady && (
          <Link href="/settings" style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px' }}>
            Connect Gmail →
          </Link>
        )}
      </div>

      {/* Stats + filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        {([
          { id: 'all', label: `All drafts`, count: drafts.length },
          { id: 'email', label: 'Email', count: emailCount },
          { id: 'linkedin', label: 'LinkedIn DM', count: linkedinCount },
        ] as const).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 6,
              border: '1px solid var(--border)',
              background: filter === f.id ? 'var(--surface-2)' : 'transparent',
              color: filter === f.id ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer', fontWeight: filter === f.id ? 600 : 400,
            }}
          >
            {f.label}
            <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>{f.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-faint)' }}>
          No drafts yet. Analyze a lead to generate email and LinkedIn messages.
          <br />
          <Link href="/relationships" style={{ color: 'var(--accent)', marginTop: 8, display: 'inline-block' }}>View leads →</Link>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {visible.map((insight) => {
          const lead = leadMap[insight.lead_id]
          const opp = insight.opportunity_id ? oppMap[insight.opportunity_id] : undefined
          const isOpen = expanded[insight.insight_id]
          const emailKey = actionKey(insight.insight_id, 'email')
          const linkedinKey = actionKey(insight.insight_id, 'linkedin')
          const emailSent = sentKeys.has(emailKey)
          const linkedinSent = sentKeys.has(linkedinKey)
          const emailCopied = copiedKeys.has(emailKey)
          const linkedinCopied = copiedKeys.has(linkedinKey)
          const gmailSt = gmailStatus[emailKey]
          const { subject: emailSubject, body: emailBody } = insight.suggested_email
            ? parseEmailDraft(insight.suggested_email)
            : { subject: '', body: '' }

          return (
            <div
              key={insight.insight_id}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', opacity: emailSent && linkedinSent ? 0.5 : 1 }}
            >
              {/* Card header */}
              <div
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
                onClick={() => setExpanded((prev) => ({ ...prev, [insight.insight_id]: !isOpen }))}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {lead?.full_name ?? insight.lead_id}
                    </div>
                    {(emailSent || linkedinSent) && (
                      <span style={{ fontSize: 9, color: 'var(--green)', background: 'rgba(80,180,120,0.12)', padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {emailSent && linkedinSent ? 'Sent' : emailSent ? 'Email sent' : 'DM sent'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {lead?.company_name}
                    {lead?.title && <span style={{ marginLeft: 6, opacity: 0.7 }}>· {lead.title}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
                    {insight.why_now}
                  </div>
                  {opp && (
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>
                      → {opp.summary}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                  {insight.suggested_email && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 3 }}>Email</span>
                  )}
                  {insight.suggested_linkedin_dm && (
                    <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 3 }}>DM</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>{isOpen ? '▴' : '▾'}</span>
                </div>
              </div>

              {/* Expanded drafts */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {/* Email draft */}
                  {insight.suggested_email && (
                    <div style={{ padding: '16px', borderBottom: insight.suggested_linkedin_dm ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        Email draft {emailCopied && <span style={{ color: 'var(--green)', marginLeft: 6 }}>· Copied</span>}
                        {emailSent && <span style={{ color: 'var(--green)', marginLeft: 6 }}>· Sent</span>}
                      </div>

                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
                        To: <span style={{ color: 'var(--text-muted)' }}>{lead?.email ?? '(no email on file)'}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>Subject: {emailSubject}</div>
                      <pre style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', margin: '0 0 12px', fontFamily: 'inherit' }}>
                        {emailBody}
                      </pre>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <ActionBtn
                          label={emailCopied ? '✓ Copied' : 'Copy email'}
                          onClick={() => handleCopy(insight, insight.suggested_email!, 'email')}
                          variant="default"
                        />
                        {gmailReady && lead?.email && (
                          <ActionBtn
                            label={
                              gmailSt?.status === 'loading' ? 'Creating draft…'
                              : gmailSt?.status === 'done' ? '✓ Draft in Gmail'
                              : gmailSt?.status === 'error' ? '✗ Failed'
                              : '+ Create Gmail draft'
                            }
                            onClick={() => handleCreateGmailDraft(insight)}
                            disabled={gmailSt?.status === 'loading' || gmailSt?.status === 'done'}
                            variant={gmailSt?.status === 'done' ? 'success' : gmailSt?.status === 'error' ? 'error' : 'primary'}
                          />
                        )}
                        {!emailSent && (
                          <ActionBtn label="Mark sent" onClick={() => handleMarkSent(insight, 'email')} variant="default" />
                        )}
                        {!emailSent && (
                          <ActionBtn label="Dismiss" onClick={() => handleDismiss(insight, 'email')} variant="muted" />
                        )}
                        <Link href={`/leads/${insight.lead_id}`} style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                          Open lead →
                        </Link>
                      </div>

                      {gmailSt?.status === 'error' && (
                        <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{gmailSt.message}</div>
                      )}
                      {gmailSt?.status === 'done' && (
                        <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 8 }}>{gmailSt.message}</div>
                      )}
                    </div>
                  )}

                  {/* LinkedIn DM draft */}
                  {insight.suggested_linkedin_dm && (
                    <div style={{ padding: '16px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                        LinkedIn DM {linkedinCopied && <span style={{ color: 'var(--green)', marginLeft: 6 }}>· Copied</span>}
                        {linkedinSent && <span style={{ color: 'var(--green)', marginLeft: 6 }}>· Sent</span>}
                      </div>

                      <pre style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', margin: '0 0 12px', fontFamily: 'inherit' }}>
                        {insight.suggested_linkedin_dm}
                      </pre>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <ActionBtn
                          label={linkedinCopied ? '✓ Copied' : 'Copy DM'}
                          onClick={() => handleCopy(insight, insight.suggested_linkedin_dm!, 'linkedin')}
                          variant="default"
                        />
                        {lead?.linkedin_url && (
                          <a
                            href={lead.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)', padding: '5px 12px', borderRadius: 5 }}
                          >
                            Open LinkedIn ↗
                          </a>
                        )}
                        {!linkedinSent && (
                          <ActionBtn label="Mark sent" onClick={() => handleMarkSent(insight, 'linkedin')} variant="default" />
                        )}
                        {!linkedinSent && (
                          <ActionBtn label="Dismiss" onClick={() => handleDismiss(insight, 'linkedin')} variant="muted" />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Action button ──────────────────────────────────────────────────────────

function ActionBtn({
  label, onClick, disabled, variant,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  variant: 'default' | 'primary' | 'success' | 'error' | 'muted'
}) {
  const styles: Record<string, React.CSSProperties> = {
    default:  { background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' },
    primary:  { background: 'var(--accent)',    color: 'white',             border: '1px solid var(--accent)' },
    success:  { background: 'rgba(80,180,120,0.1)', color: 'var(--green)', border: '1px solid rgba(80,180,120,0.25)' },
    error:    { background: 'rgba(224,92,92,0.08)', color: 'var(--red)',   border: '1px solid rgba(224,92,92,0.25)' },
    muted:    { background: 'transparent',      color: 'var(--text-faint)', border: '1px solid transparent' },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles[variant],
        padding: '5px 12px',
        fontSize: 11,
        borderRadius: 5,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontWeight: 500,
      }}
    >
      {label}
    </button>
  )
}
