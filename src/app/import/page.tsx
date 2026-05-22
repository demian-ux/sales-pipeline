import { getCampaigns } from '@/lib/sheets'
import ImportClient from '@/components/import/ImportClient'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const campaigns = await getCampaigns()
  return <ImportClient campaigns={campaigns} />
}
