// Event-type gate. The analyzer (lib/prompts/discoveries/analyze.ts) extracts a
// `signal_type`; this module decides which types are off-scope. DROP types are a
// resale, a financing, a completed/opened building, a policy change, a corporate
// PR push, a market roundup, or pure infrastructure — none of which have a future
// imagery window (a project still to be sold or leased from renders). They are
// analyzed (so the decision is auditable) then routed to status='archived' in the
// processor and hard-disqualified in icp.ts. Kept in code, not the prompt, so a
// prompt edit can't silently move the gate. See project_oaki_discovery_icp_scope.

import type { SignalType } from '@/lib/types'

export const DROP_SIGNAL_TYPES: ReadonlySet<SignalType> = new Set<SignalType>([
  'transaction',
  'financing',
  'completion',
  'policy',
  'government_program',
  'corporate_pr',
  'market_roundup',
  'infrastructure',
])

// `other` and any unknown/null value are treated as KEEP — over-include rather
// than silently drop a fuzzy event, matching the pipeline's existing
// "default to watchlist when uncertain" posture.
export function isDropSignalType(signalType: SignalType | string | null | undefined): boolean {
  return !!signalType && DROP_SIGNAL_TYPES.has(signalType as SignalType)
}

// Short labels for the board card + filter. Only the KEEP types and a couple of
// recoverable DROP types need a human label; the rest render via fallback.
export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  new_development:     'New development',
  approval_filing:     'Approval / filing',
  groundbreaking:      'Groundbreaking',
  sales_launch:        'Sales launch',
  branded_partnership: 'Branded partnership',
  redesign:            'Redesign',
  capital_event:       'Capital event',
  transaction:         'Transaction',
  financing:           'Financing',
  completion:          'Completion',
  policy:              'Policy',
  government_program:  'Government program',
  corporate_pr:        'Corporate PR',
  market_roundup:      'Market roundup',
  infrastructure:      'Infrastructure',
  other:               'Other',
}

// KEEP types, in board-presentation order — used to build the signal_type filter.
export const KEEP_SIGNAL_TYPES: readonly SignalType[] = [
  'new_development',
  'approval_filing',
  'groundbreaking',
  'sales_launch',
  'branded_partnership',
  'redesign',
  'capital_event',
]
