'use client'

import Link from 'next/link'
import type { Lead, Thread } from '@/lib/types'

interface Props {
  threads: Thread[]
  leads: Lead[]
}

export default function ConversationsCard({ threads, leads }: Props) {
  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))
  const waiting = threads
    .filter((t) => t.inferred_state === 'waiting_for_us')
    .slice(0, 6)

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          Conversations waiting
          {waiting.length > 0 && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{waiting.length}</span>}
        </h2>
        <Link href="/conversations" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          View all →
        </Link>
      </div>

      {waiting.length === 0 ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          No conversations waiting on you.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {waiting.map((thread) => {
            const lead = leadMap.get(thread.lead_id)
            return (
              <Link key={thread.thread_id} href="/conversations">
                <div className="hover-card" style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(224,92,92,0.2)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{lead?.full_name ?? thread.lead_id}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {thread.subject}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--red)', background: 'rgba(224,92,92,0.1)', padding: '2px 7px', borderRadius: 3, flexShrink: 0 }}>
                    Reply needed
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
