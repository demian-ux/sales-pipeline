import {
  getLeads,
  getOpportunities,
  getAIInsights,
  getInteractions,
  getResearchFindings,
} from '@/lib/sheets'
import StrategicMapClient from '@/components/strategic-map/StrategicMapClient'
import type { Lead, Opportunity, AIInsight, Interaction, ResearchFinding } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Health grouping ────────────────────────────────────────────────────────

export type HealthGroup = 'Strong' | 'Warm' | 'Cooling' | 'Dormant' | 'At Risk'

export interface LeadHealth {
  lead: Lead
  group: HealthGroup
  days_since_touch: number
  reason: string
}

function daysSince(dateStr?: string): number {
  if (!dateStr) return Infinity
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return Infinity
  return Math.floor((Date.now() - d.getTime()) / 86_400_000)
}

function classifyHealth(lead: Lead): LeadHealth {
  const ds = daysSince(lead.last_touch_date)
  const relScore = Number(lead.relationship_score) || 0
  const priScore = Number(lead.priority_score) || 0
  const stage = lead.pipeline_stage
  const temp = lead.relationship_temperature

  // At Risk — stalled proposal or neglected high-priority
  if (stage === 'Proposal Sent' && ds > 21) {
    return { lead, group: 'At Risk', days_since_touch: ds, reason: `Proposal stalled — ${ds}d no touch` }
  }
  if (priScore >= 7 && ds > 60 && stage !== 'Won' && stage !== 'Dormant') {
    return { lead, group: 'At Risk', days_since_touch: ds, reason: `High-priority — ${ds}d no touch` }
  }

  // Strong — past clients or very high relationship score with recent touch
  if (stage === 'Won' && ds < 90) {
    return { lead, group: 'Strong', days_since_touch: ds, reason: 'Past client, recent touch' }
  }
  if (relScore >= 8 && ds < 30) {
    return { lead, group: 'Strong', days_since_touch: ds, reason: `Rel. score ${relScore}/10, active` }
  }

  // Dormant
  if (stage === 'Dormant' || ds > 90) {
    return { lead, group: 'Dormant', days_since_touch: ds, reason: ds === Infinity ? 'Never touched' : `${ds}d no touch` }
  }

  // Cooling
  if (temp === 'Cool' || temp === 'Cold' || ds > 30) {
    return { lead, group: 'Cooling', days_since_touch: ds, reason: `${ds === Infinity ? 'Unknown' : ds + 'd'} since last touch` }
  }

  // Warm — default for active leads
  return { lead, group: 'Warm', days_since_touch: ds, reason: temp ? `${temp} temperature` : 'Active' }
}

// ── Discovery pipeline groups ──────────────────────────────────────────────

export type DiscoveryGroup = 'Candidates' | 'Scheduled' | 'In Discovery' | 'Needs Proposal' | 'Follow-up'

export interface DiscoveryLead {
  lead: Lead
  group: DiscoveryGroup
  days_since_touch: number
}

function classifyDiscovery(lead: Lead): DiscoveryGroup {
  const stage = lead.pipeline_stage
  const ds = daysSince(lead.last_touch_date)

  if (stage === 'Won' || stage === 'Lost' || stage === 'Dormant') return 'Candidates'
  if (stage === 'Replied' && ds < 14) return 'Scheduled'
  if (stage === 'Discovery') return 'In Discovery'
  if (stage === 'Proposal Sent' || stage === 'Negotiation') return 'Needs Proposal'
  if (stage === 'Contacted' && ds > 7) return 'Follow-up'
  return 'Candidates'
}

// ── Timeline event ─────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'interaction'
  | 'research'
  | 'opportunity'
  | 'insight'
  | 'stage_change'

export interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: string
  lead_id?: string
  lead_name?: string
  company_name?: string
  title: string
  body?: string
  meta?: string
}

function buildTimeline(
  interactions: Interaction[],
  findings: ResearchFinding[],
  opps: Opportunity[],
  insights: AIInsight[],
  leadMap: Map<string, Lead>
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const i of interactions) {
    const lead = leadMap.get(i.lead_id)
    events.push({
      id: i.interaction_id,
      type: 'interaction',
      date: i.sent_at || i.created_at,
      lead_id: i.lead_id,
      lead_name: lead?.full_name,
      company_name: lead?.company_name,
      title: i.subject || `${i.channel} ${i.direction.toLowerCase()}`,
      body: i.body_summary,
      meta: i.channel,
    })
  }

  for (const f of findings) {
    const lead = f.lead_id ? leadMap.get(f.lead_id) : undefined
    events.push({
      id: f.finding_id,
      type: 'research',
      date: f.created_at,
      lead_id: f.lead_id,
      lead_name: lead?.full_name,
      company_name: lead?.company_name || '',
      title: `Research: ${f.source_type}`,
      body: f.research_summary,
      meta: f.source_type,
    })
  }

  for (const o of opps) {
    const lead = o.lead_id ? leadMap.get(o.lead_id) : undefined
    events.push({
      id: o.opportunity_id,
      type: 'opportunity',
      date: o.created_at,
      lead_id: o.lead_id,
      lead_name: lead?.full_name,
      company_name: lead?.company_name,
      title: `Opportunity: ${o.opportunity_type}`,
      body: o.why_now,
      meta: o.urgency,
    })
  }

  for (const ins of insights) {
    const lead = leadMap.get(ins.lead_id)
    events.push({
      id: ins.insight_id,
      type: 'insight',
      date: ins.created_at,
      lead_id: ins.lead_id,
      lead_name: lead?.full_name,
      company_name: lead?.company_name,
      title: 'AI Insight generated',
      body: ins.why_now,
      meta: ins.intent_level,
    })
  }

  return events
    .filter((e) => !!e.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function StrategicMapPage() {
  const [leads, opps, insights, interactions, findings] = await Promise.all([
    getLeads(),
    getOpportunities(),
    getAIInsights(),
    getInteractions(),
    getResearchFindings(),
  ])

  const leadMap = new Map(leads.map((l) => [l.lead_id, l])  )

  // Health groups
  const healthLeads: LeadHealth[] = leads
    .filter((l) => l.lead_status !== 'Archived')
    .map(classifyHealth)

  const healthGroups: Record<HealthGroup, LeadHealth[]> = {
    Strong: [], Warm: [], Cooling: [], Dormant: [], 'At Risk': [],
  }
  for (const lh of healthLeads) healthGroups[lh.group].push(lh)

  // Discovery pipeline
  const discoveryLeads: DiscoveryLead[] = leads
    .filter((l) => !['Won', 'Lost', 'Dormant', 'Archived'].includes(l.pipeline_stage) || l.pipeline_stage === 'Replied')
    .map((l) => ({ lead: l, group: classifyDiscovery(l), days_since_touch: daysSince(l.last_touch_date) }))

  const discoveryGroups: Record<DiscoveryGroup, DiscoveryLead[]> = {
    Candidates: [], Scheduled: [], 'In Discovery': [], 'Needs Proposal': [], 'Follow-up': [],
  }
  for (const dl of discoveryLeads) discoveryGroups[dl.group].push(dl)

  // Opportunity board (open only, grouped by urgency)
  const openOpps = opps.filter((o) => o.status === 'Open' || o.status === 'In Progress')

  // Timeline
  const timeline = buildTimeline(interactions, findings, opps, insights, leadMap)

  return (
    <StrategicMapClient
      leads={leads}
      leadMap={Object.fromEntries(leadMap)}
      openOpps={openOpps}
      allOpps={opps}
      healthGroups={healthGroups}
      discoveryGroups={discoveryGroups}
      timeline={timeline}
    />
  )
}
