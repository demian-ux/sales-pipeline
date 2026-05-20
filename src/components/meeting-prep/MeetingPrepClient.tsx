'use client'

import { useState } from 'react'
import type { Company, ResearchFinding, Interaction, MeetingPrepOutput } from '@/lib/types'

interface Props {
  leadId: string
  leadName: string
  existingPrep: MeetingPrepOutput | null
  knownPainPoints?: string
  nextAction?: string
  notes?: string
  company?: Company
  research: ResearchFinding[]
  interactions: Interaction[]
}

export default function MeetingPrepClient({ leadId, existingPrep, knownPainPoints, nextAction, notes }: Props) {
  const [prep, setPrep] = useState<MeetingPrepOutput | null>(existingPrep)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setPrep(data.prep)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  if (!prep) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Context that exists even without a generated brief */}
        {(knownPainPoints || nextAction || notes) && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
            <SectionTitle>What we already know</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nextAction && <ContextBlock label="Next action" text={nextAction} />}
              {knownPainPoints && <ContextBlock label="Known pain points" text={knownPainPoints} />}
              {notes && <ContextBlock label="Notes" text={notes} />}
            </div>
          </div>
        )}

        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '32px 24px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
            No briefing generated yet.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            Claude will analyze everything known about this lead — research, interactions, company context — and produce a full call brief.
          </div>
          <GenerateButton loading={loading} onClick={generate} />
          {error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Regenerate bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Briefing generated — review before your call.</div>
        <GenerateButton loading={loading} onClick={generate} label="Regenerate" small />
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

      {/* Company overview + Relationship context */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <BriefCard title="Company overview">
          <p style={bodyStyle}>{prep.company_overview}</p>
        </BriefCard>
        <BriefCard title="Relationship context">
          <p style={bodyStyle}>{prep.relationship_context}</p>
        </BriefCard>
      </div>

      {/* Why meet now */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: '3px solid var(--accent)',
          borderRadius: '0 8px 8px 0',
          padding: '14px 18px',
        }}
      >
        <SectionTitle>Why meet now</SectionTitle>
        <p style={{ ...bodyStyle, fontSize: 13 }}>{prep.why_meet_now}</p>
      </div>

      {/* Recommended positioning */}
      <div
        style={{
          background: 'var(--accent-dim)',
          border: '1px solid rgba(200,169,110,0.2)',
          borderRadius: 8,
          padding: '14px 18px',
        }}
      >
        <SectionTitle accent>Recommended positioning</SectionTitle>
        <p style={{ ...bodyStyle, color: 'var(--text)' }}>{prep.recommended_positioning}</p>
      </div>

      {/* Likely needs */}
      {prep.likely_needs.length > 0 && (
        <BriefCard title="Likely needs">
          <QuestionList items={prep.likely_needs} bullet="◆" color="var(--text-muted)" />
        </BriefCard>
      )}

      {/* Questions — 2 column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {prep.pipeline_questions.length > 0 && (
          <BriefCard title="Pipeline questions">
            <QuestionList items={prep.pipeline_questions} />
          </BriefCard>
        )}
        {prep.budget_questions.length > 0 && (
          <BriefCard title="Budget questions">
            <QuestionList items={prep.budget_questions} />
          </BriefCard>
        )}
        {prep.pain_point_questions.length > 0 && (
          <BriefCard title="Pain point questions">
            <QuestionList items={prep.pain_point_questions} />
          </BriefCard>
        )}
        {prep.marketing_goal_questions.length > 0 && (
          <BriefCard title="Marketing goal questions">
            <QuestionList items={prep.marketing_goal_questions} />
          </BriefCard>
        )}
      </div>

      {/* Portfolio references */}
      {prep.portfolio_references_to_show.length > 0 && (
        <BriefCard title="Portfolio references to show">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {prep.portfolio_references_to_show.map((ref, i) => (
              <span
                key={i}
                style={{
                  fontSize: 12,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  border: '1px solid rgba(200,169,110,0.2)',
                  padding: '4px 10px',
                  borderRadius: 6,
                }}
              >
                {ref}
              </span>
            ))}
          </div>
        </BriefCard>
      )}

      {/* Risks */}
      {prep.risks.length > 0 && (
        <BriefCard title="Risks to watch">
          <QuestionList items={prep.risks} bullet="▲" color="var(--yellow)" />
        </BriefCard>
      )}
    </div>
  )
}

function GenerateButton({
  loading,
  onClick,
  label = 'Generate briefing',
  small,
}: {
  loading: boolean
  onClick: () => void
  label?: string
  small?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: small ? '6px 14px' : '10px 24px',
        background: loading ? 'var(--surface-2)' : 'var(--accent-dim)',
        color: loading ? 'var(--text-faint)' : 'var(--accent)',
        border: '1px solid rgba(200,169,110,0.3)',
        borderRadius: 6,
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        cursor: loading ? 'default' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {loading ? 'Generating…' : label}
    </button>
  )
}

function BriefCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  )
}

function SectionTitle({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: accent ? 'var(--accent)' : 'var(--text-faint)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

function QuestionList({
  items,
  bullet = '→',
  color = 'var(--text-muted)',
}: {
  items: string[]
  bullet?: string
  color?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0, paddingTop: 3 }}>{bullet}</span>
          <span style={{ fontSize: 12, color, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  )
}

function ContextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

const bodyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-muted)',
  lineHeight: 1.6,
  margin: 0,
}
