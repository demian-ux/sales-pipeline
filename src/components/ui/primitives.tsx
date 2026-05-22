// Shared presentational primitives, ported from the Claude Design handoff.
// Pure markup against the class system in globals.css — safe in both server
// and client components.

import type { CSSProperties, ReactNode } from 'react'
import { Icon } from './icons'
import { STAGE_ORDER, type PipelineStage, type RelationshipTemperature } from '@/lib/types'

function scoreTier(value: number): string {
  if (value >= 85) return 'tier-1'
  if (value >= 75) return 'tier-2'
  if (value >= 60) return 'tier-3'
  return 'tier-4'
}

// ── ScoreBlock — single treatment for any 0–100 score ────────────────────
export function ScoreBlock({
  value,
  label = 'Score',
  size = 'md',
}: {
  value: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const numSize = size === 'lg' ? 38 : size === 'sm' ? 22 : 30
  return (
    <div className={`score ${scoreTier(value)}`}>
      <div className="score-eyebrow">{label}</div>
      <div className="score-num" style={{ fontSize: numSize }}>
        {value}
        <span className="of">/100</span>
      </div>
    </div>
  )
}

// ── Score10 — inline X/10 (relationship, taste, fit) ─────────────────────
export function Score10({ value, label }: { value: number; label?: string }) {
  let tier = 'tier-4'
  if (value >= 8) tier = 'tier-1'
  else if (value >= 6) tier = 'tier-2'
  else if (value >= 4) tier = 'tier-3'
  return (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      {label ? (
        <span className="micro" style={{ fontSize: 9.5, flexShrink: 0 }}>
          {label}
        </span>
      ) : null}
      <span className={`num-10 ${tier}`}>
        {value}
        <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>/10</span>
      </span>
    </span>
  )
}

// ── StatusBadge — dot + word, no fill ────────────────────────────────────
export function StatusBadge({
  tone = 'ok',
  children,
}: {
  tone?: 'ok' | 'warn' | 'risk' | 'info'
  children: ReactNode
}) {
  return (
    <span className={`badge-status ${tone}`}>
      <span className="dot" />
      <span>{children}</span>
    </span>
  )
}

// ── Pill — neutral chip with optional gold tint ──────────────────────────
export function Pill({
  tone,
  children,
}: {
  tone?: 'gold'
  children: ReactNode
}) {
  return <span className={`badge-pill ${tone === 'gold' ? 'gold' : ''}`}>{children}</span>
}

// ── StageBadge — pipeline stage chip with a monospace ordinal ────────────
export function StageBadge({ stage }: { stage: PipelineStage }) {
  const idx = STAGE_ORDER.indexOf(stage)
  return (
    <span className="badge-stage">
      <span className="num">{idx >= 0 ? String(idx).padStart(2, '0') : '··'}</span>
      <span>{stage}</span>
    </span>
  )
}

// ── TempBadge — relationship temperature chip ────────────────────────────
const TEMP_META: Record<RelationshipTemperature, { cls: string; label: string }> = {
  Hot:  { cls: 'anchor',  label: 'Hot' },
  Warm: { cls: 'warm',    label: 'Warm' },
  Cool: { cls: 'cold',    label: 'Cool' },
  Cold: { cls: 'dormant', label: 'Cold' },
}

export function TempBadge({ temp }: { temp: RelationshipTemperature }) {
  const m = TEMP_META[temp]
  return <span className={`badge-temp ${m.cls}`}>{m.label}</span>
}

// ── Card — surface with optional head + edit-mode chrome ─────────────────
export function Card({
  title,
  count,
  actions,
  editing,
  removable,
  onRemove,
  sortable,
  children,
  style,
}: {
  title?: ReactNode
  count?: ReactNode
  actions?: ReactNode
  editing?: boolean
  removable?: boolean
  onRemove?: () => void
  sortable?: boolean
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className={`card ${editing ? 'edit-frame' : ''}`} style={style}>
      {editing && sortable && (
        <button className="drag-handle" title="Drag to reorder">
          <Icon name="drag" size={12} />
        </button>
      )}
      {editing && removable && (
        <button className="x-handle" onClick={onRemove} title="Remove card">
          <Icon name="x" size={11} />
        </button>
      )}
      {(title || actions) && (
        <div className="card-head">
          <div className="card-head-title">
            <span className="card-head-name">{title}</span>
            {count != null && <span className="card-head-count">{count}</span>}
          </div>
          {actions && <div className="card-head-actions">{actions}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  )
}

// ── WhyNow — gold left-border indent ─────────────────────────────────────
export function WhyNow({
  children,
  label = 'Why now',
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <div className="why-now">
      <span className="lbl">{label}</span>
      {children}
    </div>
  )
}

// ── NextAction — recommended-action line ─────────────────────────────────
export function NextAction({ children }: { children: ReactNode }) {
  return (
    <div
      className="row"
      style={{
        gap: 8,
        color: 'var(--accent)',
        fontSize: 12.5,
        fontWeight: 500,
        letterSpacing: 'var(--t-tight)',
      }}
    >
      <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>→</span>
      <span>{children}</span>
    </div>
  )
}

// ── Avatar — initials, no photos (single-user app) ───────────────────────
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--surface-3)',
        color: 'var(--ink-2)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 500,
        letterSpacing: 0,
        border: '1px solid var(--line)',
        flexShrink: 0,
      }}
    >
      {initials}
    </span>
  )
}

// ── Empty — advisor-voice empty state ────────────────────────────────────
export function Empty({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {title && <div className="empty-title">{title}</div>}
      <div>{children}</div>
    </div>
  )
}
