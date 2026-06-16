'use client'

import { useState, useEffect, useCallback } from 'react'
import DiscoveryCard from '@/components/discoveries/DiscoveryCard'
import FilterPanel, { DEFAULT_FILTERS, type DiscoveryFilterState } from '@/components/discoveries/FilterPanel'
import { Empty } from '@/components/ui/primitives'
import { Icon, IconLoader } from '@/components/ui/icons'
import type { Discovery } from '@/lib/types'

// Returns null when the response body isn't JSON (e.g. a Vercel HTML error
// page). Lets callers avoid the "Unexpected token ..." JSON.parse exception
// and surface the HTTP status instead.
async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

const LAST_VISIT_KEY = 'oaki_discoveries_last_visit'

export default function DiscoveriesPage() {
  const [filters, setFilters] = useState<DiscoveryFilterState>(DEFAULT_FILTERS)
  const [discoveries, setDiscoveries] = useState<Discovery[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [ingestMsg, setIngestMsg] = useState('')
  const [supabaseMissing, setSupabaseMissing] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Timestamp of the PREVIOUS visit — discoveries created after it get a NEW
  // marker. Updated to "now" once on mount, so the markers persist for the
  // whole session.
  const [lastVisit, setLastVisit] = useState<number | null>(null)

  useEffect(() => {
    try {
      const prev = localStorage.getItem(LAST_VISIT_KEY)
      setLastVisit(prev ? Number(prev) : null)
      localStorage.setItem(LAST_VISIT_KEY, String(Date.now()))
    } catch {
      // localStorage unavailable — no markers, no problem
    }
  }, [])

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
    if (f.fit_tier)         params.set('fit_tier', f.fit_tier)
    if (f.tenure)           params.set('tenure', f.tenure)
    if (f.sector_fit)       params.set('sector_fit', f.sector_fit)
    if (!f.hide_disqualified) params.set('hide_disqualified', 'false')
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
    setSelected(new Set())
  }, [filters, fetchDiscoveries])

  const setStatus = useCallback(
    async (id: string, status: 'saved' | 'archived' | 'active') => {
      const res = await fetch(`/api/discoveries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) fetchDiscoveries(filters)
    },
    [filters, fetchDiscoveries],
  )

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  async function bulkSetStatus(status: 'saved' | 'archived') {
    if (selected.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/discoveries/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], status }),
      })
      if (res.ok) {
        setSelected(new Set())
        fetchDiscoveries(filters)
      }
    } finally {
      setBulkBusy(false)
    }
  }

  const isNew = useCallback(
    (d: Discovery) => {
      if (lastVisit === null) return false
      const created = d.created_at ? new Date(d.created_at).getTime() : 0
      return created > lastVisit
    },
    [lastVisit],
  )

  async function handleIngest() {
    setIngesting(true)
    setIngestMsg('Starting research…')
    try {
      const res = await fetch('/api/discoveries/ingest', { method: 'POST' })
      if (res.status === 401) {
        setIngestMsg('Session expired — please log in again.')
        setIngesting(false)
        return
      }
      // The server returns JSON; if we got an HTML/text error page instead
      // (e.g. a Vercel 502), `safeJson` returns null and we surface a useful
      // status code instead of "Unexpected token ..." from JSON.parse.
      const data = await safeJson<{ run_id?: string; error?: string }>(res)
      if (res.status === 409 && data?.run_id) {
        // A run is already in progress — attach to it instead of failing.
        setIngestMsg('A run is already in progress — following it…')
        pollRunStatus(data.run_id)
        return
      }
      if (!res.ok) {
        setIngestMsg(`Error: ${data?.error ?? `Request failed (${res.status})`}`)
        setIngesting(false)
        return
      }
      if (!data?.run_id) {
        setIngestMsg('Server did not return a run_id')
        setIngesting(false)
        return
      }
      pollRunStatus(data.run_id)
    } catch (err) {
      setIngestMsg(`Request failed: ${err instanceof Error ? err.message : 'unknown'}`)
      setIngesting(false)
    }
  }

  async function pollRunStatus(runId: string) {
    const POLL_MS = 3000
    const MAX_POLLS = 120 // ~6 minutes
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      try {
        const res = await fetch(`/api/discoveries/ingest/${runId}`)
        if (!res.ok) continue
        const run = await safeJson<{
          status?: 'running' | 'done' | 'failed'
          current_step?: string
          progress_percent?: number
          articles_new?: number
          articles_analyzed?: number
          failed_sources?: string[]
        }>(res)
        if (!run) continue

        if (run.status === 'done') {
          const failedNote = run.failed_sources && run.failed_sources.length > 0
            ? ` · ${run.failed_sources.length} source${run.failed_sources.length === 1 ? '' : 's'} failed: ${run.failed_sources.join(', ')}`
            : ''
          const deferredNote = run.current_step?.includes('deferred')
            ? ' · some articles deferred to next run'
            : ''
          setIngestMsg(`${run.articles_new ?? 0} new from ${run.articles_analyzed ?? 0} analyzed${deferredNote}${failedNote}`)
          fetchDiscoveries(filters)
          setIngesting(false)
          return
        }
        if (run.status === 'failed') {
          setIngestMsg(`Failed: ${run.current_step ?? 'unknown error'}`)
          setIngesting(false)
          return
        }
        setIngestMsg(`${run.current_step ?? 'Working…'} (${run.progress_percent ?? 0}%)`)
      } catch {
        // transient — keep polling
      }
    }
    setIngestMsg('Polling timed out — run may still be in progress, refresh in a minute.')
    setIngesting(false)
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Intelligence</div>
          <div className="page-title">Discoveries</div>
          <div className="page-sub">
            Market signals — articles classified as opportunities. The radar.
          </div>
        </div>
        <div className="page-actions">
          {ingestMsg && (
            <div className="col" style={{ alignItems: 'flex-end', gap: 2, marginRight: 4 }}>
              <span className="micro" style={{ color: 'var(--ink-3)' }}>Research</span>
              <span className="ink-2" style={{ fontSize: 12 }}>{ingestMsg}</span>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={handleIngest}
            disabled={ingesting || supabaseMissing}
          >
            {ingesting ? <IconLoader size={12} /> : <Icon name="sparkle" size={12} />}
            {ingesting ? 'Researching…' : 'Run research'}
          </button>
        </div>
      </div>

      {/* Setup notice */}
      {supabaseMissing && (
        <div
          className="card card-pad"
          style={{ borderColor: 'var(--accent-line)', background: 'var(--accent-soft)', marginBottom: 24 }}
        >
          <div className="accent" style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            Supabase not yet provisioned.
          </div>
          <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Set <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span>,{' '}
            <span className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, and{' '}
            <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> in your env, then run the SQL
            in <span className="mono">supabase/schema.sql</span> against your project.
          </div>
        </div>
      )}

      {/* Body — filters + result list */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <FilterPanel filters={filters} onChange={setFilters} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Result toolbar */}
          <div className="between" style={{ marginBottom: 16 }}>
            <span className="ink" style={{ fontSize: 13, fontWeight: 500 }}>
              {loading
                ? 'Loading…'
                : `${total} ${total === 1 ? 'discovery' : 'discoveries'}`}
            </span>
            <div className="row" style={{ gap: 8 }}>
              {selected.size > 0 && (
                <div className="row" style={{ gap: 6, marginRight: 8 }}>
                  <span className="micro" style={{ color: 'var(--accent)' }}>
                    {selected.size} SELECTED
                  </span>
                  <button
                    className="btn btn-xs"
                    onClick={() => bulkSetStatus('saved')}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? '…' : 'Save'}
                  </button>
                  <button
                    className="btn btn-xs"
                    onClick={() => bulkSetStatus('archived')}
                    disabled={bulkBusy}
                  >
                    {bulkBusy ? '…' : 'Archive'}
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setSelected(new Set(discoveries.map((d) => d.id)))}
                  >
                    All
                  </button>
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </button>
                </div>
              )}
              <span className="micro" style={{ color: 'var(--ink-3)' }}>Sort</span>
              <div className="seg">
                <button
                  className={`seg-btn ${filters.sort_by === 'combined' ? 'active' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, sort_by: 'combined' }))}
                  title="Best match — ICP fit blended with deal score"
                >
                  Best
                </button>
                <button
                  className={`seg-btn ${filters.sort_by === 'score' ? 'active' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, sort_by: 'score' }))}
                  title="Raw deal score (discovery_score)"
                >
                  Deal
                </button>
                <button
                  className={`seg-btn ${filters.sort_by === 'date' ? 'active' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, sort_by: 'date' }))}
                  title="Newest first"
                >
                  Date
                </button>
              </div>
            </div>
          </div>

          {fetchError && !supabaseMissing && (
            <div
              className="card card-pad"
              style={{ borderColor: 'var(--risk-line)', marginBottom: 16 }}
            >
              <span className="risk" style={{ fontSize: 12 }}>{fetchError}</span>
            </div>
          )}

          {!loading && discoveries.length === 0 && !fetchError && !supabaseMissing && (
            <div className="card">
              <Empty title="No discoveries yet.">
                Run the research pipeline to pull fresh market signals.
              </Empty>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {discoveries.map((d) => (
              <DiscoveryCard
                key={d.id}
                discovery={d}
                selected={selected.has(d.id)}
                onToggleSelect={() => toggleSelect(d.id)}
                onStatusChange={setStatus}
                isNew={isNew(d)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
