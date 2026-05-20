import { getCampaigns } from '@/lib/sheets'
import ApolloImportClient from '@/components/import/ApolloImportClient'

export const dynamic = 'force-dynamic'

export default async function ApolloImportPage() {
  const campaigns = await getCampaigns()
  return <ApolloImportClient campaigns={campaigns} />
}
