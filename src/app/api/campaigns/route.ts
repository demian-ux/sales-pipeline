import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getCampaigns, getLeads, getOpportunities, getInteractions, createCampaign } from '@/lib/sheets'
import type { Campaign, CampaignChannel, CampaignCadence, CampaignStatus } from '@/lib/types'

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
        // interactions are read but not yet exposed; placeholder for future enrichment
        _interactions_known: interactions.length,
      }
    })

    return NextResponse.json({ campaigns: enriched })
  } catch (err) {
    console.error('GET /api/campaigns error:', err)
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
  }
}

const CHANNEL_VALUES = ['Email', 'LinkedIn', 'Letter', 'Phone'] as const satisfies readonly CampaignChannel[]
const CADENCE_VALUES = ['Daily', 'Twice weekly', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] as const satisfies readonly CampaignCadence[]
const STATUS_VALUES = ['Active', 'Paused', 'Archived'] as const satisfies readonly CampaignStatus[]

const CreateBody = z.object({
  name:            z.string().min(1, 'Name is required'),
  description:     z.string().min(1, 'Description is required'),
  target_segment:  z.string().optional().default(''),
  location:        z.string().optional(),
  project_types:   z.string().optional(),
  offer:           z.string().optional(),
  pain_point:      z.string().optional(),
  cta:             z.string().min(1, 'CTA is required'),
  channels:        z.array(z.enum(CHANNEL_VALUES)).default([]),
  cadence:         z.enum(CADENCE_VALUES).default('Weekly'),
  status:          z.enum(STATUS_VALUES).default('Active'),
  owner:           z.string().optional(),
  notes:           z.string().optional(),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = CreateBody.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()
  const campaignId = `cmp_${randomUUID()}`
  const campaign: Campaign = {
    campaign_id:    campaignId,
    name:           parsed.data.name,
    description:    parsed.data.description,
    target_segment: parsed.data.target_segment,
    location:       parsed.data.location,
    project_types:  parsed.data.project_types,
    offer:          parsed.data.offer,
    pain_point:     parsed.data.pain_point,
    cta:            parsed.data.cta,
    channels:       parsed.data.channels,
    cadence:        parsed.data.cadence,
    status:         parsed.data.status,
    owner:          parsed.data.owner,
    notes:          parsed.data.notes,
    created_at:     nowIso,
    updated_at:     nowIso,
  }

  try {
    await createCampaign(campaign)
    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    console.error('POST /api/campaigns error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create campaign' },
      { status: 500 },
    )
  }
}
