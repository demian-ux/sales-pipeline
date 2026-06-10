'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ScoreBlock, Empty } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'
import type { FirmCandidateRow } from '@/lib/types'

interface Props {
  candidates: FirmCandidateRow[]
}

// /api/prospecting/promote requires every firm field non-empty + a 0–100
// integer score; rows missing any of those can't be promoted from here.
function canPromote(c: FirmCandidateRow): boolean {
  return !!(c.name && c.country && c.project_type && c.reference_project && typeof c.score === 'number')
}

export default function CandidatesCard({ candidates }: Props) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errorById, setErrorById] = useState<Record<string, string>>({})

  function setRowError(id: string, message: string | null) {
    setErrorById((prev) => {
      const next = { ...prev }
      if (message) next[id] = message
      else delete next[id]
      return next
    })
  }

  async function handlePromote(c: FirmCandidateRow) {
    setBusyId(c.id)
    setRowError(c.id, null)
    try {
      const res = await fetch('/api/prospecting/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm: {
            name: c.name,
            country: c.country,
            project_type: c.project_type,
            reference_project: c.reference_project,
            website: c.website ?? null,
            score: Math.round(c.score ?? 0),
          },
          source_article_url: c.source_article_url,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Promote failed')
      router.refresh()
    } catch (err) {
      setRowError(c.id, err instanceof Error ? err.message : 'Promote failed')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDismiss(c: FirmCandidateRow) {
    setBusyId(c.id)
    setRowError(c.id, null)
    try {
      const res = await fetch(`/api/candidates/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Dismiss failed')
      router.refresh()
    } catch (err) {
      setRowError(c.id, err instanceof Error ? err.message : 'Dismiss failed')
    } finally {
      setBusyId(null)
    }
  }

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
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <button
                      className="btn btn-xs"
                      onClick={() => handlePromote(c)}
                      disabled={busyId !== null || !canPromote(c)}
                      title={canPromote(c) ? 'Promote to Company' : 'Missing fields — promote from Prospecting instead'}
                    >
                      {busyId === c.id ? 'Working…' : 'Promote'}
                    </button>
                    <button
                      className="btn btn-xs btn-ghost"
                      onClick={() => handleDismiss(c)}
                      disabled={busyId !== null}
                    >
                      Dismiss
                    </button>
                  </div>
                  {errorById[c.id] && (
                    <div className="micro" style={{ color: 'var(--red)', marginTop: 6 }}>{errorById[c.id]}</div>
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
