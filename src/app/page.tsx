import { getLeads, getOpportunities, getAIInsights, USE_MOCK } from '@/lib/sheets'
import { urgencyVariant, stageVariant } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import CopyButton from '@/components/ui/CopyButton'
import OppStatusButton from '@/components/today/OppStatusButton'
import Link from 'next/link'
import { sessionCache } from '@/lib/sheets/cache'
import type { Lead, Opportunity, AIInsight } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Intelligence helpers ───────────────────────────────────────────────────

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

type RiskSignal = {
  lead: Lead
  reason: string
  severity: 'critical' | 'high' | 'medium'
  days_since_touch: number
}

function detectRisks(leads: Lead[]): RiskSignal[] {
  const signals: RiskSignal[] = []

  for (const lead of leads) {
    const ds = daysSince(lead.last_touch_date)
    const relScore = Number(lead.relationship_score) || 0
    const priScore = Number(lead.priority_score) || 0

    // Stalled proposal — highest priority risk
    if (lead.pipeline_stage === 'Proposal Sent' && ds > 21) {
      signals.push({
        lead,
        reason: `Proposal sent ${ds} days ago with no follow-up`,
        severity: 'critical',
        days_since_touch: ds,
      })
      continue
    }

    // Neglected high-value contact
    if (priScore >= 7 && ds > 60) {
      signals.push({
        lead,
        reason: `High-priority contact — no touch in ${ds === Infinity ? 'unknown' : ds} days`,
        severity: 'high',
        days_since_touch: ds,
      })
      continue
    }

    // Past client with no check-in
    if (lead.pipeline_stage === 'Won' && ds > 90 && relScore >= 6) {
      signals.push({
        lead,
        reason: `Past client — no relationship check-in for ${ds} days`,
        severity: 'high',
        days_since_touch: ds,
      })
      continue
    }

    // Dormant but valuable
    if (lead.pipeline_stage === 'Dormant' && relScore >= 7) {
      signals.push({
        lead,
        reason: `Dormant — relationship score ${relScore}/10, worth rekindling`,
        severity: 'medium',
        days_since_touch: ds,
      })
      continue
    }

    // Cooling relationship with good scores
    if (
      (lead.relationship_temperature === 'Cool' || lead.relationship_temperature === 'Cold') &&
      relScore >= 6
    ) {
      signals.push({
        lead,
        reason: `Relationship cooling — last touched ${ds === Infinity ? 'unknown' : ds + ' days ago'}`,
        severity: 'medium',
        days_since_touch: ds,
      })
    }
  }

  const order = { critical: 0, high: 1, medium: 2 }
  return signals.sort((a, b) => order[a.severity] - order[b.severity])
}

// ── Follow-up suggestions ─────────────────────────────────────────────────

type FollowUpSuggestion = {
  lead: Lead
  reason: string
  priority: 'urgent' | 'high' | 'normal'
  action: string
  draft_available: boolean
}

