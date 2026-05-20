import { NextResponse } from 'next/server'
import { getCampaigns, getLeads, getOpportunities, getInteractions } from '@/lib/sheets'

export async function GET() {
  try {
    const [campaigns, leads, opportunities, interactions] = await Promise.all([
      getCampaigns(),
      getLeads(),
      getOpportunities(),
      getInteractions(),
    ])

    const enriched = campaigns.map((campaign) => {
      const campaignLeads = leads.filter((l) => l.campaign_id === campaign.campaign_id)

      const stageBreakdown: Record<string, number> = {}
      campaignLeads.forEach((l) => {
        stageBreakdown[l.pipeline_stage] = (stageBreakdown[l.pipeline_stage] ?? 0) + 1
      })

      const openOpps = opportunities.filter(
        (o) => o.campaign_id === campaign.campaign_id && o.status === 'Open'
      )

      const dueFollowups = campaignLeads.filter((l) => {
        if (!l.next_followup_date) return false
        return new Date(l.next_followup_date) <= new Date()
      })

      const lastTouches = campaignLeads
        .filter((l) => l.last_touch_date)
        .map((l) => l.last_touch_date!)
        .sort()
        .reverse()

      return {
        ...campaign,
        leads: campaignLeads,
        stage_breakdown: stageBreakdown,
        open_opportunities: openOpps.length,
        due_followups: dueFollowups.length,
        total_leads: campaignLeads.length,
        last_activity: lastTouches[0] ?? null,
      }
    })

    return NextResponse.json({ campaigns: enriched })
  } catch (err) {
    console.error('GET /api/campaigns error:', err)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}
