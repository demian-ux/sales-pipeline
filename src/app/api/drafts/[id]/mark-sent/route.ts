// POST /api/drafts/[id]/mark-sent — the unified, idempotent "record a send"
// hook. One call closes the draft, logs the interaction, advances the lead and
// schedules a follow-up, identically for every channel. Both dashboard queues
// and external agents call this instead of orchestrating PATCH + POST + PATCH.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordDraftSend, MarkSentError } from '@/lib/drafts/mark-sent'

const Body = z
  .object({
    gmail_thread_id: z.string().optional(),
    gmail_message_id: z.string().optional(),
    followup_days: z.number().int().positive().optional(),
  })
  .strict()

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Body is optional — tolerate an empty/absent payload.
  let json: unknown = {}
  try {
    json = await req.json()
  } catch {
    json = {}
  }
  const parsed = Body.safeParse(json ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  try {
    const result = await recordDraftSend(id, parsed.data)
    return NextResponse.json({
      draft: result.draft,
      interaction: result.interaction,
      lead: result.lead,
      already_sent: result.already_sent,
    })
  } catch (err) {
    if (err instanceof MarkSentError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/drafts/[id]/mark-sent error:', err)
    return NextResponse.json({ error: 'Failed to mark draft sent' }, { status: 500 })
  }
}
