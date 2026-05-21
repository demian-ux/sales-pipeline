// Re-export barrel. Phase 1 of the consolidation merge extracted each prompt
// into its own module under lib/prompts/. New code should import from those
// modules directly. This file remains so the existing callers (API routes that
// have imported from `@/lib/claude` for months) keep working without churn.
//
// When the merge stabilizes, callers can be updated to import from
// lib/prompts/* directly, and this file can be deleted.

export { analyzeLeadWhyNow } from '@/lib/prompts/lead/analyze-why-now'
export { generateEmailDraft } from '@/lib/prompts/lead/generate-email'
export { generateLinkedInDraft } from '@/lib/prompts/lead/generate-linkedin-dm'
export { prepareMeetingPrep } from '@/lib/prompts/lead/prepare-meeting-prep'
export { recommendLinkedInStrategy } from '@/lib/prompts/lead/recommend-linkedin-strategy'
export { prioritizeStakeholders } from '@/lib/prompts/lead/prioritize-stakeholders'
export { extractResearchSignals } from '@/lib/prompts/research/extract-signals'
