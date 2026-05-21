'use client'

import Link from 'next/link'
import type { Discovery } from '@/lib/types'

interface Props {
  discoveries: Discovery[]
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--green)'
  if (score >= 60) return 'var(--accent)'
  return 'var(--text-faint)'
}

export default function DiscoveriesCard({ discoveries }: Props) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
          High-importance discoveries
          {discoveries.length > 0 && <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--text-faint)' }}>{discoveries.length}</span>}
        </h2>
        <Link href="/discoveries" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          View all →
        </Link>
      </div>

      {discoveries.length === 0 ? (
        <div style={{ padding: '20px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' }}>
          No high-importance discoveries right now.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {discoveries.map((d) => (
            <Link key={d.id} href={`/discoveries/${d.id}`}>
              <div className="hover-card" style={{
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
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {d.source}
                    {d.region && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {d.region}</span>}
                    {d.sector && <span style={{ marginLeft: 6, opacity: 0.8 }}>· {d.sector}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: scoreColor(d.discovery_score ?? 0), lineHeight: 1 }}>
                    {d.discovery_score ?? '—'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Score
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
