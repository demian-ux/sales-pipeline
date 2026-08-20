// Seats queue — Gate 1. Firms whose seat found a verified email wait here for
// Demi's approve (→ lead via POST /api/leads) or reject (with reason). Also
// shows the weekly credit ledger and in-flight waterfalls, so budget state is
// never invisible.

import SeatsQueueClient from './SeatsQueueClient'

export const dynamic = 'force-dynamic'

export default function SeatsPage() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Seats queue</h1>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>
        Verified seats waiting for approval. Approve creates the lead (source seats-worker, stage New Lead).
      </p>
      <SeatsQueueClient />
    </div>
  )
}
