// discovery_kind normalization (2026-07-10).
//
// The lane that hunts pre-award upstream demand is stored as
// discovery_kind='opportunity_signal' (retune-in-place, June 25 name kept). The
// value-lane consumer + the July 10 handoffs call it 'upstream_signal'. Accept
// both spellings at the API boundary so a headless query on either name returns
// the same rows — the alternative (renaming the stored value) would churn the
// UI toggle, the seeded sources, and 160+ existing rows for no gain.

import type { DiscoveryKind } from '@/lib/types'

// Canonical stored kinds + the accepted input aliases → stored value.
const KIND_ALIASES: Record<string, DiscoveryKind> = {
  upstream_signal:    'opportunity_signal',
  opportunity_signal: 'opportunity_signal',
  project_launch:     'project_launch',
}

/**
 * Normalize a raw `discovery_kind` query/param value to the stored value.
 * - `null`/absent → default board (`project_launch`), matching the UI.
 * - `''` (explicit empty) → `''`, meaning "all kinds" (the board's All mode).
 * - a known alias → its stored value (`upstream_signal` → `opportunity_signal`).
 * - anything else → returned as-is, so an unknown value filters to zero rows
 *   (a silent no-op filter is how a run re-chews already-consumed rows).
 */
export function normalizeDiscoveryKind(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return 'project_launch'
  if (raw === '') return ''
  return KIND_ALIASES[raw] ?? raw
}

/** Ingest `?mode=` counterpart — resolves to a real DiscoveryKind (no empty/all). */
export function normalizeIngestMode(raw: string | null | undefined): DiscoveryKind {
  const resolved = raw ? KIND_ALIASES[raw] : undefined
  return resolved ?? 'project_launch'
}
