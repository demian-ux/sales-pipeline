// POST /api/leads/batch  — create N leads in one call (2026-08-27).
// PATCH /api/leads/batch — apply per-lead field changes in one call.
// Both return per-item results (lead_id or a field-named error) so a partial
// failure is visible item by item instead of aborting the whole batch —
// today's 15 altas were 15 calls racing a ~3-min session timeout.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { updateLead } from '@/lib/sheets'
import type { Lead } from '@/lib/types'
import { PIPELINE_STAGES, LEAD_STATUSES } from '@/lib/vocab'
import { createLeadFromJson } from '@/lib/leads/create'

const MAX_ITEMS = 100

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const items = Array.isArray(json) ? json : (json as Record<string, unknown>)?.['leads']
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Body must be an array of leads (or { leads: [...] })' }, { status: 400 })
    }
    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Max ${MAX_ITEMS} leads per call` }, { status: 400 })
    }

    // Sequential on purpose: creates share the Sheets tab (dedup reads +
    // appends), and within-batch duplicates should collide deterministically.
    const results = []
    for (const item of items) {
      const r = await createLeadFromJson(item)
      results.push(
        r.ok
          ? { ok: true, lead_id: r.lead.lead_id, lead: r.lead }
          : { ok: false, error: r.error, ...(r.duplicate_of ? { duplicate_of: r.duplicate_of } : {}) },
      )
    }
    const created = results.filter((r) => r.ok).length
    return NextResponse.json(
      { results, created, failed: results.length - created },
      { status: created > 0 ? 201 : 400 },
    )
  } catch (err) {
    console.error('POST /api/leads/batch error:', err)
    return NextResponse.json({ error: 'Failed to create leads' }, { status: 500 })
  }
}

const score = z.coerce.number().min(1, 'Scores must be between 1 and 10').max(10, 'Scores must be between 1 and 10').optional()

// Same whitelist as PATCH /api/leads/[id] — strict, so unknown keys are a
// per-item error instead of a silent drop.
const PatchFields = z.object({
  pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
  relationship_temperature: z.string().optional(),
  lead_status: z.enum(LEAD_STATUSES).optional(),
  campaign_id: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  email: z.string().optional(),
  title: z.string().optional(),
  company_name: z.string().optional(),
  website: z.string().optional(),
  location: z.string().optional(),
  source: z.string().optional(),
  owner: z.string().optional(),
  preferred_communication_style: z.string().optional(),
  last_touch_date: z.string().optional(),
  last_meaningful_touch: z.string().optional(),
  next_action: z.string().optional(),
  next_followup_date: z.string().nullable().transform((v) => v ?? '').optional(),
  known_pain_points: z.string().optional(),
  notes: z.string().optional(),
  held_reason: z.string().optional(),
  held_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'held_until must be YYYY-MM-DD').or(z.literal('')).optional(),
  linkedin_url: z.string().optional(),
  linkedin_connection_status: z.string().optional(),
  linkedin_dm_status: z.string().optional(),
  linkedin_warmth: z.string().optional(),
  last_linkedin_touch_date: z.string().optional(),
  linkedin_notes: z.string().optional(),
  business_fit_score: score,
  taste_score: score,
  relationship_score: score,
  opportunity_score: score,
  priority_score: score,
}).strict()
  .refine(
    (f) => f.pipeline_stage !== 'Held' || !!f.held_reason?.trim(),
    { message: 'held_reason is required when setting stage Held' },
  )

const PatchItem = z.object({
  lead_id: z.string().min(1, 'lead_id is required'),
  changes: PatchFields,
})

export async function PATCH(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const items = Array.isArray(json) ? json : (json as Record<string, unknown>)?.['updates']
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Body must be an array of { lead_id, changes } (or { updates: [...] })' }, { status: 400 })
    }
    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Max ${MAX_ITEMS} updates per call` }, { status: 400 })
    }

    const results = []
    for (const item of items) {
      const parsed = PatchItem.safeParse(item)
      if (!parsed.success) {
        const issue = parsed.error.issues[0]
        const field = issue?.path?.join('.')
        results.push({ ok: false, lead_id: (item as Record<string, unknown>)?.['lead_id'] ?? null, error: field ? `${field}: ${issue?.message}` : issue?.message ?? 'invalid' })
        continue
      }
      const { lead_id, changes } = parsed.data
      const updates: Partial<Lead> = { ...changes, updated_at: new Date().toISOString() } as Partial<Lead>
      const r = await updateLead(lead_id, updates)
      if (!r.ok) {
        results.push({ ok: false, lead_id, error: 'Lead not found' })
      } else {
        results.push({
          ok: true,
          lead_id,
          ...(r.unwritten.length > 0 ? { warning: `columns missing in sheet, not written: ${r.unwritten.join(', ')}` } : {}),
        })
      }
    }
    const updated = results.filter((r) => r.ok).length
    return NextResponse.json({ results, updated, failed: results.length - updated })
  } catch (err) {
    console.error('PATCH /api/leads/batch error:', err)
    return NextResponse.json({ error: 'Failed to update leads' }, { status: 500 })
  }
}
