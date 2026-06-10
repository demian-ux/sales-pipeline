import Link from 'next/link'
import { getLeads } from '@/lib/sheets'
import { getAllThreads, getLatestAnalysesByThread } from '@/lib/gmail/store'
import { isGmailConnected, isGmailConfigured } from '@/lib/gmail/client'
import SyncButton from '@/components/conversations/SyncButton'
import ConversationsClient, { type EnrichedThread } from '@/components/conversations/ConversationsClient'
import { Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>
}) {
  const { thread: threadParam } = await searchParams
  const configured = isGmailConfigured()
  const connected = configured && (await isGmailConnected())

  const [leads, allThreads, analyses] = await Promise.all([
    getLeads(),
    getAllThreads(),
    getLatestAnalysesByThread(),
  ])
  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  const enriched: EnrichedThread[] = allThreads.map((thread) => {
    const analysis = analyses[thread.thread_id] ?? null
    const lead = leadMap.get(thread.lead_id)
    return {
      thread,
      analysis,
      leadName: lead?.full_name ?? 'Unknown lead',
      leadCompany: lead?.company_name ?? '—',
      state: analysis?.state ?? thread.inferred_state,
    }
  })

  return (
    <div className="page" style={{ maxWidth: 1440 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">People</div>
          <div className="page-title">Conversations</div>
          <div className="page-sub">Threads from Gmail, classified by what they need from you.</div>
        </div>
        {connected && (
          <div className="page-actions">
            <a className="btn" href="https://mail.google.com" target="_blank" rel="noopener noreferrer">
              <Icon name="mail" size={12} /> Open Gmail
            </a>
            <SyncButton />
          </div>
        )}
      </div>

      {!configured && (
        <div className="card">
          <Empty title="Gmail not configured.">
            Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to your environment, then connect
            from{' '}
            <Link className="accent" href="/settings">Settings</Link>.
          </Empty>
        </div>
      )}

      {configured && !connected && (
        <div className="card card-pad-lg" style={{ textAlign: 'center' }}>
          <div className="ink" style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
            Connect your Gmail
          </div>
          <div
            className="ink-2"
            style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: '52ch', margin: '0 auto 16px' }}
          >
            Oaki Relations reads your conversations with leads and classifies tone, momentum, and intent.
            No email is ever sent automatically.
          </div>
          <a className="btn btn-primary" href="/api/gmail/auth" style={{ display: 'inline-flex' }}>
            Connect Gmail <Icon name="arrow" size={12} />
          </a>
        </div>
      )}

      {connected && enriched.length === 0 && (
        <div className="card">
          <Empty title="No threads synced yet.">
            Click Sync Gmail to pull conversations from your leads.
          </Empty>
        </div>
      )}

      {connected && enriched.length > 0 && (
        <ConversationsClient threads={enriched} initialThreadId={threadParam} />
      )}
    </div>
  )
}
