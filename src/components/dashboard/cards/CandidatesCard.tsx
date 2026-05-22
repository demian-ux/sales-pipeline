'use client'

import Link from 'next/link'
import { ScoreBlock, Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import type { FirmCandidateRow } from '@/lib/types'

interface Props {
  candidates: FirmCandidateRow[]
}

export default function CandidatesCard({ candidates }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">High-importance candidates</span>
          <span className="card-head-count">{String(candidates.length).padStart(2, '0')} FIRMS</span>
        </div>
        <Link className="btn btn-sm btn-ghost" href="/import/prospecting">
          Find more <Icon name="arrow" size={11} />
        </Link>
      </div>

      {candidates.length === 0 ? (
        <Empty title="No firm candidates surfaced yet.">
          Firms found by article prospecting, ranked by fit, appear here.
        </Empty>
      ) : (
        <div className="stack">
          {candidates.map((c) => {
            let host: string | null = null
            try {
              host = new URL(c.source_article_url).hostname.replace(/^www\./, '')
            } catch {
              host = null
            }
            return (
              <div key={c.id} className="stack-row" style={{ alignItems: 'flex-start' }}>
                <div className="stack-row-main">
                  <div className="ink" style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                  <div className="row" style={{ gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                    {(c.country || c.project_type) && (
                      <span className="ink-3" style={{ fontSize: 11.5 }}>
                        {[c.country, c.project_type].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {c.reference_project && (
                      <span className="ink-3" style={{ fontSize: 11.5 }}>· {c.reference_project}</span>
                    )}
                  </div>
                  {host && (
                    <a
                      className="micro"
                      href={c.source_article_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}
                    >
                      {host}
                      <Icon name="external" size={10} />
                    </a>
                  )}
                </div>
                <ScoreBlock value={c.score ?? 0} size="sm" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
