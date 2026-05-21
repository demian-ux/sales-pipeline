import {
  getLeadById,
  getCompanyById,
  getOpportunitiesForLead,
  getInteractionsForLead,
  getInsightsForLead,
  getResearchForLead,
} from '@/lib/sheets'
import { relativeDate, stageVariant, tempVariant, urgencyVariant, scoreColor } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import LeadActions from '@/components/leads/LeadActions'
import LeadEditForm from '@/components/leads/LeadEditForm'
import AddOpportunityForm from '@/components/leads/AddOpportunityForm'
import LinkedInPanel from '@/components/leads/LinkedInPanel'
import CopyButton from '@/components/ui/CopyButton'
import OppStatusButton from '@/components/today/OppStatusButton'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lead = await getLeadById(id)
  if (!lead) notFound()

  const [company, opportunities, interactions, insights, research] = await Promise.all([
    getCompanyById(lead.company_id),
    getOpportunitiesForLead(id, lead.company_id),
    getInteractionsForLead(id),
    getInsightsForLead(id),
    getResearchForLead(id),
  ])

  const latestInsight = [...insights].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  const openOpps = opportunities.filter((o) => o.status === 'Open' || o.status === 'In Progress')
  const closedOpps = opportunities.filter((o) => o.status !== 'Open' && o.status !== 'In Progress')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      {/* Back */}
      <Link href="/relationships" style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 16 }}>
        ← Relationships
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>{lead.full_name}</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {lead.title}{lead.title && lead.company_name ? ' · ' : ''}{lead.company_name}
            {lead.location && <span style={{ color: 'var(--text-faint)' }}> · {lead.location}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Badge label={lead.pipeline_stage} variant={stageVariant(lead.pipeline_stage)} />
            {lead.relationship_temperature && (
              <Badge label={lead.relationship_temperature} variant={tempVariant(lead.relationship_temperature)} />
            )}
            {openOpps.length > 0 && <Badge label={`${openOpps.length} open opp`} variant="accent" />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <Link
            href={`/meeting-prep/${lead.lead_id}`}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(200,169,110,0.25)', fontWeight: 500 }}
          >
            Prep for call →
          </Link>
          {lead.linkedin_url && (
            <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
              LinkedIn ↗
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`}
              style={{ fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
              Email ↗
            </a>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Latest AI Insight */}
          {latestInsight ? (
            <Section title="AI Analysis">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  Generated {relativeDate(latestInsight.created_at)}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Badge
                    label={`${latestInsight.confidence}%`}
                    variant={latestInsight.confidence >= 80 ? 'green' : latestInsight.confidence >= 60 ? 'yellow' : 'muted'}
                  />
                  <Badge
                    label={latestInsight.intent_level}
                    variant={latestInsight.intent_level === 'high' ? 'green' : latestInsight.intent_level === 'medium' ? 'yellow' : 'muted'}
                  />
                </div>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>{latestInsight.summary}</div>

              <WhyNowBlock text={latestInsight.why_now} />

              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)' }}>
                → {latestInsight.recommended_next_action}
              </div>

              {latestInsight.suggested_email && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Suggested email</div>
                    <CopyButton text={latestInsight.suggested_email} label="Copy email" />
                  </div>
                  <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                    {latestInsight.suggested_email}
                  </pre>
                </div>
              )}

              {latestInsight.suggested_linkedin_dm && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LinkedIn DM</div>
                    <CopyButton text={latestInsight.suggested_linkedin_dm} label="Copy DM" />
                  </div>
                  <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                    {latestInsight.suggested_linkedin_dm}
                  </pre>
                </div>
              )}

              {latestInsight.discovery_questions.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Discovery questions</div>
                  <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {latestInsight.discovery_questions.map((q, i) => (
                      <li key={i} style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          ) : (
            <Section title="AI Analysis">
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>
                No analysis yet. Add research findings and run analysis to get why-now signals, a suggested email, and discovery questions.
              </div>
            </Section>
          )}

          {/* Opportunities */}
          <Section title={`Opportunities${opportunities.length > 0 ? ` · ${opportunities.length}` : ''}`}>
            {opportunities.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>No opportunities yet.</div>
            )}
            {openOpps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: closedOpps.length > 0 ? 12 : 0 }}>
                {openOpps.map((opp) => (
                  <div key={opp.opportunity_id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{opp.opportunity_type}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {Number(opp.confidence) > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{opp.confidence}%</span>
                        )}
                        <Badge label={opp.urgency} variant={urgencyVariant(opp.urgency)} />
                      </div>
                    </div>
                    {opp.summary && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{opp.summary}</div>
                    )}
                    <WhyNowBlock text={opp.why_now} />
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent)' }}>→ {opp.recommended_action}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <OppStatusButton oppId={opp.opportunity_id} status="Contacted" label="Mark contacted" />
                      <OppStatusButton oppId={opp.opportunity_id} status="Snoozed" label="Snooze" />
                      <OppStatusButton oppId={opp.opportunity_id} status="Dismissed" label="Dismiss" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {closedOpps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Closed</div>
                {closedOpps.map((opp) => (
                  <div key={opp.opportunity_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 5, opacity: 0.6 }}>
                    <span style={{ fontSize: 12 }}>{opp.opportunity_type} — {opp.summary}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{opp.status}</span>
                  </div>
                ))}
              </div>
            )}
            <AddOpportunityForm leadId={lead.lead_id} companyId={lead.company_id} />
          </Section>

          {/* Research Findings */}
          <Section title="Research Findings">
            {research.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>No research yet.</div>
            )}
            {research.map((f) => (
              <div key={f.finding_id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>{f.source_type}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {f.source_url && (
                      <a href={f.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        Source ↗
                      </a>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeDate(f.created_at)}</span>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6 }}>{f.research_summary}</div>
                {f.signals_detected && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>Signals: {f.signals_detected}</div>
                )}
                {(f.design_observations || f.visual_identity_notes || f.market_positioning) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
                    {f.design_observations && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--text-faint)' }}>Design: </span>{f.design_observations}
                      </div>
                    )}
                    {f.visual_identity_notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--text-faint)' }}>Identity: </span>{f.visual_identity_notes}
                      </div>
                    )}
                    {f.market_positioning && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        <span style={{ color: 'var(--text-faint)' }}>Positioning: </span>{f.market_positioning}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Research input form */}
            <LeadActions leadId={lead.lead_id} companyId={lead.company_id} tab="research" />
          </Section>

          {/* Interaction History */}
          <Section title="Interaction History">
            {interactions.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>No interactions logged.</div>
            )}
            {[...interactions]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((i) => (
                <div key={i.interaction_id} style={{ display: 'flex', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', paddingTop: 2 }}>
                    {i.sent_at ? new Date(i.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <Badge label={i.channel} variant="default" />
                      <Badge label={i.direction} variant={i.direction === 'Inbound' ? 'green' : 'muted'} />
                    </div>
                    {i.subject && <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{i.subject}</div>}
                    {i.body_summary && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{i.body_summary}</div>}
                  </div>
                </div>
              ))}
            <LeadActions leadId={lead.lead_id} companyId={lead.company_id} tab="log" />
          </Section>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Analyze button */}
          <LeadActions leadId={lead.lead_id} companyId={lead.company_id} tab="analyze" />

          <LinkedInPanel lead={lead} company={company} interactions={interactions} />

          {/* Edit lead */}
          <LeadEditForm lead={lead} />

          {/* Scores */}
          <Section title="Scores">
            {[
              { label: 'Business fit', value: lead.business_fit_score },
              { label: 'Taste', value: lead.taste_score },
              { label: 'Relationship', value: lead.relationship_score },
              { label: 'Opportunity', value: lead.opportunity_score },
              { label: 'Priority', value: lead.priority_score },
            ].map((s) => s.value !== undefined ? (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: scoreColor(s.value) }}>{s.value}/10</span>
              </div>
            ) : null)}
          </Section>

          {/* Next Action */}
          {lead.next_action && (
            <Section title="Next Action">
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{lead.next_action}</div>
              {lead.next_followup_date && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                  Due {new Date(lead.next_followup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </Section>
          )}

          {/* Contact info */}
          <Section title="Contact">
            {lead.email && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{lead.email}</div>}
            {lead.linkedin_url && (
              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block' }}>
                LinkedIn ↗
              </a>
            )}
          </Section>

          {/* Company */}
          {company && (
            <Section title="Company">
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{company.company_name}</div>
              {company.project_type && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{company.project_type}</div>}
              {company.brand_positioning && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{company.brand_positioning}</div>}
              {company.design_quality_score && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Design quality</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: scoreColor(company.design_quality_score) }}>{company.design_quality_score}/10</span>
                </div>
              )}
            </Section>
          )}

          {/* Notes */}
          {lead.notes && (
            <Section title="Notes">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{lead.notes}</div>
            </Section>
          )}

          {/* Pain points */}
          {lead.known_pain_points && (
            <Section title="Known Pain Points">
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{lead.known_pain_points}</div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function WhyNowBlock({ text }: { text: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', borderLeft: '2px solid var(--accent)', padding: '8px 12px', borderRadius: '0 4px 4px 0' }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Why now</div>
      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
