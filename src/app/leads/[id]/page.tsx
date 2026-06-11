import {
  getLeadById,
  getCompanyById,
  getOpportunitiesForLead,
  getInteractionsForLead,
  getInsightsForLead,
  getCampaigns,
} from '@/lib/sheets'
import { getEmailDraftForLead, getLinkedInDraftForLead, getLetterDraftForLead } from '@/lib/drafts'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Avatar, StageBadge, TempBadge, StatusBadge, Pill, ScoreBlock, Score10, Empty,
} from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import LeadAnalysisCard from '@/components/leads/LeadAnalysisCard'
import LeadActions from '@/components/leads/LeadActions'
import LeadEditForm from '@/components/leads/LeadEditForm'
import AttachOpportunityDropdown from '@/components/leads/AttachOpportunityDropdown'
import LinkedInPanel from '@/components/leads/LinkedInPanel'
import OppStatusButton from '@/components/today/OppStatusButton'
import type { LeadStatus } from '@/lib/types'

export const dynamic = 'force-dynamic'

const LEAD_STATUS_TONE: Record<LeadStatus, 'ok' | 'warn' | 'info'> = {
  Active: 'ok',
  Inactive: 'warn',
  Archived: 'info',
}

function shortDate(d?: string): string {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime())
    ? '—'
    : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) notFound()

  const [company, opportunities, interactions, insights, emailDraft, linkedinDraft, letterDraft, campaigns] =
    await Promise.all([
      getCompanyById(lead.company_id),
      getOpportunitiesForLead(id, lead.company_id),
      getInteractionsForLead(id),
      getInsightsForLead(id),
      getEmailDraftForLead(id),
      getLinkedInDraftForLead(id),
      getLetterDraftForLead(id),
      getCampaigns(),
    ])

  // Drafts written by external agents via POST /api/leads/{id}/drafts.
  // Must never break the page when Supabase is down or the table is missing.
  interface LeadDraft {
    id: string
    channel: string
    subject?: string | null
    body: string
    status: string
    created_by?: string | null
    created_at: string
  }
  let agentDrafts: LeadDraft[] = []
  if (isSupabaseAdminConfigured()) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('lead_drafts')
        .select('id, channel, subject, body, status, created_by, created_at')
        .eq('lead_id', id)
        .order('created_at', { ascending: false })
      agentDrafts = data ?? []
    } catch (err) {
      console.warn(`[lead/${id}] lead_drafts fetch failed:`, err)
    }
  }

  const latestInsight = [...insights].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0] ?? null

  const emailContent = emailDraft?.content ?? latestInsight?.suggested_email ?? null
  const linkedinContent = linkedinDraft?.content ?? latestInsight?.suggested_linkedin_dm ?? null

  const openOpps = opportunities.filter((o) => o.status === 'Open' || o.status === 'In Progress')
  const closedOpps = opportunities.filter((o) => o.status !== 'Open' && o.status !== 'In Progress')

  const campaign = lead.campaign_id
    ? campaigns.find((c) => c.campaign_id === lead.campaign_id)
    : undefined

  // sent_at desc (the date the touch happened), tiebreak created_at desc.
  // sent_at mixes YYYY-MM-DD and full ISO historically — Date() parses both.
  const sortKey = (i: { sent_at?: string; created_at: string }) =>
    new Date(i.sent_at || i.created_at).getTime() || 0
  const sortedInteractions = [...interactions].sort(
    (a, b) => sortKey(b) - sortKey(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  // Latest outbound send per channel — drives the sent-state on the draft tabs.
  const lastOutboundAt = (channel: 'Email' | 'LinkedIn') =>
    sortedInteractions.find((i) => i.channel === channel && i.direction === 'Outbound')
      ?.sent_at ?? undefined

  // Letters log as channel 'Other' with a "Physical letter" subject (see
  // the mark-sent route's channel map).
  const lastLetterSentAt = sortedInteractions.find(
    (i) =>
      i.channel === 'Other' &&
      i.direction === 'Outbound' &&
      (i.subject ?? '').toLowerCase().includes('letter'),
  )?.sent_at ?? undefined

  const scores: [string, number | undefined][] = [
    ['Priority', lead.priority_score],
    ['Business fit', lead.business_fit_score],
    ['Taste', lead.taste_score],
    ['Relationship', lead.relationship_score],
    ['Opportunity', lead.opportunity_score],
  ]

  return (
    <div className="page">
      <Link
        className="btn btn-xs btn-ghost"
        href="/relationships"
        style={{ marginBottom: 18, marginLeft: -8 }}
      >
        <Icon name="chevleft" size={11} /> Relationships
      </Link>

      {/* Header */}
      <div className="page-head" style={{ alignItems: 'flex-start' }}>
        <div className="col" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={lead.full_name} size={44} />
            <div className="col" style={{ gap: 3 }}>
              <div className="ink" style={{ fontSize: 22, fontWeight: 500, letterSpacing: '-0.015em' }}>
                {lead.full_name}
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {lead.title && <span className="ink-2" style={{ fontSize: 13 }}>{lead.title}</span>}
                {lead.title && <span className="ink-3">·</span>}
                <span className="ink-2" style={{ fontSize: 13 }}>{lead.company_name}</span>
                {lead.location && <span className="ink-3">·</span>}
                {lead.location && <span className="ink-3" style={{ fontSize: 12.5 }}>{lead.location}</span>}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <StageBadge stage={lead.pipeline_stage} />
            {lead.relationship_temperature && <TempBadge temp={lead.relationship_temperature} />}
            {campaign && <Pill tone="gold">{campaign.name}</Pill>}
            <StatusBadge tone={LEAD_STATUS_TONE[lead.lead_status] ?? 'info'}>
              {lead.lead_status}
            </StatusBadge>
          </div>
        </div>
        <div className="page-actions">
          {lead.linkedin_url && (
            <a className="btn" href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Icon name="linkedin" size={12} /> LinkedIn
            </a>
          )}
          {lead.email && (
            <a
              className="btn"
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}`}
              target="oaki-gmail-compose"
              rel="noopener noreferrer"
            >
              <Icon name="mail" size={12} /> Email
            </a>
          )}
          <Link className="btn btn-primary" href={`/meeting-prep/${lead.lead_id}`}>
            <Icon name="sparkle" size={12} /> Prep for call
          </Link>
        </div>
      </div>

      <div className="lead-grid">
        {/* Main column */}
        <div className="lead-main">
          <LeadAnalysisCard
            insight={latestInsight}
            leadId={lead.lead_id}
            leadEmail={lead.email ?? null}
            letterContent={letterDraft?.content ?? null}
            emailContent={emailContent}
            linkedinContent={linkedinContent}
            letterUpdatedAt={letterDraft?.updated_at}
            emailUpdatedAt={emailDraft?.updated_at}
            linkedinUpdatedAt={linkedinDraft?.updated_at}
            letterSentAt={lastLetterSentAt}
            emailSentAt={lastOutboundAt('Email')}
            linkedinSentAt={lastOutboundAt('LinkedIn')}
          />

          {/* Drafts stored on the lead (external agents via the drafts API) */}
          {agentDrafts.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div className="card-head-title">
                  <span className="card-head-name">Stored drafts</span>
                  <span className="card-head-count">{String(agentDrafts.length).padStart(2, '0')}</span>
                </div>
              </div>
              <div className="stack">
                {agentDrafts.map((d) => (
                  <div key={d.id} className="stack-row" style={{ alignItems: 'flex-start', padding: '14px 20px' }}>
                    <div className="col" style={{ width: 120, flexShrink: 0, gap: 4 }}>
                      <Pill>{d.channel.replace('_', ' ')}</Pill>
                      <StatusBadge tone={d.status === 'sent' ? 'ok' : d.status === 'approved' ? 'info' : 'warn'}>
                        {d.status}
                      </StatusBadge>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                        {shortDate(d.created_at)}
                      </span>
                    </div>
                    <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                      {d.subject && (
                        <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{d.subject}</span>
                      )}
                      <span className="ink-2" style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {d.body}
                      </span>
                      {d.created_by && (
                        <span className="micro" style={{ color: 'var(--ink-3)' }}>by {d.created_by}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opportunities */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-title">
                <span className="card-head-name">Opportunities</span>
                <span className="card-head-count">{String(openOpps.length).padStart(2, '0')} OPEN</span>
              </div>
            </div>
            <div className="stack">
              {opportunities.length === 0 && (
                <Empty title="No opportunities attached yet.">
                  Attach an open one if you know there&apos;s a fit, or wait for the next analysis to
                  surface one.
                </Empty>
              )}
              {openOpps.map((opp) => (
                <div key={opp.opportunity_id} className="stack-row" style={{ alignItems: 'flex-start', padding: '14px 20px' }}>
                  <div className="stack-row-main" style={{ gap: 6 }}>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>
                        {opp.opportunity_type}
                      </span>
                      <StatusBadge tone={opp.urgency === 'High' ? 'risk' : opp.urgency === 'Medium' ? 'warn' : 'info'}>
                        {opp.urgency} urgency
                      </StatusBadge>
                      {Number(opp.confidence) > 0 && (
                        <span className="ink-3" style={{ fontSize: 11 }}>{opp.confidence}% confidence</span>
                      )}
                    </div>
                    {opp.summary && (
                      <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.55, maxWidth: '60ch' }}>
                        {opp.summary}
                      </div>
                    )}
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      <OppStatusButton oppId={opp.opportunity_id} status="Contacted" label="Mark contacted" />
                      <OppStatusButton oppId={opp.opportunity_id} status="Snoozed" label="Snooze" />
                      <OppStatusButton oppId={opp.opportunity_id} status="Dismissed" label="Dismiss" />
                    </div>
                  </div>
                  <ScoreBlock value={Number(opp.confidence) || 0} size="sm" />
                </div>
              ))}
              {closedOpps.map((opp) => (
                <div key={opp.opportunity_id} className="stack-row" style={{ padding: '10px 20px', opacity: 0.6 }}>
                  <span className="ink-2 truncate" style={{ fontSize: 12 }}>
                    {opp.opportunity_type}{opp.summary ? ` — ${opp.summary}` : ''}
                  </span>
                  <Pill>{opp.status}</Pill>
                </div>
              ))}
            </div>
            <div style={{ padding: '4px 20px 16px' }}>
              <AttachOpportunityDropdown
                currentLeadId={lead.lead_id}
                currentLeadName={lead.full_name}
                excludeOppIds={opportunities.map((o) => o.opportunity_id)}
              />
            </div>
          </div>

          {/* Interaction history */}
          <div className="card">
            <div className="card-head">
              <div className="card-head-title">
                <span className="card-head-name">Interaction history</span>
                <span className="card-head-count">{String(interactions.length).padStart(2, '0')} EVENTS</span>
              </div>
            </div>
            <div className="stack">
              {interactions.length === 0 && (
                <Empty title="No interactions logged.">Log a call, email, or meeting below.</Empty>
              )}
              {sortedInteractions.map((it) => (
                <div key={it.interaction_id} className="stack-row" style={{ alignItems: 'flex-start', padding: '14px 20px' }}>
                  <div className="col" style={{ width: 120, flexShrink: 0, gap: 4 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                      {shortDate(it.sent_at ?? it.created_at)}
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      <Pill>{it.channel}</Pill>
                      <span className="micro" style={{ color: it.direction === 'Inbound' ? 'var(--ok)' : 'var(--info)' }}>
                        {it.direction === 'Inbound' ? '↓ IN' : '↑ OUT'}
                      </span>
                    </div>
                  </div>
                  <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    {it.subject && (
                      <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{it.subject}</span>
                    )}
                    {it.body_summary && (
                      <span className="ink-2" style={{ fontSize: 12, lineHeight: 1.6 }}>{it.body_summary}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '4px 20px 16px' }}>
              <LeadActions leadId={lead.lead_id} companyId={lead.company_id} tab="log" />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lead-side">
          <LeadActions leadId={lead.lead_id} companyId={lead.company_id} tab="analyze" />

          {/* Scores */}
          <div className="card">
            <div className="card-head"><span className="card-head-name">Scores</span></div>
            <div className="col" style={{ padding: '12px 20px 16px', gap: 10 }}>
              {scores.map(([k, v]) =>
                v != null ? (
                  <div key={k} className="between">
                    <span className="ink-2" style={{ fontSize: 12 }}>{k}</span>
                    <Score10 value={v} />
                  </div>
                ) : null,
              )}
            </div>
          </div>

          {/* Next action */}
          {lead.next_action && (
            <div className="card card-pad">
              <div className="micro" style={{ marginBottom: 10 }}>Next action</div>
              <div className="col" style={{ gap: 8 }}>
                <span className="ink" style={{ fontSize: 13, lineHeight: 1.55 }}>{lead.next_action}</span>
                {lead.next_followup_date && (
                  <span className="micro" style={{ color: 'var(--ink-3)' }}>
                    Due {shortDate(lead.next_followup_date)}
                  </span>
                )}
              </div>
            </div>
          )}

          <LinkedInPanel lead={lead} company={company} interactions={interactions} />

          {/* Contact */}
          {(lead.email || lead.linkedin_url) && (
            <div className="card">
              <div className="card-head"><span className="card-head-name">Contact</span></div>
              <div className="col" style={{ padding: '12px 20px 16px', gap: 8, fontSize: 12 }}>
                {lead.email && (
                  <div className="row" style={{ gap: 8 }}>
                    <Icon name="mail" size={12} style={{ color: 'var(--ink-3)' }} />
                    <span className="ink-2 truncate">{lead.email}</span>
                  </div>
                )}
                {lead.linkedin_url && (
                  <div className="row" style={{ gap: 8 }}>
                    <Icon name="linkedin" size={12} style={{ color: 'var(--ink-3)' }} />
                    <a className="ink-2 truncate" href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">
                      {lead.linkedin_url.replace(/^https?:\/\/(www\.)?linkedin\.com/, '')}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Company */}
          {company && (
            <div className="card">
              <div className="card-head"><span className="card-head-name">Company</span></div>
              <div className="col" style={{ padding: '12px 20px 16px', gap: 8 }}>
                <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{company.company_name}</span>
                {(company.industry || company.project_type) && (
                  <span className="ink-2" style={{ fontSize: 12 }}>
                    {[company.industry, company.project_type].filter(Boolean).join(' · ')}
                  </span>
                )}
                {company.design_quality_score != null && (
                  <div className="between" style={{ marginTop: 4 }}>
                    <span className="ink-3" style={{ fontSize: 11.5 }}>Design quality</span>
                    <Score10 value={company.design_quality_score} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {(lead.notes || lead.known_pain_points) && (
            <div className="card">
              <div className="card-head"><span className="card-head-name">Notes</span></div>
              <div className="col" style={{ padding: '12px 20px 16px', gap: 8 }}>
                {lead.notes && (
                  <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.6 }}>{lead.notes}</div>
                )}
                {lead.known_pain_points && (
                  <>
                    <div className="micro" style={{ marginTop: 6 }}>Known pain points</div>
                    <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
                      {lead.known_pain_points}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <LeadEditForm lead={lead} />
        </div>
      </div>
    </div>
  )
}
