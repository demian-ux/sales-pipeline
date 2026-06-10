'use client'

import { useState } from 'react'
import { WhyNow, NextAction, StatusBadge, Pill } from '@/components/ui/primitives'
import CopyButton from '@/components/ui/CopyButton'
import DraftButton from './DraftButton'
import { MarkSentButton, CreateGmailDraftButton } from './SendActions'
import { relativeDate } from '@/lib/utils'
import type { AIInsight } from '@/lib/types'

type Tab = 'summary' | 'letter' | 'email' | 'dm' | 'questions'

interface Props {
  insight: AIInsight | null
  leadId: string
  leadEmail?: string | null
  letterContent: string | null
  emailContent: string | null
  linkedinContent: string | null
  letterUpdatedAt?: string
  emailUpdatedAt?: string
  linkedinUpdatedAt?: string
  letterSentAt?: string
  emailSentAt?: string
  linkedinSentAt?: string
}

const INTENT_TONE: Record<string, 'ok' | 'warn' | 'info'> = {
  high: 'ok',
  medium: 'warn',
  low: 'info',
}

export default function LeadAnalysisCard({
  insight,
  leadId,
  leadEmail,
  letterContent,
  emailContent,
  linkedinContent,
  letterUpdatedAt,
  emailUpdatedAt,
  linkedinUpdatedAt,
  letterSentAt,
  emailSentAt,
  linkedinSentAt,
}: Props) {
  const [tab, setTab] = useState<Tab>('summary')

  if (!insight) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-head-title">
            <span className="card-head-name">Claude Analysis</span>
            <span className="card-head-count">NOT YET RUN</span>
          </div>
        </div>
        <div style={{ padding: 20 }}>
          <div className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 14, maxWidth: '60ch' }}>
            No analysis yet. Run &ldquo;Analyze — why now?&rdquo; in the sidebar for the strategic
            assessment and discovery questions. You can still draft outreach below.
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <DraftButton leadId={leadId} kind="letter" hasInsight={false} hasExistingDraft={!!letterContent} />
            <DraftButton leadId={leadId} kind="email" hasInsight={false} hasExistingDraft={!!emailContent} />
            <DraftButton leadId={leadId} kind="linkedin" hasInsight={false} hasExistingDraft={!!linkedinContent} />
          </div>
          {letterContent && <DraftBlock label="Letter draft" text={letterContent} />}
          {emailContent && <DraftBlock label="Email draft" text={emailContent} />}
          {linkedinContent && <DraftBlock label="LinkedIn DM" text={linkedinContent} />}
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-head" style={{ borderBottom: 'none', paddingBottom: 4 }}>
        <div className="card-head-title">
          <span className="card-head-name">Claude Analysis</span>
          <span className="card-head-count">
            GENERATED {relativeDate(insight.created_at)} · {insight.confidence}% CONFIDENCE
          </span>
        </div>
      </div>

      {/* Intent + risk */}
      <div className="row" style={{ padding: '4px 20px 14px', gap: 8, flexWrap: 'wrap' }}>
        <StatusBadge tone={INTENT_TONE[insight.intent_level] ?? 'info'}>
          {insight.intent_level} intent
        </StatusBadge>
        {insight.risk_level && <Pill>{insight.risk_level} risk</Pill>}
      </div>

      {/* Tabs */}
      <div className="ai-tabs">
        <button className={`ai-tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>
          Summary
        </button>
        <button className={`ai-tab ${tab === 'letter' ? 'active' : ''}`} onClick={() => setTab('letter')}>
          Letter
        </button>
        <button className={`ai-tab ${tab === 'email' ? 'active' : ''}`} onClick={() => setTab('email')}>
          Draft email
        </button>
        <button className={`ai-tab ${tab === 'dm' ? 'active' : ''}`} onClick={() => setTab('dm')}>
          LinkedIn DM
        </button>
        <button className={`ai-tab ${tab === 'questions' ? 'active' : ''}`} onClick={() => setTab('questions')}>
          Discovery questions
          <span className="ct">{String(insight.discovery_questions.length).padStart(2, '0')}</span>
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {tab === 'summary' && (
          <div className="col" style={{ gap: 18 }}>
            <div className="ink" style={{ fontSize: 13.5, lineHeight: 1.65, maxWidth: '64ch' }}>
              {insight.summary}
            </div>
            {insight.why_now && <WhyNow>{insight.why_now}</WhyNow>}
            {insight.recommended_next_action && <NextAction>{insight.recommended_next_action}</NextAction>}
          </div>
        )}

        {tab === 'letter' && (
          <DraftTab
            kind="letter"
            leadId={leadId}
            content={letterContent}
            updatedAt={letterUpdatedAt}
            sentAt={letterSentAt}
            empty="Generate the physical letter — the first touch of the cold sequence."
          />
        )}

        {tab === 'email' && (
          <DraftTab
            kind="email"
            leadId={leadId}
            leadEmail={leadEmail}
            content={emailContent}
            updatedAt={emailUpdatedAt}
            sentAt={emailSentAt}
            empty="Generate an email draft from this analysis."
          />
        )}

        {tab === 'dm' && (
          <DraftTab
            kind="linkedin"
            leadId={leadId}
            content={linkedinContent}
            updatedAt={linkedinUpdatedAt}
            sentAt={linkedinSentAt}
            empty="Generate a LinkedIn DM from this analysis."
          />
        )}

        {tab === 'questions' && (
          <div className="col" style={{ gap: 10 }}>
            <span className="micro">Discovery questions for the call</span>
            {insight.discovery_questions.length > 0 ? (
              <ol
                style={{
                  paddingLeft: 20,
                  color: 'var(--ink)',
                  fontSize: 13,
                  lineHeight: 1.75,
                  maxWidth: '64ch',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {insight.discovery_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ol>
            ) : (
              <span className="ink-3" style={{ fontSize: 12 }}>No discovery questions in this analysis.</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function DraftTab({
  kind,
  leadId,
  leadEmail,
  content,
  updatedAt,
  sentAt,
  empty,
}: {
  kind: 'email' | 'linkedin' | 'letter'
  leadId: string
  leadEmail?: string | null
  content: string | null
  updatedAt?: string
  sentAt?: string
  empty: string
}) {
  const sentLabel = sentAt ? ` · sent ${relativeDate(sentAt)}` : ' · not sent'
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="between">
        <span className="micro" style={sentAt ? { color: 'var(--ok, var(--green))' } : undefined}>
          {content ? `Draft${updatedAt ? ` · ${relativeDate(updatedAt)}` : ''}${sentLabel}` : 'No draft yet'}
        </span>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {content && <CopyButton text={content} label="Copy" />}
          {content && kind === 'email' && leadEmail && (
            <CreateGmailDraftButton leadId={leadId} leadEmail={leadEmail} content={content} />
          )}
          {content && !sentAt && <MarkSentButton leadId={leadId} kind={kind} content={content} />}
          <DraftButton leadId={leadId} kind={kind} hasInsight hasExistingDraft={!!content} />
        </div>
      </div>
      {content ? (
        <pre className="draft">{content}</pre>
      ) : (
        <span className="ink-3" style={{ fontSize: 12 }}>{empty}</span>
      )}
    </div>
  )
}

function DraftBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="col" style={{ gap: 8, marginTop: 14 }}>
      <div className="between">
        <span className="micro">{label}</span>
        <CopyButton text={text} label="Copy" />
      </div>
      <pre className="draft">{text}</pre>
    </div>
  )
}
