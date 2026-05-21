'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import ArticleSummaryCard from '@/components/prospecting/ArticleSummaryCard'
import CostEstimateCard from '@/components/prospecting/CostEstimateCard'
import { IconLoader, IconCheck, IconExternalLink, IconX } from '@/components/ui/icons'
import type { FirmCandidate, ProspectingResult } from '@/lib/types'
import type { ProspectingMeta } from '@/lib/prospecting/analyze'

interface Props {
  discoveryId: string
  discoveryTitle: string
  sourceUrl: string
  alreadyPromotedOpportunityId?: string | null
}

interface PromoteResult {
  firm_name: string
  company_id: string
  company_was_new: boolean
  opportunity_id: string
}

async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try { return (await res.json()) as T } catch { return null }
}

export default function FirmsFinder({ discoveryId, discoveryTitle, sourceUrl, alreadyPromotedOpportunityId }: Props) {
  const [data, setData]                 = useState<ProspectingResult | null>(null)
  const [meta, setMeta]                 = useState<ProspectingMeta | null>(null)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [findStatus, setFindStatus]     = useState<'idle' | 'running' | 'error'>('idle')
  const [findError, setFindError]       = useState<string | null>(null)
  const [promoteStatus, setPromoteStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const [promoteResult, setPromoteResult] = useState<{ promoted: number; new_companies: number; reused_companies: number; results: PromoteResult[]; errors: string[] } | null>(null)
  const [isExporting, setIsExporting]   = useState(false)

  const sortedFirms = useMemo(
    () => (data?.firms ? [...data.firms].sort((a, b) => b.score - a.score) : []),
    [data],
  )

  const allSelected = sortedFirms.length > 0 && selected.size === sortedFirms.length
  const someSelected = selected.size > 0
  const selectedFirms = sortedFirms.filter((f) => selected.has(f.candidate_id))

  function toggleOne(candidateId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(candidateId)) next.delete(candidateId)
      else next.add(candidateId)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sortedFirms.map((f) => f.candidate_id)))
  }

  async function findFirms() {
    setFindStatus('running')
    setFindError(null)
    setData(null)
    setMeta(null)
    setSelected(new Set())
    setPromoteResult(null)
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}/find-firms`, { method: 'POST' })
      const json = await safeJson<{ data?: ProspectingResult; meta?: ProspectingMeta; error?: string }>(res)
      if (!res.ok || !json?.data || !json.meta) {
        setFindError(json?.error ?? `Request failed (${res.status})`)
        setFindStatus('error')
        return
      }
      setData(json.data)
      setMeta(json.meta)
      // Default: pre-select all firms (user can deselect what they don't want)
      setSelected(new Set(json.data.firms.map((f) => f.candidate_id)))
      setFindStatus('idle')
    } catch (err) {
      setFindError(err instanceof Error ? err.message : 'Network error')
      setFindStatus('error')
    }
  }

  async function promoteSelected() {
    if (selectedFirms.length === 0) return
    setPromoteStatus('running')
    setPromoteError(null)
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}/promote-firms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firms: selectedFirms }),
      })
      const json = await safeJson<{ promoted: number; new_companies: number; reused_companies: number; results: PromoteResult[]; errors: string[]; error?: string }>(res)
      if (!res.ok || !json) {
        setPromoteError(json?.error ?? `Request failed (${res.status})`)
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

  async function exportCsv() {
    if (!data || selectedFirms.length === 0) return
    setIsExporting(true)
    try {
      const res = await fetch('/api/prospecting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: data.article, firms: selectedFirms }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `oaki-discovery-${discoveryId}-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      setIsExporting(false)
    }
  }

  // ─── Idle / start state ──────────────────────────────────────────────────
  if (findStatus === 'idle' && !data) {
    return (
      <div style={panelStyle}>
        {alreadyPromotedOpportunityId && (
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={12} /> Already promoted from this Discovery. You can find more firms to attach.
          </div>
        )}
        <button onClick={findFirms} style={primaryButton}>
          Find candidate firms →
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.6 }}>
          Runs Jina → Claude → Tavily → Claude on this article&apos;s URL. Returns 5–8 firms scored for
          Oaki fit. Pick the keepers and promote them — each becomes a Company in your Sheet plus a
          Company-level Opportunity attached to this Discovery. Apollo imports of contacts at those
          companies will auto-attach.
        </p>
        {findError && (
          <div style={errorBox}>{findError}</div>
        )}
      </div>
    )
  }

  // ─── Running state ───────────────────────────────────────────────────────
  if (findStatus === 'running') {
    return (
      <div style={{ ...panelStyle, alignItems: 'center', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <IconLoader size={20} style={{ color: 'var(--accent)' }} />
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Reading article, searching for firms, scoring prospects…
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          Usually 30–60 seconds. Don&apos;t close this tab.
        </div>
      </div>
    )
  }

  // ─── Result state ────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {data && <ArticleSummaryCard article={data.article} sourceUrl={sourceUrl} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={findFirms} style={smallSecondaryButton}>↻ Re-run</button>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>
              Found {sortedFirms.length} firm{sortedFirms.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {meta && <CostEstimateCard meta={meta} />}
        </div>
      </div>

      {/* Selection toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 14px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: someSelected ? 'var(--accent-dim)' : 'var(--surface)',
          borderColor: someSelected ? 'rgba(200,169,110,0.4)' : 'var(--border)',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={toggleAll}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ color: someSelected ? 'var(--accent)' : 'var(--text-muted)', fontWeight: someSelected ? 500 : 400 }}>
            {someSelected ? `${selected.size} selected` : `Select all (${sortedFirms.length})`}
          </span>
        </label>
        {someSelected && (
          <>
            <button
              onClick={promoteSelected}
              disabled={promoteStatus === 'running'}
              style={{ ...primaryButton, padding: '6px 14px', fontSize: 12, alignSelf: 'center' }}
            >
              {promoteStatus === 'running' && <IconLoader size={11} />}
              {promoteStatus === 'running'
                ? `Promoting ${selectedFirms.length}…`
                : `Promote ${selectedFirms.length} to Opportunity`}
            </button>
            <button
              onClick={exportCsv}
              disabled={isExporting}
              style={smallSecondaryButton}
            >
              {isExporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              style={{ ...smallSecondaryButton, marginLeft: 'auto', border: 'none', color: 'var(--text-faint)' }}
            >
              <IconX size={10} /> Clear
            </button>
          </>
        )}
      </div>

      {promoteError && <div style={errorBox}>{promoteError}</div>}

      {/* Promote result summary */}
      {promoteResult && promoteResult.promoted > 0 && (
        <div style={{
          padding: '12px 16px',
          border: '1px solid rgba(76,175,134,0.3)',
          background: 'var(--green-dim)',
          borderRadius: 'var(--r-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--green)' }}>
            <IconCheck size={13} />
            <strong>{promoteResult.promoted}</strong>&nbsp;Opportunit{promoteResult.promoted === 1 ? 'y' : 'ies'} created
            &nbsp;·&nbsp;
            <strong>{promoteResult.new_companies}</strong>&nbsp;new compan{promoteResult.new_companies === 1 ? 'y' : 'ies'}
            {promoteResult.reused_companies > 0 && (<>, <strong>{promoteResult.reused_companies}</strong>&nbsp;existing matched</>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {promoteResult.results.map((r) => (
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
          {promoteResult.errors.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--red)' }}>
              {promoteResult.errors.length} error{promoteResult.errors.length === 1 ? '' : 's'}:&nbsp;
              {promoteResult.errors.join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Firm cards (compact, selectable) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortedFirms.length === 0 ? (
          <div className="empty-state">
            <div>Claude returned no candidate firms for this article.</div>
            <div style={{ fontSize: 11 }}>Re-run, or try the Discovery URL via /import/prospecting directly.</div>
          </div>
        ) : (
          sortedFirms.map((firm) => (
            <FirmRow
              key={firm.candidate_id}
              firm={firm}
              isSelected={selected.has(firm.candidate_id)}
              onToggle={() => toggleOne(firm.candidate_id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function FirmRow({
  firm, isSelected, onToggle,
}: {
  firm: FirmCandidate
  isSelected: boolean
  onToggle: () => void
}) {
  const colors = scoreColors(firm.score)
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto 60px',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        background: isSelected ? 'var(--accent-dim)' : 'var(--surface)',
        border: '1px solid',
        borderColor: isSelected ? 'rgba(200,169,110,0.4)' : 'var(--border)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        aria-label={`Select ${firm.name}`}
        style={{ cursor: 'pointer' }}
      />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{firm.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {firm.country} · {firm.project_type}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Project · {firm.reference_project}
        </div>
      </div>
      <div>
        {firm.website ? (
          <a
            href={firm.website}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
          >
            Site <IconExternalLink size={10} style={{ opacity: 0.6 }} />
          </a>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No site</span>
        )}
      </div>
      <span
        title={`Score ${firm.score}/100`}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          minWidth: 38, height: 24, padding: '0 8px',
          borderRadius: 'var(--r-sm)', fontSize: 12, fontWeight: 700,
          fontFamily: 'SF Mono, ui-monospace, monospace', fontVariantNumeric: 'tabular-nums',
          color: colors.color, background: colors.background, border: `1px solid ${colors.border}`,
        }}
      >
        {firm.score}
      </span>
    </div>
  )
}

function scoreColors(score: number): { color: string; background: string; border: string } {
  if (score >= 85) return { color: 'var(--green)',       background: 'var(--green-dim)',  border: 'rgba(76,175,134,0.3)' }
  if (score >= 65) return { color: 'var(--accent)',      background: 'var(--accent-dim)', border: 'rgba(200,169,110,0.3)' }
  if (score >= 45) return { color: 'var(--yellow)',      background: 'var(--yellow-dim)', border: 'rgba(212,168,67,0.3)' }
  return                  { color: 'var(--text-faint)',  background: 'var(--surface-2)',  border: 'var(--border)' }
}

// ─── Style constants ───────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
}

const primaryButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 18px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--accent)',
  background: 'var(--accent)',
  color: '#000',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

const smallSecondaryButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  fontSize: 12,
  padding: '6px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-muted)',
  cursor: 'pointer',
}

const errorBox: React.CSSProperties = {
  marginTop: 8,
  padding: '8px 12px',
  fontSize: 12,
  color: 'var(--red)',
  background: 'var(--red-dim)',
  border: '1px solid rgba(224,92,92,0.25)',
  borderRadius: 'var(--r-sm)',
}
