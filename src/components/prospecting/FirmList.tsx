'use client'

import type { FirmCandidate, ProspectingArticle } from '@/lib/types'
import FirmCard from './FirmCard'

interface Props {
  firms: FirmCandidate[]
  article: ProspectingArticle
  discarded: Set<string>
  onToggleFirm: (firm: FirmCandidate) => void
}

export default function FirmList({ firms, article, discarded, onToggleFirm }: Props) {
  const sorted = [...firms].sort((a, b) => b.score - a.score)

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
          margin: 0,
        }}
      >
        Candidate firms ({firms.length})
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        {sorted.map((firm) => (
          <FirmCard
            key={firm.candidate_id}
            firm={firm}
            article={article}
            isDiscarded={discarded.has(firm.candidate_id)}
            onToggle={() => onToggleFirm(firm)}
          />
        ))}
      </div>
    </section>
  )
}
