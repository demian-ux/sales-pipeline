// Source health tracking (2026-08-25). Every ingestion run stamps each source
// row with the outcome of its fetch, so a dead feed is a queryable fact
// (`sources.health = 'dead'`) instead of a banner someone has to notice.
//
// Requires migration 2026-08-25_source_health.sql; until it's applied every
// write here 42703s and is silently skipped (health is instrumentation —
// never a reason to fail a run).

import { getSupabaseAdmin } from '@/lib/supabase'

// 3+ consecutive zero-article failures → 'dead'. Below that, 'degraded' — one
// bad fetch is usually the publisher having a moment, not a moved endpoint.
export const DEAD_AFTER_FAILURES = 3

export interface SourceOutcome {
  url: string
  ok: boolean
  error?: string
}

export function healthFromFailures(consecutiveFailures: number): 'ok' | 'degraded' | 'dead' {
  if (consecutiveFailures <= 0) return 'ok'
  return consecutiveFailures >= DEAD_AFTER_FAILURES ? 'dead' : 'degraded'
}

/**
 * Stamp fetch outcomes onto the source rows. Matched by url (unique in the
 * schema). Manual lanes (source_type 'ag_offering_plans') are skipped — they
 * fail loudly by design and have no endpoint whose health could improve.
 */
export async function recordSourceOutcomes(outcomes: SourceOutcome[]): Promise<void> {
  if (outcomes.length === 0) return
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  // Read current failure counts in one query; per-row updates after (the
  // source list is ~40 rows, and only failures need the counter).
  const { data: rows, error: readErr } = await supabase
    .from('sources')
    .select('url, source_type, consecutive_failures')
    .in('url', outcomes.map((o) => o.url))
  if (readErr) {
    if (readErr.code !== '42703') console.warn('[source-health] read failed:', readErr.message)
    return
  }
  const byUrl = new Map((rows ?? []).map((r) => [r.url as string, r]))

  await Promise.all(outcomes.map(async (o) => {
    const row = byUrl.get(o.url)
    if (!row || row.source_type === 'ag_offering_plans') return
    const update = o.ok
      ? { last_success_at: now, consecutive_failures: 0, health: 'ok', last_error: null }
      : (() => {
          const failures = ((row.consecutive_failures as number | null) ?? 0) + 1
          return {
            last_failure_at: now,
            consecutive_failures: failures,
            health: healthFromFailures(failures),
            last_error: (o.error ?? 'fetch failed').slice(0, 500),
          }
        })()
    const { error } = await supabase.from('sources').update(update).eq('url', o.url)
    if (error && error.code !== '42703') {
      console.warn(`[source-health] stamp failed for ${o.url}:`, error.message)
    }
  }))
}

const PROBE_TIMEOUT_MS = 10_000

export interface ProbeResult {
  ok: boolean
  items?: number
  error?: string
}

/**
 * Test-fetch a feed URL before saving it as a source: HTTP status + does it
 * parse as a feed with at least one item. Structured (Socrata/manual) sources
 * only check reachability — their payloads aren't RSS.
 */
export async function probeSourceUrl(url: string, sourceType: string): Promise<ProbeResult> {
  if (sourceType === 'ag_offering_plans' || sourceType === 'manual') return { ok: true }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/json, application/xml, text/xml, */*',
      },
    })
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
    const text = await response.text()

    if (sourceType === 'rss') {
      // Lazy import keeps rss-parser out of edge bundles that import this file.
      const { default: Parser } = await import('rss-parser')
      try {
        const feed = await new Parser().parseString(text)
        const items = feed.items?.length ?? 0
        return items > 0
          ? { ok: true, items }
          : { ok: false, items: 0, error: 'Feed parses but has zero items' }
      } catch (err) {
        return { ok: false, error: `Not a parseable feed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    // Socrata / api sources: JSON array expected.
    try {
      const parsed = JSON.parse(text)
      return { ok: true, items: Array.isArray(parsed) ? parsed.length : undefined }
    } catch {
      return { ok: false, error: 'Endpoint responded but not with JSON' }
    }
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? `timeout after ${PROBE_TIMEOUT_MS / 1000}s`
      : err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timeoutId)
  }
}
