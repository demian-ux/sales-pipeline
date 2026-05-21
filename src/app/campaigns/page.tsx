import { getCampaigns, getLeads, getOpportunities } from '@/lib/sheets'
import Link from 'next/link'
import CampaignsClient from '@/components/campaigns/CampaignsClient'
import RestoreDefaultsButton from '@/components/campaigns/RestoreDefaultsButton'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const [campaigns, leads, opportunities] = await Promise.all([
    getCampaigns(),
    getLeads(),
    getOpportunities(),
  ])

  const activeCampaigns = campaigns.filter((c) => c.status === 'Active')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 28,
        gap: 16,
      }}>
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {activeCampaigns.length} active campaigns · {leads.length} leads total
          </p>
        </div>
        <Link
          href="/campaigns/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 16px',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#000',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          + New campaign
        </Link>
      </div>

      {campaigns.length === 0 && (
        <div style={{
          marginBottom: 28,
          padding: 20,
          border: '1px dashed var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              No campaigns yet
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Create a campaign manually with the button above, or restore the four defaults
              you had running before the schema fix.
            </div>
          </div>
          <RestoreDefaultsButton />
        </div>
      )}

      <CampaignsClient
        campaigns={campaigns}
        leads={leads}
        opportunities={opportunities}
      />
    </div>
  )
}
