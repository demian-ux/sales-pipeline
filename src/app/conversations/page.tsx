import { getLeads } from '@/lib/sheets'
import { sessionCache } from '@/lib/sheets/cache'
import { isGmailConnected, isGmailConfigured } from '@/lib/gmail/client'
import type { ParsedThread, ConversationAnalysis, ConversationState, ConversationIntent } from '@/lib/gmail/types'
import Badge from '@/components/ui/Badge'
import SyncButton from '@/components/conversations/SyncButton'
import AnalyzeThreadButton from '@/components/conversations/AnalyzeThreadButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

type StateGroup = {
  key: ConversationState
  label: string
  description: string
  borderColor: string
  badgeColor: string
}

const STATE_GROUPS: StateGroup[] = [
  { key: 'waiting_for_us', label: 'Needs Response', description: 'They replied — your turn', borderColor: 'rgba(224,92,92,0.4)', badgeColor: '#e05c5c' },
  { key: 'active', label: 'Active', description: 'Recent back-and-forth', borderColor: 'rgba(76,175,134,0.3)', badgeColor: 'var(--green)' },
  { key: 'waiting_for_them', label: 'Waiting', description: 'Sent — awaiting reply', borderColor: 'var(--border)', badgeColor: 'var(--text-muted)' },
  { key: 'cooling', label: 'Cooling', description: 'Going quiet — consider a touchpoint', borderColor: 'rgba(200,169,110,0.3)', badgeColor: 'var(--accent)' },
  { key: 'dormant', label: 'Dormant', description: 'No exchange in 4+ weeks', borderColor: 'var(--border-subtle)', badgeColor: 'var(--text-faint)' },
]

function intentLabel(intent: ConversationIntent): string {
  const map: Record<ConversationIntent, string> = {
    high: 'High intent',
    discovery_opportunity: 'Discovery opp',
    proposal_risk: 'Proposal risk',
    medium: 'Medium intent',
    low: 'Low intent',
    none: '',
  }
  return map[intent]
}

function intentVariant(intent: ConversationIntent): string {
  if (intent === 'high') return 'green'
  if (intent === 'discovery_opportunity') return 'accent'
  if (intent === 'proposal_risk') return 'red'
  if (intent === 'medium') return 'yellow'
  return 'muted'
}

function momentumLabel(m: string): string {
  if (m === 'accelerating') return '↑ accelerating'
  if (m === 'decelerating') return '↓ slowing'
  if (m === 'stalled') return '— stalled'
  return '→ steady'
}

function relativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    const hours = (Date.now() - d.getTime()) / 3_600_000
    if (hours < 1) return 'just now'
    if (hours < 24) return `${Math.floor(hours)}h ago`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    return `${Math.floor(days / 30)}mo ago`
  } catch {
    return dateStr
  }
}

export default async function ConversationsPage() {
  const configured = isGmailConfigured()
  const connected = configured && (await isGmailConnected())

  const leads = await getLeads()
  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  // Flatten all synced threads
  const allThreads: ParsedThread[] = Object.values(sessionCache.threads).flat()
  const analyses = sessionCache.analyses

  const totalThreads = allThreads.length
  const needsResponse = allThreads.filter((t) => {
    const a = analyses[t.thread_id]
    const state = a?.state ?? t.inferred_state
    return state === 'waiting_for_us'
  }).length

  // Group threads by state
  const grouped = STATE_GROUPS.map((group) => ({
    ...group,
    threads: allThreads.filter((t) => {
      const a = analyses[t.thread_id]
      return (a?.state ?? t.inferred_state) === group.key
    }),
  })).filter((g) => g.threads.length > 0)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 className="page-title">Conversations</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {totalThreads > 0
              ? `${totalThreads} threads · ${needsResponse} need${needsResponse === 1 ? 's' : ''} response`
              : 'Relationship-aware conversation intelligence'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {connected && <SyncButton />}
        </div>
      </div>

      {/* Not configured */}
      {!configured && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 12 }}>✉</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Gmail not configured</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16, maxWidth: 400, margin: '0 auto 16px' }}>
            Add <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> to your environment, then connect from Settings.
          </div>
          <Link href="/settings" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
            Go to Settings →
          </Link>
        </div>
      )}

      {/* Configured but not connected */}
      {configured && !connected && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 14 }}>✉</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Connect your Gmail</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20, maxWidth: 380, margin: '0 auto 20px' }}>
            Oaki Relations will read your conversations with leads and analyze tone, momentum, and intent. No emails are sent automatically.
          </div>
          <a
            href="/api/gmail/auth"
            style={{
              display: 'inline-block',
              padding: '9px 20px',
              background: 'var(--accent)',
              color: '#000',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Connect Gmail →
          </a>
        </div>
      )}

      {/* Connected, no threads yet */}
      {connected && totalThreads === 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            No threads synced yet. Click <strong>↻ Sync Gmail</strong> to pull conversations from your leads.
          </div>
          <SyncButton />
        </div>
      )}

      {/* Thread groups */}
      {totalThreads > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {grouped.map((group) => (
            <section key={group.key}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{group.label}</h2>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{group.description}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{group.threads.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.threads.map((thread) => {
                  const lead = leadMap.get(thread.lead_id)
                  const analysis = analyses[thread.thread_id]
                  return (
                    <ThreadCard
                      key={thread.thread_id}
                      thread={thread}
                      analysis={analysis}
                      leadName={lead?.full_name}
                      leadCompany={lead?.company_name}
                      leadId={thread.lead_id}
                      borderColor={group.borderColor}
                      badgeColor={group.badgeColor}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

interface ThreadCardProps {
  thread: ParsedThread
  analysis?: ConversationAnalysis
  leadName?: string
  leadCompany?: string
  leadId: string
  borderColor: string
  badgeColor: string
}

function ThreadCard({ thread, analysis, leadName, leadCompany, leadId, borderColor, badgeColor }: ThreadCardProps) {
  const state = analysis?.state ?? thread.inferred_state

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor}`,
      borderRadius: 8,
      padding: '14px 16px',
    }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <Link href={`/leads/${leadId}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {leadName ?? 'Unknown lead'}
            </Link>
            {leadCompany && (
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{leadCompany}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{thread.subject}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 11, color: badgeColor, background: `${badgeColor}18`, padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
            {STATE_GROUPS.find(g => g.key === state)?.label ?? state}
          </span>
          {analysis && intentLabel(analysis.intent) && (
            <Badge label={intentLabel(analysis.intent)} variant={intentVariant(analysis.intent) as 'green' | 'accent' | 'red' | 'yellow' | 'muted'} />
          )}
        </div>
      </div>

      {/* Analysis content */}
      {analysis ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{analysis.summary}</div>
          {analysis.recommended_response && (
            <div style={{ fontSize: 12, color: 'var(--accent)' }}>→ {analysis.recommended_response}</div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{momentumLabel(analysis.momentum)}</span>
            {analysis.response_deadline && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                {analysis.response_deadline}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
              {thread.last_message_from === 'us' ? 'You' : leadName ?? 'Them'} · {relativeDate(thread.last_message_at)}
            </span>
          </div>
          {analysis.objections.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-faint)', paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
              Objections: {analysis.objections.join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', maxWidth: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {thread.snippet}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              {thread.last_message_from === 'us' ? 'You' : leadName ?? 'Them'} · {relativeDate(thread.last_message_at)}
            </span>
            <AnalyzeThreadButton threadId={thread.thread_id} leadId={leadId} />
          </div>
        </div>
      )}

      {/* Message count */}
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 8 }}>
        {thread.message_count} message{thread.message_count !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
