import { getCampaigns } from '@/lib/sheets'
import NewLeadForm from '@/components/leads/NewLeadForm'

export const dynamic = 'force-dynamic'

export default async function NewLeadPage() {
  const campaigns = await getCampaigns()
  return (
    <div style={{ padding: '28px 32px', maxWidth: 760 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>New Lead</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Add a contact to your relationship pipeline.
        </p>
      </div>
      <NewLeadForm campaigns={campaigns} />
    </div>
  )
}
