import { getLeads, getResearchFindings } from '@/lib/sheets'
import ResearchClient from '@/components/research/ResearchClient'

export const dynamic = 'force-dynamic'

export default async function ResearchPage() {
  const [leads, findings] = await Promise.all([getLeads(), getResearchFindings()])
  return (
    <div className="page">
      <ResearchClient leads={leads} findings={findings} />
    </div>
  )
}
