import Link from 'next/link'
import { getCampaigns, getLeads, getOpportunities } from '@/lib/sheets'
import CampaignsClient from '@/components/campaigns/CampaignsClient'
import RestoreDefaultsButton from '@/components/campaigns/RestoreDefaultsButton'
import { Icon } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const [campaigns, leads, opportunities] = await Promise.all([
    getCampaigns(),
    getLeads(),
    getOpportunities(),
  ])

  const activeCount = campaigns.filter((c) => c.status === 'Active').length
  const inCampaigns = leads.filter((l) => l.campaign_id).length

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Pipeline</div>
          <div className="page-title">Campaigns</div>
          <div className="page-sub">
            {activeCount} active {activeCount === 1 ? 'campaign' : 'campaigns'} · {inCampaigns} leads
            in campaigns. Each one is a researched stance, not a sequence.
          </div>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" href="/campaigns/new">
            <Icon name="plus" size={12} /> New campaign
          </Link>
        </div>
      </div>

      {campaigns.length === 0 && (
        <div className="card card-pad" style={{ marginBottom: 24 }}>
          <div className="ink" style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
            No campaigns yet
          </div>
          <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
            Create one with the button above, or restore the four defaults.
          </div>
          <RestoreDefaultsButton />
        </div>
      )}

      <CampaignsClient campaigns={campaigns} leads={leads} opportunities={opportunities} />
    </div>
  )
}
