import { NextResponse } from 'next/server'
import { getLeadById, getInteractionsForLead, deleteInteraction } from '@/lib/sheets'

// DELETE /api/leads/[id]/interactions/[interactionId] — remove one logged
// interaction (2026-08-27). Before this, a mis-logged row was permanent.
// The lead's last_touch_date is NOT recomputed — it only ever moves forward,
// and a deleted test row rarely defined it; fix by PATCHing the lead if needed.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; interactionId: string }> },
) {
  try {
    const { id, interactionId } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    // Scope check: the row must belong to this lead — a valid interaction id
    // under the wrong lead URL should 404, not delete someone else's history.
    const owned = (await getInteractionsForLead(id)).some((i) => i.interaction_id === interactionId)
    if (!owned) return NextResponse.json({ error: `No interaction ${interactionId} on lead ${id}` }, { status: 404 })
    const deleted = await deleteInteraction(interactionId)
    if (!deleted) return NextResponse.json({ error: `No interaction ${interactionId}` }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    console.error('DELETE /api/leads/[id]/interactions/[interactionId] error:', err)
    return NextResponse.json({ error: 'Failed to delete interaction' }, { status: 500 })
  }
}
