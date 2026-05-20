'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { FirmCandidate, ProspectingArticle } from '@/lib/types'
import { IconLoader, IconCheck, IconExternalLink } from '@/components/ui/icons'

interface Props {
  firm: FirmCandidate
  article: ProspectingArticle
  isDiscarded: boolean
  onToggle: () => void
}

function scoreColors(score: number): { color: string; background: string; border: string } {
  if (score >= 85) return { color: 'var(--green)',  background: 'var(--green-dim)',  border: 'rgba(76,175,134,0.3)' }
  if (score >= 65) return { color: 'var(--accent)', background: 'var(--accent-dim)', border: 'rgba(200,169,110,0.3)' }
  if (score >= 45) return { color: 'var(--yellow)', background: 'var(--yellow-dim)', border: 'rgba(212,168,67,0.3)' }
  return                    { color: 'var(--text-faint)', background: 'var(--surface-2)', border: 'var(--border)' }
}

export default function FirmCard({ firm, article, isDiscarded, onToggle }: Props) {
  const [promoting, setPromoting] = useState(false)
  const [promoted, setPromoted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const colors = scoreColors(firm.score)

  async function promote() {
    setPromoting(true)
    setError(null)
    try {
      const res = await fetch('/api/prospecting/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firm: {
            name: firm.name,
            country: firm.country,
            project_type: firm.project_type,
            reference_project: firm.reference_project,
            website: firm.website,
            score: firm.score,
          },
          source_article_url: firm.source_article_url,
          source_article_title: article.title,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Promote failed (${res.status})`)
      setPromoted(data.company_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed')
    } finally {
      setPromoting(false)
    }
  }

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        opacity: isDiscarded ? 0.4 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <h3
          style={{
            flex: 1,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.3,
            margin: 0,
          }}
        >
          {firm.name}
        </h3>
        <span
          title={`Score ${firm.score}/100`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 36,
            height: 24,
            padding: '0 8px',
            borderRadius: 'var(--r-sm)',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'SF Mono, ui-monospace, monospace',
            fontVariantNumeric: 'tabular-nums',
            color: colors.color,
            background: colors.background,
            border: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          {firm.score}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
        <div style={{ color: 'var(--text-muted)' }}>{firm.country}</div>
        <div style={{ color: 'var(--text-faint)' }}>{firm.project_type}</div>
        <div style={{ color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-faint)' }}>Project · </span>
          {firm.reference_project}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
        {firm.website ? (
          <a
            href={firm.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            Website <IconExternalLink size={10} style={{ opacity: 0.6 }} />
          </a>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No website</span>
        )}

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={onToggle}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 'var(--r-xs)',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-faint)',
            cursor: 'pointer',
          }}
        >
          {isDiscarded ? 'Restore' : 'Discard'}
        </button>

        {promoted ? (
          <Link
            href={`/companies/${promoted}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 'var(--r-xs)',
              border: '1px solid rgba(76,175,134,0.3)',
              background: 'var(--green-dim)',
              color: 'var(--green)',
              textDecoration: 'none',
            }}
          >
            <IconCheck size={10} /> Promoted
          </Link>
        ) : (
          <button
            type="button"
            onClick={promote}
            disabled={promoting}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 'var(--r-xs)',
              border: '1px solid var(--accent)',
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              cursor: promoting ? 'default' : 'pointer',
              opacity: promoting ? 0.5 : 1,
            }}
          >
            {promoting && <IconLoader size={10} />}
            {promoting ? 'Promoting…' : 'Promote to Company'}
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>
      )}
    </article>
  )
}
