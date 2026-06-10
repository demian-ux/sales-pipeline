'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useProspecting } from '@/components/prospecting/useProspecting'
import UrlForm from '@/components/prospecting/UrlForm'
import ArticleSummaryCard from '@/components/prospecting/ArticleSummaryCard'
import FirmList from '@/components/prospecting/FirmList'
import ExportBar from '@/components/prospecting/ExportBar'
import CostEstimateCard from '@/components/prospecting/CostEstimateCard'
import { IconCheck, IconLoader } from '@/components/ui/icons'
import type { FirmCandidate } from '@/lib/types'

// Wrap useSearchParams in a Suspense boundary — required by Next 16 so the
// page doesn't fall back to fully dynamic rendering across the whole app.
export default function ProspectingPageWrapper() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProspectingPage />
    </Suspense>
  )
}

function PageSkeleton() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280 }}>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Loading…</div>
    </div>
  )
}

interface PromoteResult {
  firm_name: string
  company_id: string
  company_was_new: boolean
  opportunity_id: string
}

function ProspectingPage() {
  const searchParams = useSearchParams()
  // ?url=... pre-fills the form. ?discoveryId=... switches CSV-only mode into
  // "promote to Opportunity attached to Discovery" mode. Both are optional —
  // the plain /import/prospecting flow continues to work unchanged.
  const initialUrl   = searchParams.get('url') ?? ''
  const discoveryId  = searchParams.get('discoveryId')

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

  // Auto-run the analyze pipeline once when a ?url= is supplied. Guard with a
  // ref so React Strict Mode's double-effect doesn't fire it twice.
  const didAutoRun = useRef(false)
  useEffect(() => {
    if (didAutoRun.current) return
    if (!initialUrl) return
    didAutoRun.current = true
    analyze(initialUrl, discoveryId ?? undefined)
    // analyze is a stable closure from useProspecting; ESLint exhaustive-deps
    // would loop us if we listed it. The ref guard above prevents re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  // ── Promote-to-Opportunity (Discovery-mode only) ───────────────────────────
  const [promoteStatus, setPromoteStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [promoteError,  setPromoteError]  = useState<string | null>(null)
  const [promoteResult, setPromoteResult] = useState<{
    promoted: number
    new_companies: number
    reused_companies: number
    results: PromoteResult[]
    errors: string[]
  } | null>(null)

  async function promoteSelected(firms: FirmCandidate[]) {
    if (!discoveryId || firms.length === 0) return
    setPromoteStatus('running')
    setPromoteError(null)
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}/promote-firms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firms }),
      })
      const json = await res.json().catch(() => null) as
        | { promoted: number; new_companies: number; reused_companies: number; results: PromoteResult[]; errors: string[]; error?: string }
        | null
      if (!res.ok || !json) {
        setPromoteError(json?.error ?? `Promote failed (${res.status})`)
        setPromoteStatus('error')
        return
      }
      setPromoteResult(json)
      setPromoteStatus('idle')
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : 'Network error')
      setPromoteStatus('error')
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header — adapts to where the user came from */}
      <div>
        {discoveryId ? (
          <Link
            href={`/discoveries/${discoveryId}`}
            style={{ fontSize: 12, color: 'var(--text-faint)', display: 'inline-block', marginBottom: 8 }}
          >
            ← Back to Discovery
          </Link>
        ) : (
          <Link
            href="/import"
            style={{ fontSize: 12, color: 'var(--text-faint)', display: 'inline-block', marginBottom: 8 }}
          >
            ← Import
          </Link>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {discoveryId ? 'Find firms for this Discovery' : 'Prospecting'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
          {discoveryId ? (
            <>
              Same pipeline as the Import flow — Jina → Claude → Tavily → Claude — using the
              Discovery&apos;s source URL. Discard misses, then either export to Apollo CSV or promote the
              kept firms to Opportunities attached to this Discovery.
            </>
          ) : (
            <>
              Paste an architecture or real-estate article URL. Get 5–8 firms in the same country, scored
              against Oaki&apos;s ideal-prospect profile. Discard the irrelevant ones, then promote keepers
              into the Companies sheet or export as CSV.
            </>
          )}
        </p>
      </div>

      <UrlForm onSubmit={analyze} isLoading={isLoading} initialUrl={initialUrl} />

      {/* Error from analyze() */}
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

                {/* Discovery-mode only — bulk promote to Opportunity */}
                {discoveryId && (
                  <PromoteBar
                    selectedCount={selectedFirms.length}
                    status={promoteStatus}
                    error={promoteError}
                    result={promoteResult}
                    onPromote={() => promoteSelected(selectedFirms)}
                  />
                )}

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

// ── Promote bar (Discovery-mode only) ─────────────────────────────────────────
// Mirrors the look of ExportBar so the two actions feel related. Result panel
// drops in below on success.

interface PromoteBarProps {
  selectedCount: number
  status: 'idle' | 'running' | 'error'
  error: string | null
  result: {
    promoted: number
    new_companies: number
    reused_companies: number
    results: PromoteResult[]
    errors: string[]
  } | null
  onPromote: () => void
}

function PromoteBar({ selectedCount, status, error, result, onPromote }: PromoteBarProps) {
  const disabled = selectedCount === 0 || status === 'running'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--r-md)',
          background: 'var(--accent-dim)',
        }}
      >
        <div style={{ fontSize: 12, color: 'var(--text)' }}>
          Promote selected firms to Opportunities — attached to this Discovery
        </div>
        <button
          type="button"
          onClick={onPromote}
          disabled={disabled}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--accent)',
            background: disabled ? 'transparent' : 'var(--accent)',
            color: disabled ? 'var(--text-faint)' : '#000',
            fontSize: 12,
            fontWeight: 600,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          {status === 'running' && <IconLoader size={11} />}
          {status === 'running'
            ? `Promoting ${selectedCount}…`
            : `Promote ${selectedCount} to Opportunity`}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            fontSize: 12,
            color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid rgba(224,92,92,0.25)',
            borderRadius: 'var(--r-sm)',
          }}
        >
          {error}
        </div>
      )}

      {result && result.promoted > 0 && (
        <div
          style={{
            padding: '12px 16px',
            border: '1px solid rgba(76,175,134,0.3)',
            background: 'var(--green-dim)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--green)' }}>
            <IconCheck size={13} />
            <strong>{result.promoted}</strong>&nbsp;Opportunit{result.promoted === 1 ? 'y' : 'ies'} created
            &nbsp;·&nbsp;
            <strong>{result.new_companies}</strong>&nbsp;new compan{result.new_companies === 1 ? 'y' : 'ies'}
            {result.reused_companies > 0 && (
              <>, <strong>{result.reused_companies}</strong>&nbsp;existing matched</>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.results.map((r) => (
              <div key={r.opportunity_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{r.firm_name}</span>
                <span style={{ color: 'var(--text-faint)' }}>
                  {r.company_was_new ? 'new Company' : 'existing Company'}
                </span>
                <Link href={`/companies/${r.company_id}`} style={{ color: 'var(--accent)', fontSize: 11 }}>
                  → /companies/{r.company_id.slice(0, 14)}…
                </Link>
              </div>
            ))}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--red)' }}>
              {result.errors.length} error{result.errors.length === 1 ? '' : 's'}:&nbsp;
              {result.errors.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
