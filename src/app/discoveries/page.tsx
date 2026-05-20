'use client'

import { useState, useEffect, useCallback } from 'react'
import DiscoveryCard from '@/components/discoveries/DiscoveryCard'
import FilterPanel, { DEFAULT_FILTERS, type DiscoveryFilterState } from '@/components/discoveries/FilterPanel'
import { IconRefresh, IconLoader, IconTrendingUp, IconCalendar } from '@/components/ui/icons'
import type { Discovery } from '@/lib/types'

export default function DiscoveriesPage() {
  const [filters, setFilters] = useState<DiscoveryFilterState>(DEFAULT_FILTERS)
  const [discoveries, setDiscoveries] = useState<Discovery[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const [supabaseMissing, setSupabaseMissing] = useState(false)

  const fetchDiscoveries = useCallback(async (f: DiscoveryFilterState) => {
    setLoading(true)
    setFetchError(null)

    const params = new URLSearchParams()
    if (f.region)           params.set('region', f.region)
    if (f.country)          params.set('country', f.country)
    if (f.city)             params.set('city', f.city)
    if (f.sector)           params.set('sector', f.sector)
    if (f.opportunity_type) params.set('opportunity_type', f.opportunity_type)
    if (f.client_type)      params.set('client_type', f.client_type)
    if (f.score_min > 0)    params.set('score_min', String(f.score_min))
    if (f.source)           params.set('source', f.source)
    if (f.date_from)        params.set('date_from', f.date_from)
    if (f.date_to)          params.set('date_to', f.date_to)
    if (f.status)           params.set('status', f.status)
    if (f.search)           params.set('search', f.search)
    params.set('sort_by', f.sort_by)
    params.set('limit', '50')

    try {
      const res = await fetch(`/api/discoveries?${params}`)
      const data = await res.json()
      if (res.status === 503) {
        setSupabaseMissing(true)
        setDiscoveries([])
        setTotal(0)
        return
      }
      setSupabaseMissing(false)
      if (!res.ok) {
        setFetchError(data.error ?? `Request failed (${res.status})`)
        setDiscoveries([])
        setTotal(0)
        return
      }
      setDiscoveries(data.discoveries ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error')
      setDiscoveries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDiscoveries(filters)
  }, [filters, fetchDiscoveries])

  async function handleIngest() {
    setIngesting(true)
    setIngestMsg('Researching…')
    try {
      // No bearer header on this fetch — server route only accepts manual POST
      // with the secret. Surface a hint for now; first real run will be cron-triggered.
      const res = await fetch('/api/discoveries/ingest', { method: 'POST' })
      const data = await res.json()
      if (res.status === 401) {
        setIngestMsg('Session expired — please log in again.')
        return
      }
      if (!res.ok) {
        setIngestMsg(`Error: ${data.error ?? `Request failed (${res.status})`}`)
        return
      }
      const failNote = data.failed_sources?.length
        ? ` (${data.failed_sources.length} source${data.failed_sources.length > 1 ? 's' : ''} failed)`
        : ''
      setIngestMsg(`${data.articles_new} new from ${data.articles_analyzed} analyzed${failNote}`)
      fetchDiscoveries(filters)
    } catch (err) {
      setIngestMsg(`Request failed: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setIngesting(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-faint)',
            marginBottom: 4,
          }}>
            Market Signals
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Discoveries</h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Architecture, real estate, hospitality, infrastructure — analyzed via RSS + Claude.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {ingestMsg && (
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{ingestMsg}</span>
          )}
          {!loading && total > 0 && (
            <span style={{
              fontSize: 11,
              fontFamily: 'SF Mono, ui-monospace, monospace',
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {total}
            </span>
          )}
          <button
            onClick={handleIngest}
            disabled={ingesting || supabaseMissing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontSize: 11,
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: ingesting || supabaseMissing ? 'default' : 'pointer',
              opacity: ingesting || supabaseMissing ? 0.4 : 1,
            }}
          >
            {ingesting ? <IconLoader size={12} /> : <IconRefresh size={12} />}
            {ingesting ? 'Researching…' : 'Run research'}
          </button>
        </div>
      </div>

      {/* Setup notice */}
      {supabaseMissing && (
        <div style={{
          padding: 16,
          background: 'var(--accent-dim)',
          border: '1px solid rgba(200,169,110,0.3)',
          borderRadius: 'var(--r-md)',
          fontSize: 12,
          color: 'var(--text)',
          lineHeight: 1.6,
        }}>
          <strong style={{ color: 'var(--accent)' }}>Supabase not yet provisioned.</strong>
          <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
            Set <code style={{ fontFamily: 'SF Mono, monospace', fontSize: 11, padding: '1px 4px', background: 'var(--surface-2)', borderRadius: 3 }}>NEXT_PUBLIC_SUPABASE_URL</code>,&nbsp;
            <code style={{ fontFamily: 'SF Mono, monospace', fontSize: 11, padding: '1px 4px', background: 'var(--surface-2)', borderRadius: 3 }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and&nbsp;
            <code style={{ fontFamily: 'SF Mono, monospace', fontSize: 11, padding: '1px 4px', background: 'var(--surface-2)', borderRadius: 3 }}>SUPABASE_SERVICE_ROLE_KEY</code> in your env,
            then run the SQL in <code style={{ fontFamily: 'SF Mono, monospace', fontSize: 11, padding: '1px 4px', background: 'var(--surface-2)', borderRadius: 3 }}>supabase/schema.sql</code> against your project.
          </div>
        </div>
      )}

      {/* Body — filters + cards */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
        <div style={{
          width: 220,
          flexShrink: 0,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}>
          <FilterPanel filters={filters} onChange={setFilters} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Sort toolbar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 0',
          }}>
            <span style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              fontFamily: 'SF Mono, ui-monospace, monospace',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {loading ? 'Loading…' : `${total} ${total === 1 ? 'result' : 'results'}`}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <SortButton
                active={filters.sort_by === 'score'}
                onClick={() => setFilters((f) => ({ ...f, sort_by: 'score' }))}
                icon={<IconTrendingUp size={11} />}
                label="Score"
              />
              <SortButton
                active={filters.sort_by === 'date'}
                onClick={() => setFilters((f) => ({ ...f, sort_by: 'date' }))}
                icon={<IconCalendar size={11} />}
                label="Date"
              />
            </div>
          </div>

          {fetchError && !supabaseMissing && (
            <div style={{
              padding: 12,
              fontSize: 12,
              color: 'var(--red)',
              background: 'var(--red-dim)',
              border: '1px solid rgba(224,92,92,0.2)',
              borderRadius: 'var(--r-md)',
            }}>
              {fetchError}
            </div>
          )}

          {!loading && discoveries.length === 0 && !fetchError && !supabaseMissing && (
            <div className="empty-state">
              <div style={{ marginBottom: 6, color: 'var(--text-muted)' }}>No discoveries yet.</div>
              <div style={{ fontSize: 11 }}>
                Run the ingestion pipeline (cron or manual) to pull fresh signals.
              </div>
            </div>
          )}

          <div style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          }}>
            {discoveries.map((d) => <DiscoveryCard key={d.id} discovery={d} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function SortButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        padding: '4px 8px',
        borderRadius: 'var(--r-xs)',
        border: 'none',
        background: active ? 'var(--surface-2)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-faint)',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
