'use client'

import { useMemo, useState, useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import type { Lead, Campaign } from '@/lib/types'

// The cold-outreach rhythm: sends happen Tuesdays & Thursdays only.
// This card answers "what do I send today / on the next send day" —
// the forward-looking complement to TodayCard's overdue detection.

interface Props {
  leads: Lead[]
  campaigns: Campaign[]
  // lead_ids that have a generated draft ready (from Supabase draft tables)
  draftLeadIds: string[]
  // lead_id → markable email draft id (lead_drafts). When present, a staged
  // row gets a one-click "Mark sent" via the unified /mark-sent hook.
  emailDraftIdByLead: Record<string, string>
}

function isSendDay(d: Date): boolean {
  return d.getDay() === 2 || d.getDay() === 4 // Tue / Thu
}

function nextSendDay(from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  while (!isSendDay(d)) d.setDate(d.getDate() + 1)
  return d
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function parseDate(value?: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export default function SendQueueCard({ leads, campaigns, draftLeadIds, emailDraftIdByLead }: Props) {
  const draftSet = useMemo(() => new Set(draftLeadIds), [draftLeadIds])

  // Optimistic "Mark sent" state for staged email rows.
  const [sentLeads, setSentLeads] = useState<Set<string>>(new Set())
  const [busyLeads, setBusyLeads] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const markEmailSent = useCallback(async (leadId: string, draftId: string) => {
    if (busyLeads.has(leadId)) return
    setBusyLeads((s) => new Set(s).add(leadId))
    setSentLeads((s) => new Set(s).add(leadId)) // optimistic hide
    try {
      const res = await fetch(`/api/drafts/${draftId}/mark-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) {
        setSentLeads((s) => { const n = new Set(s); n.delete(leadId); return n })
        const j = await res.json().catch(() => null)
        setActionError(j?.error ?? 'Failed to mark sent.')
      } else {
        setActionError(null)
      }
    } catch (e) {
      setSentLeads((s) => { const n = new Set(s); n.delete(leadId); return n })
      setActionError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setBusyLeads((s) => { const n = new Set(s); n.delete(leadId); return n })
    }
  }, [busyLeads])

  const { sendDay, sendDayIsToday, staged, needsDraft, dueThisWeek } = useMemo(() => {
    const now = new Date()
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)
    const sendDay = isSendDay(now) ? today : nextSendDay(now)
    const sendDayIsToday = sendDay.getTime() === today.getTime()

    const campaignById = new Map(campaigns.map((c) => [c.campaign_id, c]))
    const activeCampaign = (l: Lead) =>
      l.campaign_id ? campaignById.get(l.campaign_id) : undefined

    // Cold rhythm campaigns = Twice weekly cadence (Tue/Thu per strategy).
    const isColdLead = (l: Lead) => {
      const c = activeCampaign(l)
      return !!c && c.status === 'Active' && c.cadence === 'Twice weekly'
    }

    // Due for a send on the send day: follow-up scheduled on/before it,
    // or never touched at all (first touch).
    const dueForSend = (l: Lead) => {
      if (l.lead_status === 'Archived') return false
      if (l.pipeline_stage === 'Won' || l.pipeline_stage === 'Lost') return false
      const next = parseDate(l.next_followup_date)
      if (next) return next.getTime() <= sendDay.getTime()
      return !l.last_touch_date
    }

    const coldDue = leads.filter((l) => isColdLead(l) && dueForSend(l))
    const staged = coldDue.filter((l) => draftSet.has(l.lead_id))
    const needsDraft = coldDue.filter((l) => !draftSet.has(l.lead_id))

    // Cross-campaign follow-ups due within the next 7 days (today inclusive).
    // Overdue items already live on TodayCard — this is the forward look.
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    const dueThisWeek = leads
      .filter((l) => {
        const next = parseDate(l.next_followup_date)
        return !!next && next.getTime() >= today.getTime() && next.getTime() < weekEnd.getTime()
      })
      .sort((a, b) => (parseDate(a.next_followup_date)?.getTime() ?? 0) - (parseDate(b.next_followup_date)?.getTime() ?? 0))
      .map((l) => ({ lead: l, campaign: activeCampaign(l) }))

    return { sendDay, sendDayIsToday, staged, needsDraft, dueThisWeek }
  }, [leads, campaigns, draftSet])

  // Hide rows optimistically marked sent this session.
  const displayStaged = staged.filter((l) => !sentLeads.has(l.lead_id))

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Send queue</span>
          <span className="card-head-count">
            {sendDayIsToday ? 'TODAY IS A SEND DAY' : `NEXT SEND DAY · ${fmtDay(sendDay).toUpperCase()}`}
          </span>
        </div>
      </div>

      <div className="counter-strip">
        <Counter n={displayStaged.length} l="Staged" tone="ok" />
        <Counter n={needsDraft.length} l="Needs draft" tone="warn" />
        <Counter n={dueThisWeek.length} l="Due this week" tone="info" />
      </div>

      {actionError && (
        <div style={{ padding: '0 20px 8px' }}>
          <span className="risk" style={{ fontSize: 12 }}>{actionError}</span>
        </div>
      )}

      {displayStaged.length === 0 && needsDraft.length === 0 && dueThisWeek.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing staged.</div>
          Cold leads with a ready draft appear here on send days; scheduled follow-ups show up
          as the week fills in.
        </div>
      ) : (
        <div>
          {displayStaged.map((l) => (
            <Row
              key={l.lead_id}
              href={`/leads/${l.lead_id}`}
              title={l.full_name}
              subtitle={l.company_name}
              tag="READY"
              tagColor="var(--ok, var(--green))"
              note={sendDayIsToday ? 'Draft ready — send today' : `Draft ready for ${fmtDay(sendDay)}`}
              action={
                emailDraftIdByLead[l.lead_id] ? (
                  <button
                    className="btn btn-xs"
                    disabled={busyLeads.has(l.lead_id)}
                    onClick={() => markEmailSent(l.lead_id, emailDraftIdByLead[l.lead_id])}
                    title="Log this email as sent"
                  >
                    {busyLeads.has(l.lead_id) ? '…' : 'Mark sent'}
                  </button>
                ) : undefined
              }
            />
          ))}
          {needsDraft.map((l) => (
            <Row
              key={l.lead_id}
              href={`/leads/${l.lead_id}`}
              title={l.full_name}
              subtitle={l.company_name}
              tag="NEEDS DRAFT"
              tagColor="var(--warn)"
              note="Due for a cold touch — generate the draft first"
            />
          ))}
          {dueThisWeek.length > 0 && (
            <div style={{ padding: '10px 20px 6px', borderTop: '1px solid var(--line-subtle)' }}>
              <span className="micro" style={{ color: 'var(--ink-3)' }}>Follow-ups due this week</span>
            </div>
          )}
          {dueThisWeek.map(({ lead, campaign }, i) => (
            <Row
              key={lead.lead_id}
              href={`/leads/${lead.lead_id}`}
              title={lead.full_name}
              subtitle={[lead.company_name, campaign?.name].filter(Boolean).join(' · ')}
              tag={parseDate(lead.next_followup_date)!.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              tagColor="var(--info)"
              note={lead.next_action || 'Scheduled follow-up'}
              last={i === dueThisWeek.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Counter({ n, l, tone }: { n: number; l: string; tone: 'ok' | 'warn' | 'info' }) {
  return (
    <div className={`counter ${n === 0 ? 'zero' : tone}`}>
      <span className="counter-n">{String(n).padStart(2, '0')}</span>
      <span className="counter-l">{l}</span>
    </div>
  )
}

function Row({
  href, title, subtitle, tag, tagColor, note, last, action,
}: {
  href: string
  title: string
  subtitle?: string
  tag: string
  tagColor: string
  note: string
  last?: boolean
  action?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 20px',
        borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
      }}
    >
      <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
          {subtitle && <span className="ink-3" style={{ fontSize: 12 }}>· {subtitle}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="micro" style={{ color: tagColor }}>{tag}</span>
          <span className="ink-3" style={{ fontSize: 11.5 }}>{note}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
        {action}
        <Link className="btn btn-xs" href={href}>
          Open <Icon name="arrow" size={10} />
        </Link>
      </div>
    </div>
  )
}
