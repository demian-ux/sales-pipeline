'use client'

import Link from 'next/link'
import type { FirmCandidateRow } from '@/lib/types'

interface Props {
  candidates: FirmCandidateRow[]
}

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--green)'
  if (score >= 70) return 'var(--accent)'
  return 'var(--text-faint)'
}

export default function CandidatesCard({ candidates }: Props) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          High-importance candidates
          {candidates.length > 0 && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{candidates.length}</span>}
        </h2>
        <Link href="/import/prospecting" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Find more →
        </Link>
      </div>

      {candidates.length === 0 ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          No high-importance firm candidates surfaced yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {candidates.map((c) => {
            const articleHost = (() => { try { return new URL(c.source_article_url).hostname.replace(/^www\./, '') } catch { return null } })()
            return (
              <div key={c.id} className="hover-card" style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>
                    {c.country && <span>{c.country}</span>}
                    {c.project_type && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {c.project_type}</span>}
                  </div>
                  {c.reference_project && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.reference_project}
                    </div>
                  )}
                  {articleHost && (
                    <a href={c.source_article_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4, display: 'inline-block' }}>
                      Source: {articleHost} ↗
                    </a>
                  )}
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: scoreColor(c.score ?? 0), lineHeight: 1 }}>
                    {c.score ?? '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Score
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
