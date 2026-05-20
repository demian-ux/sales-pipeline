'use client'

import Link from 'next/link'
import { useProspecting } from '@/components/prospecting/useProspecting'
import UrlForm from '@/components/prospecting/UrlForm'
import ArticleSummaryCard from '@/components/prospecting/ArticleSummaryCard'
import FirmList from '@/components/prospecting/FirmList'
import ExportBar from '@/components/prospecting/ExportBar'
import CostEstimateCard from '@/components/prospecting/CostEstimateCard'
import { IconLoader } from '@/components/ui/icons'

export default function ProspectingPage() {
  const {
    data,
    meta,
    selectedFirms,
    discarded,
    isLoading,
    isExporting,
    error,
    analyze,
    toggleFirm,
    exportCsv,
  } = useProspecting()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div>
        <Link
          href="/import"
          style={{ fontSize: 12, color: 'var(--text-faint)', display: 'inline-block', marginBottom: 8 }}
        >
          ← Import
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Prospecting</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
          Paste an architecture or real-estate article URL. Get 5–8 firms in the same country, scored against Oaki&apos;s
          ideal-prospect profile. Discard the irrelevant ones, then promote keepers into the Companies sheet or export
          as CSV.
        </p>
      </div>

      <UrlForm onSubmit={analyze} isLoading={isLoading} />

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--red-dim)',
            border: '1px solid rgba(224,92,92,0.3)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            color: 'var(--red)',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && !data && (
        <div
          style={{
            padding: 32,
            border: '1px dashed var(--border)',
            borderRadius: 'var(--r-md)',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <IconLoader size={20} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Reading article, searching for firms, scoring prospects…
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
            Usually 30–60 seconds. Do not close this tab.
          </div>
        </div>
      )}

      {/* Result */}
      {data && meta && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <ArticleSummaryCard article={data.article} sourceUrl={meta.sourceUrl} />

            {data.firms.length === 0 ? (
              <div className="empty-state">
                <div style={{ marginBottom: 6, color: 'var(--text-muted)' }}>
                  Claude returned no firm candidates for this article.
                </div>
                <div style={{ fontSize: 11 }}>
                  Try a different article — denser news with named developers or studios works best.
                </div>
              </div>
            ) : (
              <>
                <ExportBar
                  selectedCount={selectedFirms.length}
                  isExporting={isExporting}
                  onExport={exportCsv}
                />
                <FirmList
                  firms={data.firms}
                  article={data.article}
                  discarded={discarded}
                  onToggleFirm={toggleFirm}
                />
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
            <CostEstimateCard meta={meta} />
          </div>
        </div>
      )}
    </div>
  )
}
