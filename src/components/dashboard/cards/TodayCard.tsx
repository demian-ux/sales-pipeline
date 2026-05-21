'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { IconLoader, IconX } from '@/components/ui/icons'
import type { Lead, Opportunity, Task, SnoozedSignal, Thread } from '@/lib/types'

type AutoKind = 'conversation_waiting' | 'stalled_proposal' | 'overdue_followup'
type Severity = 'critical' | 'high' | 'medium'

interface AutoSignal {
  kind: 'auto'
  type: AutoKind
  signal_key: string
  title: string
  subtitle?: string
  reason: string
  effective_due: Date          // sort key
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
  opportunities: Opportunity[]
  threads: Thread[]
  initialSnoozedSignals: SnoozedSignal[]
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 }

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

function tomorrowIso24h(): string {
  const t = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return t.toISOString()
}

export default function TodayCard({ leads, opportunities, threads, initialSnoozedSignals }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [snoozed, setSnoozed] = useState<SnoozedSignal[]>(initialSnoozedSignals)
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formTitle, setFormTitle] = useState('')
  const [formDue, setFormDue] = useState('')
  const [creating, setCreating] = useState(false)

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

  // ── Auto signals ────────────────────────────────────────────────────────
  const autoSignals = useMemo<AutoSignal[]>(() => {
    const out: AutoSignal[] = []
    const now = new Date()
    const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

    // 1. Gmail threads waiting for us
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
        open_href: '/conversations',
      })
    }

    // 2. Stalled proposals: Proposal Sent + 21d+ since last touch
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

    // 3. Overdue follow-ups: next_followup_date past
    for (const l of leads) {
      if (!l.next_followup_date) continue
      const due = new Date(l.next_followup_date)
      const daysOverdue = daysBetween(now, due)
      if (daysOverdue < 0) continue  // not yet due
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
  }, [leads, threads, snoozedKeys, opportunities])

  // ── Manual tasks ─────────────────────────────────────────────────────────
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

  // ── Merged + sorted queue ────────────────────────────────────────────────
  const queue = useMemo<QueueItem[]>(() => {
    const all: QueueItem[] = [...autoSignals, ...manualSignals]
    return all.sort((a, b) => {
      // Items with no due date sink to the bottom
      if (!a.effective_due && b.effective_due) return 1
      if (a.effective_due && !b.effective_due) return -1
      if (a.effective_due && b.effective_due) {
        const diff = a.effective_due.getTime() - b.effective_due.getTime()
        if (diff !== 0) return diff
      }
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    })
  }, [autoSignals, manualSignals])

  // ── Metric row counts ────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    let overdue = 0, waiting = 0, stalled = 0
    for (const a of autoSignals) {
      if (a.type === 'overdue_followup') overdue++
      else if (a.type === 'conversation_waiting') waiting++
      else if (a.type === 'stalled_proposal') stalled++
    }
    return { overdue, waiting, stalled, manual: manualSignals.length }
  }, [autoSignals, manualSignals])

  // ── Actions ──────────────────────────────────────────────────────────────
  async function snoozeAuto(key: string) {
    setBusyKey(key)
    setError(null)
    try {
      const snoozedUntil = tomorrowIso24h()
      const res = await fetch('/api/snoozed-signals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal_key: key, snoozed_until: snoozedUntil }),
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
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Create failed')
      setFormTitle('')
      setFormDue('')
      setShowForm(false)
      reloadTasks()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <CardShell title="Today" count={queue.length}>
      {/* Metric row */}
      <div style={{
        display: 'flex',
        gap: 16,
        fontSize: 11,
        color: 'var(--text-faint)',
        padding: '8px 14px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        marginBottom: 10,
        flexWrap: 'wrap',
      }}>
        <Metric label="overdue"  count={metrics.overdue}  color="var(--red)" />
        <Metric label="waiting"  count={metrics.waiting}  color="var(--accent)" />
        <Metric label="stalled"  count={metrics.stalled}  color="var(--yellow)" />
        <Metric label="manual"   count={metrics.manual} />
      </div>

      {/* Add task form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{
            fontSize: 12,
            padding: '6px 12px',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: 6,
            color: 'var(--text-faint)',
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            marginBottom: 10,
          }}
        >
          + Add task
        </button>
      ) : (
        <form
          onSubmit={createTask}
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 10,
            padding: 8,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            autoFocus
            placeholder="Task title"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            style={{
              flex: '1 1 200px',
              minWidth: 160,
              fontSize: 12,
              padding: '6px 10px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <input
            type="date"
            value={formDue}
            onChange={(e) => setFormDue(e.target.value)}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text)',
              colorScheme: 'dark',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={creating || !formTitle.trim()}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              borderRadius: 5,
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
              fontWeight: 600,
              cursor: creating || !formTitle.trim() ? 'default' : 'pointer',
              opacity: creating || !formTitle.trim() ? 0.5 : 1,
            }}
          >
            {creating ? '…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setFormTitle(''); setFormDue('') }}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 5,
              color: 'var(--text-faint)',
              cursor: 'pointer',
            }}
          >
            <IconX size={11} />
          </button>
        </form>
      )}

      {error && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 5 }}>
          {error}
        </div>
      )}

      {/* Queue */}
      {loadingTasks && queue.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 16, fontSize: 12, color: 'var(--text-faint)' }}>
          <IconLoader size={12} /> Loading…
        </div>
      ) : queue.length === 0 ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          Nothing on the queue. Add a task above, or check Attention for slower-rolling concerns.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {queue.map((item) =>
            item.kind === 'auto' ? (
              <AutoRow
                key={item.signal_key}
                item={item}
                busy={busyKey === item.signal_key}
                onSnooze={() => snoozeAuto(item.signal_key)}
              />
            ) : (
              <ManualRow
                key={item.task.id}
                item={item}
                busy={busyKey === `task:${item.task.id}`}
                onDone={() => patchTask(item.task.id, { status: 'done' })}
                onSnooze={() => patchTask(item.task.id, { status: 'snoozed', snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })}
                onDelete={() => deleteTask(item.task.id)}
              />
            ),
          )}
        </div>
      )}
    </CardShell>
  )
}

