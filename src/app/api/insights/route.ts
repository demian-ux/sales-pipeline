import { NextResponse } from 'next/server'
import { getAIInsights, saveAIInsight } from '@/lib/sheets'
import type { AIInsight, IntentLevel, RiskLevel } from '@/lib/types'

const INTENT_LEVELS: IntentLevel[] = ['high', 'medium', 'low']
const RISK_LEVELS: RiskLevel[] = ['high', 'medium', 'low']

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
    const body = await req.json()
    const { lead_id, company_id, summary, why_now, recommended_next_action } = body

    if (!lead_id || !company_id || !summary || !why_now || !recommended_next_action) {
      return NextResponse.json(
        { error: 'lead_id, company_id, summary, why_now, and recommended_next_action are required' },
        { status: 400 }
      )
    }

    const intentLevel = INTENT_LEVELS.includes(body.intent_level) ? body.intent_level : 'low'
    const riskLevel = RISK_LEVELS.includes(body.risk_level) ? body.risk_level : 'medium'

    const insight: AIInsight = {
      insight_id: `ai_${Date.now()}`,
      lead_id,
      company_id,
      opportunity_id: body.opportunity_id || undefined,
      summary,
      why_now,
      intent_level: intentLevel,
      recommended_next_action,
      suggested_email: body.suggested_email || undefined,
      suggested_linkedin_dm: body.suggested_linkedin_dm || undefined,
      discovery_questions: Array.isArray(body.discovery_questions) ? body.discovery_questions : [],
      objections: Array.isArray(body.objections) ? body.objections : [],
      opportunities: Array.isArray(body.opportunities) ? body.opportunities : [],
      risk_level: riskLevel,
      confidence: Number(body.confidence) || 50,
      created_at: new Date().toISOString(),
    }

    await saveAIInsight(insight)
    return NextResponse.json({ insight }, { status: 201 })
  } catch (err) {
    console.error('POST /api/insights error:', err)
    return NextResponse.json({ error: 'Failed to save insight' }, { status: 500 })
  }
}
