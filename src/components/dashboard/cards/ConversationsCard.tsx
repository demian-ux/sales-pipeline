'use client'

import Link from 'next/link'
import { StatusBadge, Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import { relativeDate } from '@/lib/utils'
import type { Lead, Thread } from '@/lib/types'

interface Props {
  threads: Thread[]
  leads: Lead[]
}

export default function ConversationsCard({ threads, leads }: Props) {
  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))
  const waiting = threads.filter((t) => t.inferred_state === 'waiting_for_us').slice(0, 6)

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Conversations waiting</span>
          <span className="card-head-count">{String(waiting.length).padStart(2, '0')} THREADS</span>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/conversations">
          View all <Icon name="arrow" size={11} />
        </Link>
      </div>

      {waiting.length === 0 ? (
        <Empty title="No conversations waiting on you.">
          Threads where the next move is yours show up here.
        </Empty>
      ) : (
        <div className="stack">
          {waiting.map((t) => {
            const lead = leadMap.get(t.lead_id)
            return (
              <Link key={t.thread_id} className="stack-row" href="/conversations">
                <div className="stack-row-main" style={{ gap: 6 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>
                      {lead?.full_name ?? t.lead_id}
                    </span>
                    {lead?.company_name && (
                      <span className="ink-3" style={{ fontSize: 12 }}>· {lead.company_name}</span>
                    )}
                    <StatusBadge tone="risk">Reply needed</StatusBadge>
                  </div>
                  <div className="ink-2 truncate" style={{ fontSize: 12 }}>&ldquo;{t.subject}&rdquo;</div>
                  {t.snippet && (
                    <div className="ink-3 truncate" style={{ fontSize: 11.5 }}>{t.snippet}</div>
                  )}
                </div>
                <div className="stack-row-actions">
                  <span className="micro" style={{ color: 'var(--ink-3)' }}>
                    {relativeDate(t.last_message_at)}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