function buildFollowUpSuggestions(leads: Lead[], insightLeadIds: Set<string>): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = []

  for (const lead of leads) {
    if (lead.lead_status === 'Archived') continue
    const ds = daysSince(lead.last_touch_date)
    const relScore = Number(lead.relationship_score) || 0
    const stage = lead.pipeline_stage

    // Overdue follow-up date
    if (lead.next_followup_date) {
      const daysOverdue = -Math.floor(
        (new Date(lead.next_followup_date).getTime() - Date.now()) / 86_400_000
      )
      if (daysOverdue > 0) {
        suggestions.push({
          lead,
          reason: `Follow-up was due ${daysOverdue}d ago`,
          priority: daysOverdue > 7 ? 'urgent' : 'high',
          action: lead.next_action || 'Follow up',
          draft_available: insightLeadIds.has(lead.lead_id),
        })
        continue
      }
    }

    // Discovery drift — in Discovery but no touch in 30+ days
    if (stage === 'Discovery' && ds > 30) {
      suggestions.push({
        lead,
        reason: `In Discovery — no touch in ${ds}d`,
        priority: 'high',
        action: 'Re-engage before they forget the meeting',
        draft_available: insightLeadIds.has(lead.lead_id),
      })
      continue
    }

    // Anchor client gap — Won stage, 90+ days no check-in
    if (stage === 'Won' && ds > 90) {
      suggestions.push({
        lead,
        reason: `Anchor client — no check-in in ${ds}d`,
        priority: 'high',
        action: 'Relationship check-in to surface new pipeline',
        draft_available: insightLeadIds.has(lead.lead_id),
      })
      continue
    }

    // Dormant warm lead
    if (stage === 'Dormant' && relScore >= 6) {
      suggestions.push({
        lead,
        reason: `Dormant — rel. score ${relScore}/10, worth rekindling`,
        priority: 'normal',
        action: 'Look for a natural reason to reconnect',
        draft_available: insightLeadIds.has(lead.lead_id),
      })
    }
  }

  const order = { urgent: 0, high: 1, normal: 2 }
  return suggestions.sort((a, b) => order[a.priority] - order[b.priority]).slice(0, 6)
}

const URGENCY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 }

