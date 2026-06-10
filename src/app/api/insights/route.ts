import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getAIInsights, saveAIInsight } from '@/lib/sheets'
import type { AIInsight, IntentLevel, RiskLevel } from '@/lib/types'

const INTENT_LEVELS: IntentLevel[] = ['high', 'medium', 'low']
const RISK_LEVELS: RiskLevel[] = ['high', 'medium', 'low']

const CreateInsightBody = z.object({
  lead_id: z.string().min(1, 'lead_id is required'),
  company_id: z.string().min(1, 'company_id is required'),
  opportunity_id: z.string().optional(),
  summary: z.string().min(1, 'summary is required'),
  why_now: z.string().min(1, 'why_now is required'),
  recommended_next_action: z.string().min(1, 'recommended_next_action is required'),
  intent_level: z.string().optional(),
  risk_level: z.string().optional(),
  suggested_email: z.string().optional(),
  suggested_linkedin_dm: z.string().optional(),
  discovery_questions: z.array(z.string()).optional(),
  objections: z.array(z.string()).optional(),
  opportunities: z.array(z.string()).optional(),
  confidence: z.coerce.number().min(0, 'confidence must be between 0 and 100').max(100, 'confidence must be between 0 and 100').optional(),
})

export async function GET() {
  try {
    const insights = await getAIInsights()
    return NextResponse.json({ insights })
  } catch (err) {
    console.error('GET /api/insights error:', err)
    return NextResponse.json({ error: 'Failed to fetch insights' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }

    const parsed = CreateInsightBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data
    const { lead_id, company_id, summary, why_now, recommended_next_action } = body

    const intentLevel = INTENT_LEVELS.includes(body.intent_level as IntentLevel) ? (body.intent_level as IntentLevel) : 'low'
    const riskLevel = RISK_LEVELS.includes(body.risk_level as RiskLevel) ? (body.risk_level as RiskLevel) : 'medium'

    const insight: AIInsight = {
      insight_id: `ai_${randomUUID()}`,
      lead_id,
      company_id,
      opportunity_id: body.opportunity_id || undefined,
      summary,
      why_now,
      intent_level: intentLevel,
      recommended_next_action,
      suggested_email: body.suggested_email || undefined,
      suggested_linkedin_dm: body.suggested_linkedin_dm || undefined,
      discovery_questions: body.discovery_questions ?? [],
      objections: body.objections ?? [],
      opportunities: body.opportunities ?? [],
      risk_level: riskLevel,
      confidence: body.confidence ?? 50,
      created_at: new Date().toISOString(),
    }

    await saveAIInsight(insight)
    return NextResponse.json({ insight }, { status: 201 })
  } catch (err) {
    console.error('POST /api/insights error:', err)
    return NextResponse.json({ error: 'Failed to save insight' }, { status: 500 })
  }
}
