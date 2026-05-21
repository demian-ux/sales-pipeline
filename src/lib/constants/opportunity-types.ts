// Canonical list of opportunity types. Used by the Opportunities filter,
// the lead-detail attach dropdown, and the manual-create form (where it
// survives). Keep this as the single source of truth — do not redefine
// inline in components.

export const OPP_TYPES = [
  'New project',
  'Press',
  'Event follow-up',
  'Past client rekindling',
  'Anchor client check-in',
  'Competition',
  'Market expansion',
  'Brand refresh',
  'Manual research',
  'Discovery signal',
  'Other',
] as const

export type OpportunityType = (typeof OPP_TYPES)[number]
