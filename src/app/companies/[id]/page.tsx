'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import type { Company, Lead, ResearchFinding, StakeholderPrioritizationOutput, StakeholderRanking } from '@/lib/types'

// ── Role classification ────────────────────────────────────────────────────

const STRONG_ROLES = [
  'founder', 'principal', 'partner', 'creative director', 'design director',
  'marketing director', 'development director', 'visualization lead',
  'managing director', 'managing partner', 'director', 'vp', 'head of',
  'chief', 'co-founder', 'owner',
]

const WEAK_ROLES = [
  'hr', 'human resources', 'it ', 'information technology', 'admin',
  'procurement', 'receptionist', 'coordinator', 'assistant', 'intern',
  'junior', 'analyst', 'accountant', 'finance', 'legal', 'operations',
]

type RoleQuality = 'strong' | 'weak' | 'unknown'

function classifyRole(title?: string): RoleQuality {
  if (!title) return 'unknown'
  const t = title.toLowerCase()
  if (STRONG_ROLES.some((r) => t.includes(r))) return 'strong'
  if (WEAK_ROLES.some((r) => t.includes(r))) return 'weak'
  return 'unknown'
}

const ROLE_COLORS: Record<RoleQuality, { text: string; bg: string; border: string; label: string }> = {
  strong:  { text: 'var(--green)',      bg: 'rgba(80,180,120,0.07)',  border: 'rgba(80,180,120,0.25)',  label: 'Decision maker' },
  weak:    { text: 'var(--text-faint)', bg: 'var(--surface)',         border: 'var(--border)',           label: 'Weak contact' },
  unknown: { text: 'var(--text-muted)', bg: 'var(--surface)',         border: 'var(--border)',           label: '' },
}

// ── Relative date ──────────────────────────────────────────────────────────

