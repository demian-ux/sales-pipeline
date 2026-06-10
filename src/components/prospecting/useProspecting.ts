'use client'

import { useMemo, useState } from 'react'
import type { FirmCandidate, ProspectingResult } from '@/lib/types'
import type { ProspectingMeta } from '@/lib/prospecting/analyze'

interface AnalyzeResponse {
  data: ProspectingResult
  meta: ProspectingMeta
}

export function useProspecting() {
  const [data, setData] = useState<ProspectingResult | null>(null)
  const [meta, setMeta] = useState<ProspectingMeta | null>(null)
  const [discarded, setDiscarded] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedFirms = useMemo<FirmCandidate[]>(() => {
    if (!data) return []
    return data.firms.filter((f) => !discarded.has(f.candidate_id))
  }, [data, discarded])

  async function analyze(url: string, discoveryId?: string) {
    setIsLoading(true)
    setError(null)
    setData(null)
    setMeta(null)
    setDiscarded(new Set())

    try {
      const res = await fetch('/api/prospecting/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, discovery_id: discoveryId || undefined }),
      })
      const json = (await res.json()) as Partial<AnalyzeResponse> & { error?: string }

      if (!res.ok || !json.data || !json.meta) {
        setError(json.error ?? `Request failed (${res.status})`)
        return
      }
      setData(json.data)
      setMeta(json.meta)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setIsLoading(false)
    }
  }

  function toggleFirm(firm: FirmCandidate) {
    setDiscarded((current) => {
      const next = new Set(current)
      if (next.has(firm.candidate_id)) next.delete(firm.candidate_id)
      else next.add(firm.candidate_id)
      return next
    })
  }

  async function exportCsv() {
    if (!data || selectedFirms.length === 0) return
    setIsExporting(true)
    setError(null)

    try {
      const res = await fetch('/api/prospecting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article: data.article, firms: selectedFirms }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        setError(json.error ?? `Export failed (${res.status})`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `oaki-prospecting-${new Date().toISOString().slice(0, 10)}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return {
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
  }
}