function Metric({ label, count, color }: { label: string; count: number; color?: string }) {
  if (count === 0) {
    return (
      <span style={{ opacity: 0.5 }}>
        <strong style={{ color: 'var(--text-muted)' }}>0</strong> {label}
      </span>
    )
  }
  return (
    <span>
      <strong style={{ color: color ?? 'var(--text)', fontWeight: 600 }}>{count}</strong> {label}
    </span>
  )
}

function AutoRow({ item, busy, onSnooze }: { item: AutoSignal; busy: boolean; onSnooze: () => void }) {
  const severityColor =
    item.severity === 'critical' ? 'var(--red)'
    : item.severity === 'high' ? 'var(--yellow)'
    : 'var(--text-faint)'

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</span>
          {item.subtitle && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.subtitle}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: severityColor }}>{item.reason}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onSnooze}
          disabled={busy}
          style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-faint)', cursor: busy ? 'default' : 'pointer' }}
        >
          Snooze 24h
        </button>
        <Link
          href={item.open_href}
          style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(200,169,110,0.25)' }}
        >
          Open →
        </Link>
      </div>
    </div>
  )
}

function ManualRow({ item, busy, onDone, onSnooze, onDelete }: { item: ManualSignal; busy: boolean; onDone: () => void; onSnooze: () => void; onDelete: () => void }) {
  const overdue = item.effective_due && item.effective_due.getTime() < Date.now()

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      opacity: busy ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text)' }}>{item.task.title}</span>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
            task
          </span>
        </div>
        {item.task.due_date && (
          <div style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text-faint)', marginTop: 2 }}>
            Due {new Date(item.task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button type="button" onClick={onDone}   disabled={busy} style={btnStyle('var(--green)')}>Done</button>
        <button type="button" onClick={onSnooze} disabled={busy} style={btnStyle()}>Snooze</button>
        <button type="button" onClick={onDelete} disabled={busy} style={btnStyle('var(--red)')}>×</button>
      </div>
    </div>
  )
}

function btnStyle(color?: string): React.CSSProperties {
  return {
    fontSize: 11,
    padding: '4px 10px',
    background: 'transparent',
    border: `1px solid ${color ? color === 'var(--red)' ? 'rgba(224,92,92,0.3)' : color === 'var(--green)' ? 'rgba(76,175,134,0.3)' : 'var(--border)' : 'var(--border)'}`,
    borderRadius: 5,
    color: color ?? 'var(--text-faint)',
    cursor: 'pointer',
  }
}

function CardShell({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          {title}
          {typeof count === 'number' && count > 0 && (
            <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{count}</span>
          )}
        </h2>
      </div>
      {children}
    </section>
  )
}
