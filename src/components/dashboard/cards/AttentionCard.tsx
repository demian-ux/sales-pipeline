'use client'

import Link from 'next/link'
import { StageBadge, Empty } from '@/components/ui/primitives'
import type { Lead } from '@/lib/types'

interface Props {
  leads: Lead[]
}

type Severity = 'critical' | 'high' | 'medium' | 'normal'

interface AttentionItem {
  lead: Lead
  reason: string
  severity: Severity
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, normal: 3 }
const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'var(--risk)',
  high:     'var(--warn)',
  medium:   'var(--info)',
  normal:   'var(--ink-3)',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  normal:   'Low',
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function detectAttention(leads: Lead[]): AttentionItem[] {
  const byLead = new Map<string, AttentionItem>()

  function add(lead: Lead, reason: string, severity: Severity) {
    const existing = byLead.get(lead.lead_id)
    if (!existing || SEVERITY_RANK[severity] < SEVERITY_RANK[existing.severity]) {
      byLead.set(lead.lead_id, { lead, reason, severity })
    }
  }

  for (const lead of leads) {
    if (lead.lead_status === 'Archived') continue
    const ds = daysSince(lead.last_touch_date)
    const rel = Number(lead.relationship_score) || 0
    const pri = Number(lead.priority_score) || 0

    if (lead.pipeline_stage === 'Won' && ds > 90) {
      add(lead, `Past client — no check-in in ${ds}d`, rel >= 6 ? 'high' : 'medium')
      continue
    }
    if (pri >= 7 && ds > 60) {
      add(lead, `High-priority contact — no touch in ${ds === Infinity ? 'unknown' : `${ds}d`}`, 'high')
      continue
    }
    if (lead.pipeline_stage === 'Dormant' && rel >= 6) {
      add(lead, `Dormant — relationship score ${rel}/10, worth rekindling`, 'medium')
      continue
    }
    if ((lead.relationship_temperature === 'Cool' || lead.relationship_temperature === 'Cold') && rel >= 6) {
      add(lead, `Relationship cooling — last touched ${ds === Infinity ? 'unknown' : `${ds}d ago`}`, 'medium')
      continue
    }
    if (lead.pipeline_stage === 'Discovery' && ds > 30) {
      add(lead, `In Discovery — no touch in ${ds}d, re-engage before they forget`, 'high')
      continue
    }
  }

  return [...byLead.values()]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, 10)
}

export default function AttentionCard({ leads }: Props) {
  const items = detectAttention(leads)

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Attention</span>
          <span className="card-head-count">{String(items.length).padStart(2, '0')} CONCERNS</span>
        </div>
      </div>

      {items.length === 0 ? (
        <Empty title="Nothing needs attention.">
          Slower-rolling concerns — dormant relationships, long silences — surface here.
        </Empty>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <Link key={item.lead.lead_id} className="stack-row" href={`/leads/${item.lead.lead_id}`}>
              <div className="stack-row-main">
                <div className="row" style={{ gap: 8 }}>
                  <span className="ink" style={{ fontSize: 13 }}>{item.lead.full_name}</span>
                  <span className="ink-3" style={{ fontSize: 12 }}>· {item.lead.company_name}</span>
                  <StageBadge stage={item.lead.pipeline_stage} />
                </div>
                <span className="ink-2" style={{ fontSize: 12 }}>{item.reason}</span>
              </div>
              <span className="micro" style={{ color: SEVERITY_COLOR[item.severity] }}>
                {SEVERITY_LABEL[item.severity]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
