import { getAIInsights, getLeads } from '@/lib/sheets'
import InsightsClient from '@/components/insights/InsightsClient'

export const dynamic = 'force-dynamic'

export default async function InsightsPage() {
  const [insights, leads] = await Promise.all([getAIInsights(), getLeads()])

  const leadMap = new Map(leads.map((l) => [l.lead_id, l]))

  const enriched = insights.map((insight) => ({
    ...insight,
    lead: leadMap.get(insight.lead_id),
  }))

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">AI Insights</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {insights.length} {insights.length === 1 ? 'analysis' : 'analyses'} stored
        </p>
      </div>
      <InsightsClient insights={enriched} />
    </div>
  )
}
