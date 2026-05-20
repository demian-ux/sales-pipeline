import { NextResponse } from 'next/server'
import { updateOpportunity } from '@/lib/sheets'
import type { Opportunity } from '@/lib/types'

const ALLOWED_FIELDS: (keyof Opportunity)[] = ['status', 'urgency', 'confidence', 'recommended_action']

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const updates: Partial<Opportunity> = {}
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(updates as any)[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    await updateOpportunity(id, updates)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/opportunities/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
  }
}
