import { getLeads, getCompanies, getCampaigns } from '@/lib/sheets'
import RelationshipsClient from '@/components/relationships/RelationshipsClient'

export const dynamic = 'force-dynamic'

export default async function RelationshipsPage() {
  const [leads, companies, campaigns] = await Promise.all([
    getLeads(),
    getCompanies(),
    getCampaigns(),
  ])

  return <RelationshipsClient leads={leads} companies={companies} campaigns={campaigns} />
}
