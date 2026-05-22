'use client'

import Link from 'next/link'
import { ScoreBlock, Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import type { Discovery } from '@/lib/types'

interface Props {
  discoveries: Discovery[]
}

export default function DiscoveriesCard({ discoveries }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">High-importance discoveries</span>
          <span className="card-head-count">{String(discoveries.length).padStart(2, '0')} SIGNALS</span>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/discoveries">
          View all <Icon name="arrow" size={11} />
        </Link>
      </div>

      {discoveries.length === 0 ? (
        <Empty title="No high-importance discoveries right now.">
          Strong market signals from the research pipeline land here.
        </Empty>
      ) : (
        <div className="stack">
          {discoveries.map((d) => (
            <Link
              key={d.id}
              className="stack-row"
              href={`/discoveries/${d.id}`}
              style={{ alignItems: 'flex-start' }}
            >
              <div className="stack-row-main">
                <div
                  className="ink"
                  style={{ fontSize: 13, fontWeight: 500, letterSpacing: 'var(--t-tight)', lineHeight: 1.4 }}
                >
                  {d.title}
                </div>
                <div className="row" style={{ gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                  <span className="micro" style={{ color: 'var(--ink-2)' }}>{d.source}</span>
                  {d.region && <span className="ink-3" style={{ fontSize: 11 }}>· {d.region}</span>}
                  {d.sector && <span className="ink-3" style={{ fontSize: 11 }}>· {d.sector}</span>}
                </div>
              </div>
              <ScoreBlock value={d.discovery_score ?? 0} size="sm" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
