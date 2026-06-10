'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import type { Lead, Task, SnoozedSignal, Thread } from '@/lib/types'

type AutoKind = 'conversation_waiting' | 'stalled_proposal' | 'overdue_followup'
type Severity = 'critical' | 'high' | 'medium'

interface AutoSignal {
  kind: 'auto'
  type: AutoKind
  signal_key: string
  title: string
  subtitle?: string
  reason: string
  effective_due: Date
  severity: Severity
  open_href: string
}

interface ManualSignal {
  kind: 'manual'
  task: Task
  effective_due: Date | null
  severity: Severity
}

type QueueItem = AutoSignal | ManualSignal

interface Props {
  leads: Lead[]
  threads: Thread[]
  initialSnoozedSignals: SnoozedSignal[]
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 }
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'var(--risk)',
  high:     'var(--warn)',
  medium:   'var(--info)',
}
const AUTO_LABEL: Record<AutoKind, string> = {
  conversation_waiting: 'Awaiting reply',
  stalled_proposal:     'Stalled proposal',
  overdue_followup:     'Overdue follow-up',
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

function tomorrowIso24h(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

export default function TodayCard({ leads, threads, initialSnoozedSignals }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [snoozed, setSnoozed] = useState<SnoozedSignal[]>(initialSnoozedSignals)
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [formTitle, setFormTitle] = useState('')
  const [formDue, setFormDue] = useState('')
  const [formLeadQuery, setFormLeadQuery] = useState('')
  const [creating, setCreating] = useState(false)

  // Match the typed text against the roster so "Log outreach en tracker" can
  // point at the actual lead (link_type/link_id on the task).
  const formLead = useMemo(() => {
    const q = formLeadQuery.trim().toLowerCase()
    if (!q) return null
    return leads.find((l) => l.full_name.toLowerCase() === q)
      ?? leads.find((l) => l.full_name.toLowerCase().includes(q))
      ?? null
  }, [leads, formLeadQuery])

  const reloadTasks = useCallback(async () => {
    setLoadingTasks(true)
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      if (res.ok) setTasks(data.tasks ?? [])
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  useEffect(() => { reloadTasks() }, [reloadTasks])

  const snoozedKeys = useMemo(() => new Set(snoozed.map((s) => s.signal_key)), [snoozed])

  const autoSignals = useMemo<AutoSignal[]>(() => {
    const out: AutoSignal[] = []
    const now = new Date()
    const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

    for (const t of threads) {
      if (t.inferred_state !== 'waiting_for_us') continue
      const key = `conversation:${t.thread_id}`
      if (snoozedKeys.has(key)) continue
      const lastMsg = t.last_message_at ? new Date(t.last_message_at) : null
      if (!lastMsg) continue
      const effective_due = new Date(lastMsg.getTime() + 3 * 86_400_000)
      const waitingDays = daysBetween(now, lastMsg)
      if (waitingDays < 0) continue
      const lead = leadMap.get(t.lead_id)
      out.push({
        kind: 'auto',
        type: 'conversation_waiting',
        signal_key: key,
        title: lead?.full_name ?? t.lead_id,
        subtitle: t.subject ?? '(no subject)',
        reason: waitingDays >= 1 ? `Waiting ${waitingDays}d for our reply` : 'Reply needed',
        effective_due,
        severity: waitingDays > 7 ? 'critical' : waitingDays >= 3 ? 'high' : 'medium',
        open_href: `/conversations?thread=${encodeURIComponent(t.thread_id)}`,
      })
    }

    for (const l of leads) {
      if (l.pipeline_stage !== 'Proposal Sent') continue
      if (!l.last_touch_date) continue
      const last = new Date(l.last_touch_date)
      const days = daysBetween(now, last)
      if (days < 21) continue
      const key = `stalled_proposal:${l.lead_id}`
      if (snoozedKeys.has(key)) continue
      out.push({
        kind: 'auto',
        type: 'stalled_proposal',
        signal_key: key,
        title: l.full_name,
        subtitle: l.company_name,
        reason: `Proposal sent ${days}d ago, no follow-up`,
        effective_due: new Date(last.getTime() + 21 * 86_400_000),
        severity: days > 30 ? 'critical' : 'high',
        open_href: `/leads/${l.lead_id}`,
      })
    }

    for (const l of leads) {
      if (!l.next_followup_date) continue
      const due = new Date(l.next_followup_date)
      const daysOverdue = daysBetween(now, due)
      if (daysOverdue < 0) continue
      const key = `overdue_followup:${l.lead_id}`
      if (snoozedKeys.has(key)) continue
      out.push({
        kind: 'auto',
        type: 'overdue_followup',
        signal_key: key,
        title: l.full_name,
        subtitle: l.company_name,
        reason: daysOverdue === 0 ? 'Follow-up due today' : `Follow-up was due ${daysOverdue}d ago`,
        effective_due: due,
        severity: daysOverdue > 7 ? 'critical' : daysOverdue >= 1 ? 'high' : 'medium',
        open_href: `/leads/${l.lead_id}`,
      })
    }

    return out
  }, [leads, threads, snoozedKeys])

  const manualSignals = useMemo<ManualSignal[]>(() => {
    return tasks
      .filter((t) => t.status === 'open' || (t.status === 'snoozed' && t.snoozed_until && new Date(t.snoozed_until) <= new Date()))
      .map<ManualSignal>((t) => ({
        kind: 'manual',
        task: t,
        effective_due: t.due_date ? new Date(t.due_date) : null,
        severity: 'medium',
      }))
  }, [tasks])

  const queue = useMemo<QueueItem[]>(() => {
    const all: QueueItem[] = [...autoSignals, ...manualSignals]
    return all.sort((a, b) => {
      if (!a.effective_due && b.effective_due) return 1
      if (a.effective_due && !b.effective_due) return -1
      if (a.effective_due && b.effective_due) {
        const diff = a.effective_due.getTime() - b.effective_due.getTime()
        if (diff !== 0) return diff
      }
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    })
  }, [autoSignals, manualSignals])

  const metrics = useMemo(() => {
    let overdue = 0, waiting = 0, stalled = 0
    for (const a of autoSignals) {
      if (a.type === 'overdue_followup') overdue++
      else if (a.type === 'conversation_waiting') waiting++
      else if (a.type === 'stalled_proposal') stalled++
    }
    return { overdue, waiting, stalled, manual: manualSignals.length }
  }, [autoSignals, manualSignals])

  async function snoozeAuto(key: string) {
    setBusyKey(key)
    setError(null)
    try {
      const res = await fetch('/api/snoozed-signals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_key: key, snoozed_until: tomorrowIso24h() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Snooze failed')
      setSnoozed(data.signals ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snooze failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function patchTask(id: string, body: Record<string, unknown>) {
    setBusyKey(`task:${id}`)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Update failed')
      reloadTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function deleteTask(id: string) {
    if (!window.confirm('Delete this task?')) return
    setBusyKey(`task:${id}`)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Delete failed')
      }
      reloadTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusyKey(null)
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!formTitle.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          due_date: formDue || undefined,
          ...(formLead ? { link_type: 'lead', link_id: formLead.lead_id } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Create failed')
      setFormTitle('')
      setFormDue('')
      setFormLeadQuery('')
      setShowForm(false)
      reloadTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Today</span>
          <span className="card-head-count">{queue.length} ITEMS</span>
        </div>
        <div className="card-head-actions">
          <button className="btn btn-sm" onClick={() => setShowForm((v) => !v)}>
            <Icon name="plus" size={11} /> Add task
          </button>
        </div>
      </div>

      {/* Counter strip */}
      <div className="counter-strip">
        <Counter n={metrics.overdue} l="Overdue" tone="risk" />
        <Counter n={metrics.waiting} l="Waiting" tone="warn" />
        <Counter n={metrics.stalled} l="Stalled" tone="warn" />
        <Counter n={metrics.manual} l="Manual" tone="info" />
      </div>

      {/* Quick-add */}
      {showForm && (
        <form
          onSubmit={createTask}
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--line-subtle)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            className="input"
            style={{ flex: '1 1 200px' }}
            placeholder="A short note for future-you."
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            autoFocus
          />
          <input
            className="input"
            type="date"
            style={{ width: 150, colorScheme: 'dark' }}
            value={formDue}
            onChange={(e) => setFormDue(e.target.value)}
          />
          <input
            className="input"
            list="today-lead-options"
            style={{ width: 180 }}
            placeholder="Link to lead (optional)"
            value={formLeadQuery}
            onChange={(e) => setFormLeadQuery(e.target.value)}
          />
          <datalist id="today-lead-options">
            {leads.map((l) => (
              <option key={l.lead_id} value={l.full_name}>{l.company_name}</option>
            ))}
          </datalist>
          {formLead && (
            <span className="micro" style={{ color: 'var(--ok)' }}>→ {formLead.full_name}</span>
          )}
          <button className="btn btn-primary btn-sm" type="submit" disabled={creating || !formTitle.trim()}>
            {creating ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => { setShowForm(false); setFormTitle(''); setFormDue('') }}
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--line-subtle)' }}>
          <span className="risk" style={{ fontSize: 11.5 }}>{error}</span>
        </div>
      )}

      {/* Queue */}
      {loadingTasks && queue.length === 0 ? (
        <div className="ink-3" style={{ padding: '20px', fontSize: 12 }}>Loading…</div>
      ) : queue.length === 0 ? (
        <div className="empty">
          <div className="empty-title">Nothing on the queue.</div>
          Add a task above, or check Attention for slower-rolling concerns.
        </div>
      ) : (
        <div>
          {queue.map((item, i) =>
            item.kind === 'auto' ? (
              <AutoRow
                key={item.signal_key}
                item={item}
                last={i === queue.length - 1}
                busy={busyKey === item.signal_key}
                onSnooze={() => snoozeAuto(item.signal_key)}
              />
            ) : (
              <ManualRow
                key={item.task.id}
                item={item}
                last={i === queue.length - 1}
                busy={busyKey === `task:${item.task.id}`}
                onDone={() => patchTask(item.task.id, { status: 'done' })}
                onSnooze={() => patchTask(item.task.id, { status: 'snoozed', snoozed_until: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) })}
                onDelete={() => deleteTask(item.task.id)}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function Counter({ n, l, tone }: { n: number; l: string; tone: 'risk' | 'warn' | 'info' }) {
  return (
    <div className={`counter ${n === 0 ? 'zero' : tone}`}>
      <span className="counter-n">{String(n).padStart(2, '0')}</span>
      <span className="counter-l">{l}</span>
    </div>
  )
}

function SevBar({ color }: { color: string }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: 8,
        top: 14,
        bottom: 14,
        width: 2,
        borderRadius: 2,
        background: color,
      }}
    />
  )
}

const ROW_STYLE: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '12px 20px 12px 22px',
}

function AutoRow({
  item, last, busy, onSnooze,
}: {
  item: AutoSignal
  last: boolean
  busy: boolean
  onSnooze: () => void
}) {
  const color = SEVERITY_COLOR[item.severity]
  return (
    <div style={{ ...ROW_STYLE, borderBottom: last ? 'none' : '1px solid var(--line-subtle)', opacity: busy ? 0.5 : 1 }}>
      <SevBar color={color} />
      <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
          {item.subtitle && <span className="ink-3" style={{ fontSize: 12 }}>· {item.subtitle}</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="micro" style={{ color }}>{AUTO_LABEL[item.type]}</span>
          <span className="ink-3" style={{ fontSize: 11.5 }}>{item.reason}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
        <button className="btn btn-xs btn-ghost" onClick={onSnooze} disabled={busy}>
          <Icon name="snooze" size={11} /> Snooze 24h
        </button>
        <Link className="btn btn-xs" href={item.open_href}>
          Open <Icon name="arrow" size={10} />
        </Link>
      </div>
    </div>
  )
}

function ManualRow({
  item, last, busy, onDone, onSnooze, onDelete,
}: {
  item: ManualSignal
  last: boolean
  busy: boolean
  onDone: () => void
  onSnooze: () => void
  onDelete: () => void
}) {
  const due = item.task.due_date
    ? new Date(item.task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null
  return (
    <div style={{ ...ROW_STYLE, borderBottom: last ? 'none' : '1px solid var(--line-subtle)', opacity: busy ? 0.5 : 1 }}>
      <SevBar color="var(--accent)" />
      <div className="col" style={{ gap: 4, minWidth: 0, flex: 1 }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="ink" style={{ fontSize: 13, letterSpacing: 'var(--t-tight)' }}>{item.task.title}</span>
          <span className="badge-pill" style={{ fontSize: 9.5 }}>TASK</span>
        </div>
        <span className="micro" style={{ color: 'var(--ink-3)' }}>{due ? `Due ${due}` : 'No date'}</span>
      </div>
      <div className="row" style={{ gap: 6, flexShrink: 0 }}>
        {item.task.link_type === 'lead' && item.task.link_id && (
          <Link className="btn btn-xs" href={`/leads/${item.task.link_id}`}>
            Open <Icon name="arrow" size={10} />
          </Link>
        )}
        {item.task.link_type === 'opportunity' && item.task.link_id && (
          <Link className="btn btn-xs" href="/opportunities">
            Open <Icon name="arrow" size={10} />
          </Link>
        )}
        <button className="btn btn-xs btn-ghost" onClick={onDone} disabled={busy}>
          <Icon name="check" size={11} /> Done
        </button>
        <button className="btn btn-xs btn-ghost" onClick={onSnooze} disabled={busy}>
          <Icon name="snooze" size={11} />
        </button>
        <button className="btn btn-xs btn-ghost" onClick={onDelete} disabled={busy}>
          <Icon name="x" size={11} />
        </button>
      </div>
    </div>
  )
}
