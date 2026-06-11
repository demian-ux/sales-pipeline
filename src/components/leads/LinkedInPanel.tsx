'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  Company,
  Interaction,
  Lead,
  LinkedInConnectionStatus,
  LinkedInDMStatus,
  LinkedInStrategyOutput,
  LinkedInWarmth,
} from '@/lib/types'
import CopyButton from '@/components/ui/CopyButton'
import { logInteraction, todayYMD } from '@/lib/client/interactions'

type ManualAction = {
  label: string
  subject: string
  summary: string
  direction: 'Inbound' | 'Outbound'
  interactionStatus: string
  updates: {
    linkedin_connection_status?: LinkedInConnectionStatus
    linkedin_dm_status?: LinkedInDMStatus
    linkedin_warmth?: LinkedInWarmth
  }
}

const ACTIONS: ManualAction[] = [
  {
    label: 'Mark connection sent',
    subject: 'LinkedIn connection request sent',
    summary: 'Manually sent a LinkedIn connection request.',
    direction: 'Outbound',
    interactionStatus: 'Connection Sent',
    updates: { linkedin_connection_status: 'Connection Sent', linkedin_warmth: 'Aware' },
  },
  {
    label: 'Mark connected',
    subject: 'LinkedIn connection accepted',
    summary: 'LinkedIn connection is now active.',
    direction: 'Inbound',
    interactionStatus: 'Connected',
    updates: { linkedin_connection_status: 'Connected', linkedin_warmth: 'Connected' },
  },
  {
    label: 'Mark DM sent',
    subject: 'LinkedIn DM sent',
    summary: 'Manually sent a LinkedIn direct message.',
    direction: 'Outbound',
    interactionStatus: 'DM Sent',
    updates: { linkedin_dm_status: 'DM Sent', linkedin_warmth: 'Warm' },
  },
  {
    label: 'Mark reply received',
    subject: 'LinkedIn reply received',
    summary: 'Received a LinkedIn reply.',
    direction: 'Inbound',
    interactionStatus: 'Replied',
    updates: { linkedin_dm_status: 'Replied', linkedin_warmth: 'Engaged' },
  },
  {
    label: 'Mark profile viewed',
    subject: 'LinkedIn profile viewed',
    summary: 'Manually viewed the LinkedIn profile for relationship context.',
    direction: 'Outbound',
    interactionStatus: 'Profile Viewed',
    updates: { linkedin_warmth: 'Aware' },
  },
  {
    label: 'Mark post engaged',
    subject: 'LinkedIn post engaged',
    summary: 'Manually engaged with a LinkedIn post.',
    direction: 'Outbound',
    interactionStatus: 'Post Engaged',
    updates: { linkedin_warmth: 'Warm' },
  },
]

export default function LinkedInPanel({
  lead,
  company,
  interactions,
}: {
  lead: Lead
  company: Company | null
  interactions: Interaction[]
}) {
  const router = useRouter()
  const [strategy, setStrategy] = useState<LinkedInStrategyOutput | null>(null)
  const [loadingStrategy, setLoadingStrategy] = useState(false)
  const [logging, setLogging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lastLinkedInAction = useMemo(() => {
    return [...interactions]
      .filter((interaction) => interaction.channel === 'LinkedIn')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
  }, [interactions])

  async function generateStrategy() {
    setLoadingStrategy(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/linkedin-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead.lead_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Strategy failed')
      setStrategy(data.strategy)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Strategy failed')
    } finally {
      setLoadingStrategy(false)
    }
  }

  async function logAction(action: ManualAction) {
    setLogging(action.label)
    setError(null)
    const touchedAt = todayYMD()
    try {
      // Single write path: POST /api/leads/{id}/interactions, which also
      // updates last_touch_date server-side. The old version posted to the
      // legacy /api/interactions route, which skipped the touch-date update —
      // that's how inbound entries appeared while last_touch_date stayed empty.
      await logInteraction(lead.lead_id, {
        channel: 'LinkedIn',
        direction: action.direction,
        subject: action.subject,
        body_summary: action.summary,
        linkedin_manual_status: action.interactionStatus,
        sent_at: touchedAt,
      })

      const leadRes = await fetch(`/api/leads/${lead.lead_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...action.updates,
          last_linkedin_touch_date: touchedAt,
        }),
      })
      const leadData = await leadRes.json().catch(() => null)
      if (!leadRes.ok) throw new Error(leadData?.error ?? `Could not update LinkedIn status (HTTP ${leadRes.status})`)

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log action')
    } finally {
      setLogging(null)
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          LinkedIn Relationship
        </div>
        {lead.linkedin_url && (
          <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" style={smallLink}>
            Open profile
          </a>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Status label="Connection" value={lead.linkedin_connection_status ?? 'Unknown'} />
        <Status label="DM" value={lead.linkedin_dm_status ?? 'Unknown'} />
        <Status label="Warmth" value={lead.linkedin_warmth ?? 'Passive'} />
        <Status label="Last touch" value={formatDate(lead.last_linkedin_touch_date)} />
      </div>

      {company?.linkedin_company_url && (
        <a href={company.linkedin_company_url} target="_blank" rel="noopener noreferrer" style={{ ...smallLink, display: 'inline-block', marginBottom: 10 }}>
          Open company page
        </a>
      )}

      {lead.linkedin_notes && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
          {lead.linkedin_notes}
        </div>
      )}

      {lastLinkedInAction && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>Last LinkedIn action</div>
          <div style={{ fontSize: 12, color: 'var(--text)' }}>{lastLinkedInAction.subject ?? lastLinkedInAction.linkedin_manual_status}</div>
          {lastLinkedInAction.body_summary && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3, lineHeight: 1.4 }}>{lastLinkedInAction.body_summary}</div>
          )}
        </div>
      )}

      <button
        onClick={generateStrategy}
        disabled={loadingStrategy}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'var(--accent-dim)',
          color: 'var(--accent)',
          border: '1px solid rgba(200,169,110,0.3)',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: loadingStrategy ? 'default' : 'pointer',
          marginBottom: 10,
        }}
      >
        {loadingStrategy ? 'Thinking...' : 'Generate LinkedIn strategy'}
      </button>

      {strategy && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
              {strategy.recommended_linkedin_action}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{strategy.confidence}%</div>
          </div>
          <TextBlock label="Why" text={strategy.why} />
          <TextBlock label="Risk" text={strategy.risk} />
          {strategy.connection_note && (
            <Draft label="Connection note" text={strategy.connection_note} copyLabel="Copy note" />
          )}
          {strategy.suggested_dm && (
            <Draft label="Suggested DM" text={strategy.suggested_dm} copyLabel="Copy DM" />
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => logAction(action)}
            disabled={logging !== null}
            style={{
              padding: '7px 8px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: logging ? 'default' : 'pointer',
              textAlign: 'left',
            }}
          >
            {logging === action.label ? 'Saving...' : action.label}
          </button>
        ))}
      </div>

      {error && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--red)' }}>{error}</div>}
    </div>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  if (!text) return null
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function Draft({ label, text, copyLabel }: { label: string; text: string; copyLabel: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{label}</div>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}

function formatDate(date?: string): string {
  if (!date) return 'Unknown'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const smallLink: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--accent)',
  textDecoration: 'none',
}