function relDate(dateStr?: string): string {
  if (!dateStr) return 'Never'
  const diffDays = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

// ── Page component (client, fetches own data) ─────────────────────────────

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [company, setCompany] = useState<Company | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [findings, setFindings] = useState<ResearchFinding[]>([])
  const [prioritization, setPrioritization] = useState<StakeholderPrioritizationOutput | null>(null)
  const [prioritizing, setPrioritizing] = useState(false)
  const [prioritizeError, setPrioritizeError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'stakeholders' | 'research' | 'info'>('stakeholders')

  useEffect(() => {
    async function load() {
      try {
        const [leadsRes, companiesRes, findingsRes] = await Promise.all([
          fetch('/api/leads'),
          fetch(`/api/companies/${id}`),
          fetch('/api/research'),
        ])
        const [leadsData, companyData, findingsData] = await Promise.all([
          leadsRes.json(),
          companiesRes.json(),
          findingsRes.json(),
        ])
        setCompany(companyData.company ?? null)
        setLeads((leadsData.leads ?? []).filter((l: Lead) => l.company_id === id && l.lead_status !== 'Archived'))
        setFindings((findingsData.findings ?? []).filter((f: ResearchFinding) => f.company_id === id))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const handlePrioritize = async () => {
    setPrioritizing(true)
    setPrioritizeError(null)
    try {
      const res = await fetch('/api/ai/prioritize-stakeholders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: id }),
      })
      const data = await res.json()
      if (!res.ok) { setPrioritizeError(data.error ?? 'Prioritization failed'); return }
      setPrioritization(data.prioritization)
    } finally {
      setPrioritizing(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '28px 32px', fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
    )
  }

  if (!company) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Company not found.</div>
        <Link href="/relationships" style={{ fontSize: 12, color: 'var(--accent)', marginTop: 12, display: 'block' }}>← Back to relationships</Link>
      </div>
    )
  }

  const strongLeads = leads.filter((l) => classifyRole(l.title) === 'strong')
  const unknownLeads = leads.filter((l) => classifyRole(l.title) === 'unknown')
  const weakLeads = leads.filter((l) => classifyRole(l.title) === 'weak')

  const rankMap: Record<string, StakeholderRanking> = {}
  if (prioritization) {
    for (const r of prioritization.ranking) rankMap[r.lead_id] = r
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      {/* Back */}
      <Link href="/relationships" style={{ fontSize: 11, color: 'var(--text-faint)', display: 'inline-block', marginBottom: 16 }}>← Relationships</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>{company.company_name}</h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {company.industry && <Meta label={company.industry} />}
            {company.location && <Meta label={company.location} />}
            {company.company_size && <Meta label={`${company.company_size} employees`} />}
            {company.website && (
              <a href={company.website.startsWith('http') ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>
                {company.website} ↗
              </a>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {company.linkedin_company_url && (
            <a href={company.linkedin_company_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(200,169,110,0.08)', border: '1px solid rgba(200,169,110,0.25)', padding: '5px 12px', borderRadius: 5 }}>
              LinkedIn →
            </a>
          )}
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto) 1fr', gap: 10, marginBottom: 28 }}>
        <StatChip label="Contacts" value={leads.length} color="var(--text)" />
        <StatChip label="Decision makers" value={strongLeads.length} color="var(--green)" />
        <StatChip label="Research findings" value={findings.length} color="var(--yellow)" />
        {company.design_quality_score && <StatChip label="Design quality" value={`${company.design_quality_score}/10`} color="var(--accent)" />}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {([['stakeholders', 'Stakeholder Map'], ['research', 'Research'], ['info', 'Company Info']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? 'var(--text)' : 'var(--text-muted)', background: 'none', border: 'none', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Stakeholders tab ── */}
      {tab === 'stakeholders' && (
        <div>
          {/* Claude prioritization */}
          {leads.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              {!prioritization ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={handlePrioritize}
                    disabled={prioritizing}
                    style={{ padding: '8px 16px', fontSize: 12, fontWeight: 500, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text)' }}
                  >
                    {prioritizing ? '✦ Prioritizing…' : '✦ Prioritize with Claude'}
                  </button>
                  {prioritizeError && <span style={{ fontSize: 11, color: 'var(--red)' }}>{prioritizeError}</span>}
                </div>
              ) : (
                <div style={{ background: 'rgba(200,169,110,0.06)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>✦ Claude&apos;s recommendation</div>
                  <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55, margin: '0 0 12px' }}>{prioritization.recommended_approach}</p>
                  {prioritization.best_contact_id && leads.find((l) => l.lead_id === prioritization.best_contact_id) && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Best contact:{' '}
                      <Link href={`/leads/${prioritization.best_contact_id}`} style={{ color: 'var(--accent)' }}>
                        {leads.find((l) => l.lead_id === prioritization.best_contact_id)?.full_name}
                      </Link>
                    </div>
                  )}
                  <button onClick={() => setPrioritization(null)} style={{ fontSize: 10, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>
                    Re-run
                  </button>
                </div>
              )}
            </div>
          )}

          {leads.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              No contacts found at this company.{' '}
              <Link href="/import/apollo" style={{ color: 'var(--accent)' }}>Import from Apollo →</Link>
            </div>
          )}

          {/* Strong contacts */}
          {strongLeads.length > 0 && (
            <LeadGroup title="Decision makers" color={ROLE_COLORS.strong.text} leads={strongLeads} rankMap={rankMap} />
          )}
          {unknownLeads.length > 0 && (
            <LeadGroup title="Other contacts" color={ROLE_COLORS.unknown.text} leads={unknownLeads} rankMap={rankMap} />
          )}
          {weakLeads.length > 0 && (
            <LeadGroup title="Weak contacts" color={ROLE_COLORS.weak.text} leads={weakLeads} rankMap={rankMap} />
          )}
        </div>
      )}

      {/* ── Research tab ── */}
      {tab === 'research' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <Link href={`/research?company=${id}`} style={{ fontSize: 11, color: 'var(--accent)' }}>+ Add research</Link>
          </div>
          {findings.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              No research findings yet.{' '}
              <Link href="/research" style={{ color: 'var(--accent)' }}>Add research →</Link>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {findings.map((f) => (
              <div key={f.finding_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.source_type}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{relDate(f.created_at)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, margin: '0 0 8px' }}>{f.research_summary}</p>
                {f.design_observations && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}><strong>Design:</strong> {f.design_observations}</div>
                )}
                {f.market_positioning && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}><strong>Market:</strong> {f.market_positioning}</div>
                )}
                {f.signals_detected && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>{f.signals_detected}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Info tab ── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {[
            ['Industry', company.industry],
            ['Location', company.location],
            ['Size', company.company_size],
            ['Project type', company.project_type],
            ['Market position', company.market_position],
            ['Project scale', company.project_scale],
            ['Architectural style', company.architectural_style],
            ['Brand positioning', company.brand_positioning],
            ['Known projects', company.known_projects],
            ['Fit reason', company.fit_reason],
          ].filter(([, v]) => v).map(([label, value]) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{value}</div>
            </div>
          ))}
          {company.notes && (
            <div style={{ gridColumn: '1 / -1', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{company.notes}</div>
            </div>
          )}
          {company.design_quality_score !== undefined && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Design quality</div>
              <ScoreBar score={Number(company.design_quality_score)} />
            </div>
          )}
          {company.visual_identity_score !== undefined && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Visual identity</div>
              <ScoreBar score={Number(company.visual_identity_score)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared components ──────────────────────────────────────────────────────

function Meta({ label }: { label: string }) {
  return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{label}</span>
}

function StatChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 14px' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function LeadGroup({
  title, color, leads, rankMap,
}: {
  title: string
  color: string
  leads: Lead[]
  rankMap: Record<string, StakeholderRanking>
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color, margin: '0 0 10px' }}>
        {title} <span style={{ opacity: 0.6, fontWeight: 400 }}>{leads.length}</span>
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
        {leads.map((lead) => {
          const rank = rankMap[lead.lead_id]
          return (
            <Link key={lead.lead_id} href={`/leads/${lead.lead_id}`}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{lead.full_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{lead.title || '—'}</div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{lead.pipeline_stage}</span>
                </div>

                {lead.email && (
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</div>
                )}

                {lead.last_touch_date && (
                  <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>Last touch: {relDate(lead.last_touch_date)}</div>
                )}

                {rank && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 6 }}>{rank.reason}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                      {[
                        ['Influence', rank.stakeholder_influence_score],
                        ['Creative', rank.creative_alignment_score],
                        ['Probability', rank.relationship_probability_score],
                      ].map(([label, score]) => (
                        <div key={label as string}>
                          <div style={{ fontSize: 9, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                          <ScoreBar score={Number(score)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 7 ? 'var(--green)' : score >= 4 ? 'var(--yellow)' : 'var(--text-faint)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${score * 10}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 9, color, minWidth: 14, textAlign: 'right', fontWeight: 600 }}>{score}</span>
    </div>
  )
}
