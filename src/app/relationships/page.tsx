import { getLeads, getCompanies, getOpportunities, getInteractions, getCampaigns } from '@/lib/sheets'
import RelationshipsClient from '@/components/relationships/RelationshipsClient'

export const dynamic = 'force-dynamic'

export default async function RelationshipsPage() {
  const [leads, companies, opportunities, interactions, campaigns] = await Promise.all([
    getLeads(),
    getCompanies(),
    getOpportunities(),
    getInteractions(),
    getCampaigns(),
  ])

  return (
    <RelationshipsClient
      leads={leads}
      companies={companies}
      opportunities={opportunities}
      interactions={interactions}
      campaigns={campaigns}
    />
  )
}
