// Unified "record a send" routine — one place that closes a draft identically
// for every channel (email, linkedin_dm, letter). Marking a LinkedIn DM sent
// and sending an email produce the same downstream state: the interaction is
// logged, the lead advances, a follow-up is scheduled, and the draft is closed.
// Both dashboard queues and external agents (Cowork) call this via
// POST /api/drafts/{id}/mark-sent instead of orchestrating the writes by hand.
//
// ── On "transactional" ──────────────────────────────────────────────────────
// A draft lives in Supabase; its interaction + lead live in Google Sheets —
// there is no cross-store transaction to enrol them in. Instead this is
// idempotent and self-healing:
//   • The interaction (the durable record of the real send) is written first.
//   • The lead advance is idempotent (pipeline only New Lead → Contacted).
//   • The draft flip to `sent` is the LAST write (the commit) on the most
//     reliable store, so any earlier failure leaves the draft un-sent and a
//     retry re-enters the full routine.
//   • A dedup guard (lead + channel + date + subject) means a retry never logs
//     a second interaction, and an already-sent draft with its interaction on
//     record is a complete no-op. Net effect: exactly-once, safe to re-call.

import { randomUUID } from 'crypto'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { getLeadById, getInteractionsForLead, saveInteraction, updateLead } from '@/lib/sheets'
import { INTERACTION_TYPE_TO_CHANNEL } from '@/lib/vocab'
import type { Interaction, Lead } from '@/lib/types'

interface LeadDraftRow {
  id: string
  lead_id: string
  company_id: string | null
  channel: 'email' | 'linkedin_dm' | 'letter'
  subject: string | null
  body: string
  status: 'draft' | 'approved' | 'sent'
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface MarkSentOptions {
  gmail_thread_id?: string
  gmail_message_id?: string
  followup_days?: number
}

export interface MarkSentResult {
  draft: LeadDraftRow
  interaction: Interaction
  lead: Lead
  already_sent: boolean
}

// Carries an HTTP status so the route can map failures to the right code.
export class MarkSentError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MarkSentError'
    this.status = status
  }
}

const DEFAULT_FOLLOWUP_DAYS = 7

// Interaction subject. Email keeps its real subject line; the others' draft
// "subject" is an internal label, so use a channel default.
const SENT_SUBJECTS: Record<LeadDraftRow['channel'], string> = {
  email: 'Email sent',
  linkedin_dm: 'LinkedIn DM sent',
  letter: 'Letter sent',
}

// Human label used in the lead's next_action note.
const CHANNEL_LABELS: Record<LeadDraftRow['channel'], string> = {
  email: 'Email',
  linkedin_dm: 'LinkedIn DM',
  letter: 'letter',
}

export async function recordDraftSend(
  draftId: string,
  opts: MarkSentOptions = {},
): Promise<MarkSentResult> {
  if (!isSupabaseAdminConfigured()) {
    throw new MarkSentError('Supabase not configured', 503)
  }
  const supabase = getSupabaseAdmin()

  const { data: draftRow, error: draftErr } = await supabase
    .from('lead_drafts')
    .select('*')
    .eq('id', draftId)
    .single()
  if (draftErr || !draftRow) throw new MarkSentError('Draft not found', 404)
  const draft = draftRow as LeadDraftRow

  const lead = await getLeadById(draft.lead_id)
  if (!lead) throw new MarkSentError('Lead not found', 404)

  const channel = INTERACTION_TYPE_TO_CHANNEL[draft.channel] ?? 'Other'
  const today = todayDate()
  const subject =
    draft.channel === 'email'
      ? (draft.subject || SENT_SUBJECTS.email)
      : SENT_SUBJECTS[draft.channel]
  const followupDays =
    typeof opts.followup_days === 'number' && opts.followup_days > 0
      ? Math.floor(opts.followup_days)
      : DEFAULT_FOLLOWUP_DAYS

  // Dedup: has this exact send already been logged? Guards double-taps and
  // retries-after-partial-failure (same lead + channel + date + subject).
  const interactions = await getInteractionsForLead(draft.lead_id)
  const existing = interactions.find(
    (i) =>
      i.channel === channel &&
      (i.sent_at ?? '').slice(0, 10) === today &&
      (i.subject ?? '') === subject,
  )

  // Full idempotent no-op: the draft is already closed AND the send is on
  // record — nothing to do, return current state.
  if (draft.status === 'sent' && existing) {
    return { draft, interaction: existing, lead, already_sent: true }
  }

  // 1) The send record (written first — it's the durable fact of the send).
  let interaction = existing
  if (!interaction) {
    interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: draft.lead_id,
      company_id: lead.company_id,
      channel,
      direction: 'Outbound',
      subject,
      body_summary: (draft.body ?? '').slice(0, 140),
      gmail_thread_id: opts.gmail_thread_id,
      gmail_message_id: opts.gmail_message_id,
      sent_at: today,
      created_at: new Date().toISOString(),
    }
    await saveInteraction(interaction)
  }

  // 2) Advance the lead. Idempotent: pipeline only moves New Lead → Contacted
  // (never downgrades Replied/Discovery/etc.). last_touch is set here in the
  // same write rather than relying on a separate route.
  const leadUpdates: Partial<Lead> = {
    last_touch_date: today,
    next_followup_date: addDays(today, followupDays),
    next_action: `Nudge if no reply (${CHANNEL_LABELS[draft.channel]} sent ${today})`,
    updated_at: new Date().toISOString(),
  }
  if (lead.pipeline_stage === 'New Lead') leadUpdates.pipeline_stage = 'Contacted'
  if (draft.channel === 'linkedin_dm') leadUpdates.linkedin_dm_status = 'DM Sent'
  await updateLead(draft.lead_id, leadUpdates)

  // 3) Commit: close the draft. Last + on the most reliable store, so an
  // earlier failure leaves the draft `draft` and a retry re-runs cleanly.
  let finalDraft = draft
  if (draft.status !== 'sent') {
    const nowIso = new Date().toISOString()
    const { data: flipped, error: flipErr } = await supabase
      .from('lead_drafts')
      .update({ status: 'sent', sent_at: nowIso, updated_at: nowIso })
      .eq('id', draftId)
      .select()
      .single()
    if (flipErr || !flipped) throw new MarkSentError(`Failed to close draft: ${flipErr?.message ?? 'unknown'}`, 500)
    finalDraft = flipped as LeadDraftRow
  }

  return {
    draft: finalDraft,
    interaction,
    lead: { ...lead, ...leadUpdates },
    already_sent: false,
  }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
