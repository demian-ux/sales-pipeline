'use client'

import Link from 'next/link'
import Badge from '@/components/ui/Badge'
import { stageVariant } from '@/lib/utils'
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
  critical: 'var(--red)',
  high:     'var(--yellow)',
  medium:   '#9b8be0',
  normal:   'var(--text-faint)',
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

// Merged Follow-up + Risks detector logic, deduped by lead_id. Skips the
// signals that already feed Today's queue (stalled proposals, overdue
// follow-ups) so the dashboard never double-displays a single concern.
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

    // Past client gap (Won + 90d+)
    if (lead.pipeline_stage === 'Won' && ds > 90) {
      add(lead, `Past client — no check-in in ${ds}d`, rel >= 6 ? 'high' : 'medium')
      continue
    }

    // Neglected high-priority (60d+)
    if (pri >= 7 && ds > 60) {
      add(lead, `High-priority contact — no touch in ${ds === Infinity ? 'unknown' : `${ds}d`}`, 'high')
      continue
    }

    // Dormant warm (Dormant + rel_score >= 6)
    if (lead.pipeline_stage === 'Dormant' && rel >= 6) {
      add(lead, `Dormant — relationship score ${rel}/10, worth rekindling`, 'medium')
      continue
    }

    // Cooling relationship with good rel_score
    if ((lead.relationship_temperature === 'Cool' || lead.relationship_temperature === 'Cold') && rel >= 6) {
      add(lead, `Relationship cooling — last touched ${ds === Infinity ? 'unknown' : `${ds}d ago`}`, 'medium')
      continue
    }

    // Discovery drift (in Discovery + 30d+)
    if (lead.pipeline_stage === 'Discovery' && ds > 30) {
      add(lead, `In Discovery — no touch in ${ds}d, re-engage before they forget`, 'high')
      continue
    }
  }

  return [...byLead.values()].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 10)
}

export default function AttentionCard({ leads }: Props) {
  const items = detectAttention(leads)

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Attention
          {items.length > 0 && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{items.length}</span>}
        </h2>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          Nothing needs attention.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <Link key={item.lead.lead_id} href={`/leads/${item.lead.lead_id}`}>
              <div className="hover-card" style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{item.lead.full_name}</span>
                    <Badge label={item.lead.pipeline_stage} variant={stageVariant(item.lead.pipeline_stage)} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 3 }}>{item.lead.company_name}</div>
                  <div style={{ fontSize: 12, color: SEVERITY_COLOR[item.severity], lineHeight: 1.4 }}>{item.reason}</div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, paddingTop: 2 }}>
                  {item.severity}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
