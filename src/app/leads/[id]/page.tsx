import {
  getLeadById,
  getCompanyById,
  getOpportunitiesForLead,
  getInteractionsForLead,
  getInsightsForLead,
} from '@/lib/sheets'
import { getEmailDraftForLead, getLinkedInDraftForLead } from '@/lib/drafts'
import { relativeDate, stageVariant, tempVariant, urgencyVariant, scoreColor } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import LeadActions from '@/components/leads/LeadActions'
import LeadEditForm from '@/components/leads/LeadEditForm'
import AttachOpportunityDropdown from '@/components/leads/AttachOpportunityDropdown'
import DraftButton from '@/components/leads/DraftButton'
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

  const [company, opportunities, interactions, insights, emailDraft, linkedinDraft] = await Promise.all([
    getCompanyById(lead.company_id),
    getOpportunitiesForLead(id, lead.company_id),
    getInteractionsForLead(id),
    getInsightsForLead(id),
    getEmailDraftForLead(id),
    getLinkedInDraftForLead(id),
  ])

  const latestInsight = [...insights].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]

  // Drafts take precedence over legacy insight.suggested_email / suggested_linkedin_dm
  const emailContent = emailDraft?.content ?? latestInsight?.suggested_email ?? null
  const linkedinContent = linkedinDraft?.content ?? latestInsight?.suggested_linkedin_dm ?? null

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
            <a
              href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}`}
              target="oaki-gmail-compose"
              rel="noopener noreferrer"
              title="Opens Gmail compose. Subsequent Email clicks reuse the same tab."
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
          <Section title="AI Analysis">
            {latestInsight ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    Generated {relativeDate(latestInsight.created_at)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge
                      label={`${latestInsight.confidence}%`}
                      variant={latestInsight.confidence >= 80 ? 'green' : latestInsight.confidence >= 60 ? 'yellow' : 'muted'}
                    />
                    <Badge
                      label={latestInsight.intent_level}
                      variant={latestInsight.intent_level === 'high' ? 'green' : latestInsight.intent_level === 'medium' ? 'yellow' : 'muted'}
                    />
                    <DraftButton leadId={lead.lead_id} kind="email"    hasInsight={true} hasExistingDraft={!!emailContent} />
                    <DraftButton leadId={lead.lead_id} kind="linkedin" hasInsight={true} hasExistingDraft={!!linkedinContent} />
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>{latestInsight.summary}</div>

                <WhyNowBlock text={latestInsight.why_now} />

                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent)' }}>
                  → {latestInsight.recommended_next_action}
                </div>

                {emailContent && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Email draft
                        {emailDraft && <span style={{ marginLeft: 6, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>· {relativeDate(emailDraft.updated_at)}</span>}
                      </div>
                      <CopyButton text={emailContent} label="Copy email" />
                    </div>
                    <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                      {emailContent}
                    </pre>
                  </div>
                )}

                {linkedinContent && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        LinkedIn DM
                        {linkedinDraft && <span style={{ marginLeft: 6, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>· {relativeDate(linkedinDraft.updated_at)}</span>}
                      </div>
                      <CopyButton text={linkedinContent} label="Copy DM" />
                    </div>
                    <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                      {linkedinContent}
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
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>
                  No analysis yet. Run &quot;Analyze — why now?&quot; in the sidebar to generate the strategic assessment, then use the draft buttons here to generate outreach copy.
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <DraftButton leadId={lead.lead_id} kind="email"    hasInsight={false} hasExistingDraft={!!emailContent} />
                  <DraftButton leadId={lead.lead_id} kind="linkedin" hasInsight={false} hasExistingDraft={!!linkedinContent} />
                </div>
                {emailContent && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email draft</div>
                      <CopyButton text={emailContent} label="Copy email" />
                    </div>
                    <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                      {emailContent}
                    </pre>
                  </div>
                )}
                {linkedinContent && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>LinkedIn DM</div>
                      <CopyButton text={linkedinContent} label="Copy DM" />
                    </div>
                    <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                      {linkedinContent}
                    </pre>
                  </div>
                )}
              </>
            )}
          </Section>

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
            <AttachOpportunityDropdown
              currentLeadId={lead.lead_id}
              currentLeadName={lead.full_name}
              excludeOppIds={opportunities.map((o) => o.opportunity_id)}
            />
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
