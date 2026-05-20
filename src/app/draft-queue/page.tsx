import { getLeads, getAIInsights, getOpportunities } from '@/lib/sheets'
import { sessionCache } from '@/lib/sheets/cache'
import { isGmailConnected, isGmailConfigured } from '@/lib/gmail/client'
import DraftQueueClient from '@/components/draft-queue/DraftQueueClient'

export const dynamic = 'force-dynamic'

export default async function DraftQueuePage() {
  const [leads, insights, opportunities] = await Promise.all([
    getLeads(),
    getAIInsights(),
    getOpportunities(),
  ])

  const gmailReady = isGmailConfigured() && (await isGmailConnected())
  const workflowActions = [...sessionCache.workflowActions]

  // Only include insights that have at least one draft
  const drafts = insights
    .filter((i) => i.suggested_email || i.suggested_linkedin_dm)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const leadMap = Object.fromEntries(leads.map((l) => [l.lead_id, l]))
  const oppMap = Object.fromEntries(opportunities.map((o) => [o.opportunity_id, o]))

  return (
    <DraftQueueClient
      drafts={drafts}
      leadMap={leadMap}
      oppMap={oppMap}
      gmailReady={gmailReady}
      workflowActions={workflowActions}
    />
  )
}
