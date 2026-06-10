import { getLeads, getCompanies, getCampaigns, getOpportunities } from '@/lib/sheets'
import RelationshipsClient from '@/components/relationships/RelationshipsClient'

export const dynamic = 'force-dynamic'

export default async function RelationshipsPage() {
  const [leads, companies, campaigns, opportunities] = await Promise.all([
    getLeads(),
    getCompanies(),
    getCampaigns(),
    getOpportunities(),
  ])

  // Open-opportunity count per lead so attachments are visible from the roster.
  const openOppCounts: Record<string, number> = {}
  for (const o of opportunities) {
    if (o.status !== 'Open' || !o.lead_id) continue
    openOppCounts[o.lead_id] = (openOppCounts[o.lead_id] ?? 0) + 1
  }

  return (
    <RelationshipsClient
      leads={leads}
      companies={companies}
      campaigns={campaigns}
      openOppCounts={openOppCounts}
    />
  )
}
