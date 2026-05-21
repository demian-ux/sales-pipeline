// Read helpers for the per-lead draft tables (Supabase). Used by the lead
// detail page to merge fresh drafts with legacy insight fields.

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import type { EmailDraft, LinkedInDraft } from '@/lib/types'

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
