// Read helpers for the per-lead draft tables (Supabase). Used by the lead
// detail page to merge fresh drafts with legacy insight fields.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { EmailDraft, LinkedInDraft, LetterDraft } from '@/lib/types'

export async function getEmailDraftForLead(leadId: string): Promise<EmailDraft | null> {
  if (!isSupabaseAdminConfigured()) return null
  const { data, error } = await getSupabaseAdmin()
    .from('email_drafts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) {
    console.warn('[drafts] getEmailDraftForLead error:', error.message)
    return null
  }
  return (data as EmailDraft | null) ?? null
}

export async function getLinkedInDraftForLead(leadId: string): Promise<LinkedInDraft | null> {
  if (!isSupabaseAdminConfigured()) return null
  const { data, error } = await getSupabaseAdmin()
    .from('linkedin_drafts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) {
    console.warn('[drafts] getLinkedInDraftForLead error:', error.message)
    return null
  }
  return (data as LinkedInDraft | null) ?? null
}

export async function getLetterDraftForLead(leadId: string): Promise<LetterDraft | null> {
  if (!isSupabaseAdminConfigured()) return null
  const { data, error } = await getSupabaseAdmin()
    .from('letter_drafts')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle()
  if (error) {
    // Tolerate the table not existing until the 2026-06-10 migration runs.
    console.warn('[drafts] getLetterDraftForLead error:', error.message)
    return null
  }
  return (data as LetterDraft | null) ?? null
}
