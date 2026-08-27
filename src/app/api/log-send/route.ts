// POST /api/log-send — compound "I sent an email" logger (2026-08-27).
// One call does what used to take 3–5: resolve the lead by email (optionally
// creating it), log the interaction, advance the pipeline stage, and set the
// +7d follow-up. Idempotent on (email, gmail_thread_id, sent_at): a replay
// returns 200 { already_logged: true } and changes nothing.
//
// Built for the daily send-log and the Friday Gmail↔CRM reconciliation, where
// 49 sends used to be ~150 calls with manual resume after timeouts.

import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeads, getInteractionsForLead, saveInteraction, updateLead } from '@/lib/sheets'
import type { Interaction, Lead, PipelineStage } from '@/lib/types'
import { INTERACTION_DIRECTIONS } from '@/lib/vocab'
import { createLeadFromJson } from '@/lib/leads/create'

// Stages a first-touch send advances to Contacted. Later stages (Replied,
// Discovery, …) are real conversation state — a logged send never regresses them.
const ADVANCE_FROM: PipelineStage[] = ['New Lead', 'Held', 'Nurture', 'Dormant']

const Body = z.object({
  email: z.string().email('email must be a valid address'),
  subject: z.string().min(1, 'subject is required'),
  gmail_thread_id: z.string().min(1, 'gmail_thread_id is required'),
  sent_at: z.string().min(1, 'sent_at is required'),
  direction: z.enum(INTERACTION_DIRECTIONS).optional(),
  create_if_missing: z
    .object({
      full_name: z.string().min(1, 'create_if_missing.full_name is required'),
      company: z.string().min(1, 'create_if_missing.company is required'),
      title: z.string().optional(),
      notes: z.string().optional(),
      source: z.string().optional(),
    })
    .optional(),
})

function toDateOnly(s: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : new Date(s).toISOString().slice(0, 10)
}

function plusDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = Body.safeParse(json)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path?.join('.')
      return NextResponse.json({ error: issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data
    const emailNorm = body.email.toLowerCase().trim()
    const sentAt = toDateOnly(body.sent_at)
    if (Number.isNaN(new Date(sentAt).getTime())) {
      return NextResponse.json({ error: 'sent_at: must be an ISO date or timestamp' }, { status: 400 })
    }

    // 1) Resolve the lead by exact email.
    let lead = (await getLeads()).find((l) => (l.email ?? '').toLowerCase().trim() === emailNorm)
    let leadCreated = false
    if (!lead) {
      if (!body.create_if_missing) {
        return NextResponse.json(
          { error: `No lead with email ${body.email}. Pass create_if_missing to create one.` },
          { status: 404 },
        )
      }
      const created = await createLeadFromJson({
        full_name: body.create_if_missing.full_name,
        company: body.create_if_missing.company,
        title: body.create_if_missing.title,
        notes: body.create_if_missing.notes,
        source: body.create_if_missing.source ?? 'log-send',
        email: body.email,
      })
      if (!created.ok) {
        return NextResponse.json({ error: `create_if_missing: ${created.error}` }, { status: created.status })
      }
      lead = created.lead
      leadCreated = true
    }

    // 2) Idempotency: same (lead, thread, sent_at) → return the existing log.
    const existing = (await getInteractionsForLead(lead.lead_id)).find(
      (i) => i.gmail_thread_id === body.gmail_thread_id && (i.sent_at ?? '').slice(0, 10) === sentAt,
    )
    if (existing) {
      return NextResponse.json(
        { already_logged: true, interaction: existing, lead_id: lead.lead_id, lead_created: false },
        { status: 200 },
      )
    }

    // 3) Log the interaction.
    const interaction: Interaction = {
      interaction_id: `int_${randomUUID()}`,
      lead_id: lead.lead_id,
      company_id: lead.company_id,
      channel: 'Email',
      direction: body.direction ?? 'Outbound',
      subject: body.subject,
      gmail_thread_id: body.gmail_thread_id,
      sent_at: sentAt,
      created_at: new Date().toISOString(),
    }
    await saveInteraction(interaction)

    // 4) Advance state: stage → Contacted (from pre-conversation stages only),
    // touch clock forward-only, follow-up at +7d.
    const updates: Partial<Lead> = {
      updated_at: new Date().toISOString(),
      next_followup_date: plusDays(sentAt, 7),
    }
    const stage = lead.pipeline_stage
    if (stage && ADVANCE_FROM.includes(stage)) updates.pipeline_stage = 'Contacted'
    if (!lead.last_touch_date || new Date(sentAt) >= new Date(lead.last_touch_date)) {
      updates.last_touch_date = sentAt
    }
    const upd = await updateLead(lead.lead_id, updates)

    return NextResponse.json(
      {
        already_logged: false,
        lead_id: lead.lead_id,
        lead_created: leadCreated,
        interaction,
        lead_updates: updates,
        ...(upd.unwritten.length > 0 ? { warning: `Leads tab is missing columns; not written: ${upd.unwritten.join(', ')}` } : {}),
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('POST /api/log-send error:', err)
    return NextResponse.json({ error: 'Failed to log send' }, { status: 500 })
  }
}
