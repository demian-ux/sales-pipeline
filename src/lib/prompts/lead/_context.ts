// Shared lead-context builder used by every lead-scoped Claude prompt
// (analyze-why-now, prepare-meeting-prep, recommend-linkedin-strategy).
// Pure function of inputs — no I/O, safe to call anywhere.

import type {
  Lead,
  Company,
  Campaign,
  ResearchFinding,
  Interaction,
  Opportunity,
} from '@/lib/types'

function daysSince(dateStr?: string): string {
  if (!dateStr) return 'unknown'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

export function buildLeadContext(
  lead: Lead,
  company: Company | null,
  findings: ResearchFinding[],
  interactions: Interaction[],
  opportunities: Opportunity[],
  campaign?: Campaign | null,
): string {
  const parts: string[] = []

  parts.push(`## Lead: ${lead.full_name}`)
  parts.push(`Title: ${lead.title ?? 'Unknown'} at ${lead.company_name}`)
  if (lead.location) parts.push(`Location: ${lead.location}`)
  parts.push(`Pipeline stage: ${lead.pipeline_stage}`)
  if (lead.relationship_temperature) parts.push(`Relationship temperature: ${lead.relationship_temperature}`)
  parts.push(`Last touch: ${daysSince(lead.last_touch_date)}`)
  if (lead.last_meaningful_touch) parts.push(`Last meaningful touch: ${daysSince(lead.last_meaningful_touch)}`)
  if (lead.next_action) parts.push(`Planned next action: ${lead.next_action}`)
  if (lead.next_followup_date) parts.push(`Follow-up target: ${lead.next_followup_date}`)
  if (lead.known_pain_points) parts.push(`Known pain points: ${lead.known_pain_points}`)
  if (lead.preferred_communication_style) parts.push(`Communication style: ${lead.preferred_communication_style}`)
  if (lead.notes) parts.push(`Notes: ${lead.notes}`)

  const scores: string[] = []
  if (lead.business_fit_score) scores.push(`Business fit ${lead.business_fit_score}/10`)
  if (lead.taste_score) scores.push(`Taste alignment ${lead.taste_score}/10`)
  if (lead.relationship_score) scores.push(`Relationship depth ${lead.relationship_score}/10`)
  if (lead.opportunity_score) scores.push(`Opportunity strength ${lead.opportunity_score}/10`)
  if (lead.priority_score) scores.push(`Strategic priority ${lead.priority_score}/10`)
  if (scores.length > 0) parts.push(`Scores: ${scores.join(' · ')}`)

  if (company) {
    parts.push(`\n## Company: ${company.company_name}`)
    if (company.industry) parts.push(`Industry: ${company.industry}`)
    if (company.location) parts.push(`Location: ${company.location}`)
    if (company.project_type) parts.push(`Project types: ${company.project_type}`)
    if (company.design_quality_score) parts.push(`Design quality: ${company.design_quality_score}/10`)
    if (company.visual_identity_score) parts.push(`Visual identity: ${company.visual_identity_score}/10`)
    if (company.brand_positioning) parts.push(`Positioning: ${company.brand_positioning}`)
    if (company.architectural_style) parts.push(`Architectural style: ${company.architectural_style}`)
    if (company.market_position) parts.push(`Market position: ${company.market_position}`)
    if (company.fit_reason) parts.push(`Why they fit Oaki: ${company.fit_reason}`)
    if (company.known_projects) parts.push(`Known projects: ${company.known_projects}`)
    if (company.notes) parts.push(`Company notes: ${company.notes}`)
  }

  if (campaign) {
    parts.push(`\n## Campaign context`)
    parts.push(`Campaign: ${campaign.name} — ${campaign.description}`)
    if (campaign.target_segment) parts.push(`Target segment: ${campaign.target_segment}`)
    if (campaign.pain_point) parts.push(`Pain point focus: ${campaign.pain_point}`)
    if (campaign.offer) parts.push(`Offer/angle: ${campaign.offer}`)
    parts.push(`CTA: ${campaign.cta}`)
  }

  if (findings.length > 0) {
    parts.push(`\n## Research findings (${findings.length})`)
    findings.forEach((f) => {
      parts.push(`- [${f.source_type}${f.source_url ? ` · ${f.source_url}` : ''}] ${f.research_summary}`)
      if (f.design_observations) parts.push(`  Design: ${f.design_observations}`)
      if (f.market_positioning) parts.push(`  Market: ${f.market_positioning}`)
      if (f.signals_detected) parts.push(`  Signals: ${f.signals_detected}`)
    })
  }

  if (interactions.length > 0) {
    parts.push(`\n## Interaction history (${interactions.length} total)`)
    interactions.slice(-6).forEach((i) => {
      const date = i.sent_at?.substring(0, 10) ?? 'Unknown date'
      parts.push(`- ${date} | ${i.channel} ${i.direction}: ${i.subject ?? 'No subject'}`)
      if (i.body_summary) parts.push(`  "${i.body_summary}"`)
    })
  }

  if (opportunities.length > 0) {
    parts.push(`\n## Known opportunities`)
    opportunities.forEach((o) => {
      parts.push(`- [${o.opportunity_type}] ${o.summary}`)
      parts.push(`  Why now: ${o.why_now}`)
      parts.push(`  Status: ${o.status} · Urgency: ${o.urgency} · Confidence: ${o.confidence}%`)
    })
  }

  return parts.join('\n')
}