function sortOpportunities(opps: Opportunity[], leadMap: Map<string, Lead>): Opportunity[] {
  return [...opps].sort((a, b) => {
    const urgencyDiff = (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1)
    if (urgencyDiff !== 0) return urgencyDiff
    const confDiff = Number(b.confidence) - Number(a.confidence)
    if (confDiff !== 0) return confDiff
    const aPri = Number(leadMap.get(a.lead_id)?.priority_score) || 0
    const bPri = Number(leadMap.get(b.lead_id)?.priority_score) || 0
    if (aPri !== bPri) return bPri - aPri
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function TodayPage() {
  const [leads, opportunities, insights] = await Promise.all([
    getLeads(),
    getOpportunities(),
    getAIInsights(),
  ])

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).toUpperCase()

  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  const openOpps = sortOpportunities(
    opportunities.filter((o) => o.status === 'Open' || o.status === 'In Progress'),
    leadMap
  )

  const risks = detectRisks(leads)

  const discoveryQueue = leads.filter((l) => l.pipeline_stage === 'Discovery')

  const draftsReady = [...insights]
    .filter((i) => i.suggested_email || i.suggested_linkedin_dm)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)

  // Follow-up suggestions
  const insightLeadIds = new Set(insights.map((i) => i.lead_id))
  const followUpSuggestions = buildFollowUpSuggestions(leads, insightLeadIds)

  // Conversations waiting for us (from Gmail session cache)
  const waitingThreads = Object.values(sessionCache.threads)
    .flat()
    .filter((t) => t.inferred_state === 'waiting_for_us')
    .slice(0, 4)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1120 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div className="page-eyebrow">{today}</div>
          <h1 className="page-title">Today</h1>
        </div>
        {USE_MOCK && (
          <div style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Mock data
          </div>
        )}
      </div>

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 32 }}>
        {[
          { label: 'Open opportunities', value: openOpps.length, color: 'var(--accent)', href: '/opportunities' },
          { label: 'Relationship risks', value: risks.length, color: 'var(--red)', href: '/strategic-map' },
          { label: 'Discovery pending', value: discoveryQueue.length, color: 'var(--yellow)', href: '/strategic-map' },
          { label: 'Follow-up needed', value: followUpSuggestions.length, color: '#9b8be0', href: undefined },
          { label: 'Drafts ready', value: draftsReady.length, color: 'var(--green)', href: '/draft-queue' },
        ].map((s) => (
          <div key={s.label} className="stat-chip">
            {s.href ? (
              <Link href={s.href} style={{ display: 'block' }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{s.label}</div>
              </Link>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{s.label}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Conversations waiting */}
        {waitingThreads.length > 0 && (
          <Section
            title="Conversations waiting for you"
            count={waitingThreads.length}
            href="/conversations"
            emptyLabel=""
          >
            {waitingThreads.map((thread) => {
              const lead = leadMap.get(thread.lead_id)
              return (
                <Link key={thread.thread_id} href="/conversations">
                  <div className="hover-card" style={{ background: 'var(--surface)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{lead?.full_name ?? thread.lead_id}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{thread.subject}</div>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--red)', background: 'rgba(224,92,92,0.1)', padding: '2px 7px', borderRadius: 3, flexShrink: 0 }}>Reply needed</span>
                  </div>
                </Link>
              )
            })}
          </Section>
        )}

        {/* Strategic Opportunities */}
        <Section
          title="Strategic opportunities"
          count={openOpps.length}
          href="/opportunities"
          emptyLabel="No open opportunities"
        >
          {openOpps.slice(0, 6).map((opp) => (
            <OppCard key={opp.opportunity_id} opp={opp} lead={leadMap.get(opp.lead_id)} />
          ))}
        </Section>

        {/* Follow-up suggestions */}
        {followUpSuggestions.length > 0 && (
          <Section
            title="Follow-up needed"
            count={followUpSuggestions.length}
            emptyLabel=""
          >
            {followUpSuggestions.map((s) => (
              <FollowUpCard key={s.lead.lead_id} suggestion={s} />
            ))}
          </Section>
        )}

        {/* Relationship Risks */}
        <Section
          title="Relationship risks"
          count={risks.length}
          emptyLabel="No relationship risks detected"
        >
          {risks.slice(0, 5).map((signal) => (
            <RiskCard key={signal.lead.lead_id} signal={signal} />
          ))}
        </Section>

        {/* Two-column: Discovery + Drafts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <Section
            title="Discovery prep"
            count={discoveryQueue.length}
            emptyLabel="No leads in Discovery stage"
          >
            {discoveryQueue.slice(0, 4).map((lead) => (
              <DiscoveryCard key={lead.lead_id} lead={lead} />
            ))}
          </Section>

          <Section
            title="Drafts ready"
            count={draftsReady.length}
            href="/draft-queue"
            emptyLabel="No drafts yet — analyze a lead to generate messages"
          >
            {draftsReady.map((insight) => (
              <DraftCard key={insight.insight_id} insight={insight} lead={leadMap.get(insight.lead_id)} />
            ))}
          </Section>
        </div>

      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({
  title, count, href, emptyLabel, children,
}: {
  title: string
  count: number
  href?: string
  emptyLabel: string
  children: React.ReactNode
}) {
  const hasChildren = Array.isArray(children)
    ? (children as React.ReactNode[]).filter(Boolean).length > 0
    : !!children

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          {title}
          {count > 0 && (
            <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{count}</span>
          )}
        </h2>
        {href && (
          <Link href={href} style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            View all →
          </Link>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!hasChildren ? (
          <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
            {emptyLabel}
          </div>
        ) : children}
      </div>
    </section>
  )
}

// ── Follow-up suggestion card ─────────────────────────────────────────────

function FollowUpCard({ suggestion }: { suggestion: FollowUpSuggestion }) {
  const priorityColor = suggestion.priority === 'urgent'
    ? 'var(--red)'
    : suggestion.priority === 'high'
    ? '#9b8be0'
    : 'var(--text-faint)'

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{suggestion.lead.full_name}</div>
          <Badge label={suggestion.lead.pipeline_stage} variant={stageVariant(suggestion.lead.pipeline_stage)} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{suggestion.lead.company_name}</div>
        <div style={{ fontSize: 12, color: priorityColor, lineHeight: 1.4 }}>{suggestion.reason}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>→ {suggestion.action}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
        <Link
          href={`/leads/${suggestion.lead.lead_id}`}
          style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}
        >
          Open lead →
        </Link>
        {suggestion.draft_available && (
          <Link
            href="/draft-queue"
            style={{ fontSize: 11, color: 'var(--accent)', whiteSpace: 'nowrap' }}
          >
            Draft ready →
          </Link>
        )}
      </div>
    </div>
  )
}

// ── Opportunity card ───────────────────────────────────────────────────────

function OppCard({ opp, lead }: { opp: Opportunity; lead?: Lead }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Main row */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{lead?.full_name ?? opp.lead_id}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
              {lead?.company_name}
              {opp.opportunity_type && (
                <span style={{ marginLeft: 8, color: 'var(--text-faint)', opacity: 0.7 }}>· {opp.opportunity_type}</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {Number(opp.confidence) > 0 && (
              <span style={{ fontSize: 11, color: Number(opp.confidence) >= 75 ? 'var(--green)' : Number(opp.confidence) >= 50 ? 'var(--yellow)' : 'var(--text-faint)' }}>
                {opp.confidence}%
              </span>
            )}
            <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
          </div>
        </div>

        {/* Why now — the intelligence core */}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 8 }}>
          {opp.why_now}
        </div>

        {opp.recommended_action && (
          <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 10 }}>
            → {opp.recommended_action}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link
            href={`/leads/${opp.lead_id}`}
            style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border)' }}
          >
            Open lead →
          </Link>
          <OppStatusButton oppId={opp.opportunity_id} status="Contacted" label="Mark contacted" />
          <OppStatusButton oppId={opp.opportunity_id} status="Snoozed" label="Snooze" />
        </div>
      </div>
    </div>
  )
}

// ── Risk card ──────────────────────────────────────────────────────────────

function RiskCard({ signal }: { signal: RiskSignal }) {
  const severityColor = signal.severity === 'critical'
    ? 'var(--red)'
    : signal.severity === 'high'
    ? 'var(--yellow)'
    : 'var(--text-faint)'

  const borderColor = signal.severity === 'critical'
    ? 'rgba(224,92,92,0.25)'
    : signal.severity === 'high'
    ? 'rgba(230,180,80,0.2)'
    : 'var(--border)'

  return (
    <Link href={`/leads/${signal.lead.lead_id}`}>
      <div className="hover-card" style={{ background: 'var(--surface)', border: `1px solid ${borderColor}`, borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{signal.lead.full_name}</div>
            <Badge label={signal.lead.pipeline_stage} variant={stageVariant(signal.lead.pipeline_stage)} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>
            {signal.lead.company_name}
          </div>
          <div style={{ fontSize: 12, color: severityColor, lineHeight: 1.4 }}>
            {signal.reason}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, paddingTop: 2 }}>
          {signal.severity}
        </div>
      </div>
    </Link>
  )
}

// ── Discovery card ─────────────────────────────────────────────────────────

function DiscoveryCard({ lead }: { lead: Lead }) {
  const ds = daysSince(lead.last_touch_date)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.full_name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
          {lead.company_name}
          {ds !== Infinity && (
            <span style={{ marginLeft: 8 }}>· Last touch {ds}d ago</span>
          )}
        </div>
        {lead.next_action && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {lead.next_action}
          </div>
        )}
      </div>
      <Link
        href={`/meeting-prep/${lead.lead_id}`}
        style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.25)', padding: '5px 12px', borderRadius: 5, flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        → Briefing
      </Link>
    </div>
  )
}

// ── Draft card ─────────────────────────────────────────────────────────────

function DraftCard({ insight, lead }: { insight: AIInsight; lead?: Lead }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{lead?.full_name ?? insight.lead_id}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{lead?.company_name}</div>
        </div>
        <Link
          href={`/leads/${insight.lead_id}`}
          style={{ fontSize: 11, color: 'var(--text-faint)' }}
        >
          Open →
        </Link>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 10 }}>
        {insight.why_now}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {insight.suggested_email && (
          <CopyButton text={insight.suggested_email} label="Copy email" />
        )}
        {insight.suggested_linkedin_dm && (
          <CopyButton text={insight.suggested_linkedin_dm} label="Copy DM" />
        )}
      </div>
    </div>
  )
}
