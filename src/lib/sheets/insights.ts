import type { AIInsight } from '../types'
import { mockAIInsights } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'AI_Insights'

export const INSIGHT_COLUMNS = [
  'insight_id', 'lead_id', 'company_id', 'opportunity_id', 'summary', 'why_now',
  'intent_level', 'recommended_next_action', 'suggested_email', 'suggested_linkedin_dm',
  'discovery_questions', 'objections', 'opportunities', 'risk_level', 'confidence',
  'created_at',
] as const

function insightToMap(i: AIInsight): Record<string, string> {
  return {
    insight_id: i.insight_id,
    lead_id: i.lead_id,
    company_id: i.company_id,
    opportunity_id: i.opportunity_id ?? '',
    summary: i.summary,
    why_now: i.why_now,
    intent_level: i.intent_level,
    recommended_next_action: i.recommended_next_action,
    suggested_email: i.suggested_email ?? '',
    suggested_linkedin_dm: i.suggested_linkedin_dm ?? '',
    discovery_questions: JSON.stringify(i.discovery_questions),
    objections: JSON.stringify(i.objections),
    opportunities: JSON.stringify(i.opportunities),
    risk_level: i.risk_level,
    confidence: String(i.confidence),
    created_at: i.created_at,
  }
}

function parseInsight(raw: Record<string, string>): AIInsight {
  return {
    ...(raw as unknown as AIInsight),
    confidence: Number(raw.confidence),
    discovery_questions: safeParseArray(raw.discovery_questions),
    objections: safeParseArray(raw.objections),
    opportunities: safeParseArray(raw.opportunities),
  }
}

function safeParseArray(val?: string): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

export async function getAIInsights(): Promise<AIInsight[]> {
  if (USE_MOCK) return [...mockAIInsights, ...sessionCache.insights]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return [...mockAIInsights, ...sessionCache.insights]
  return rowsToObjects<Record<string, string>>(rows).map(parseInsight)
}

export async function getInsightsForLead(leadId: string): Promise<AIInsight[]> {
  const insights = await getAIInsights()
  return insights.filter((i) => i.lead_id === leadId)
}

export async function saveAIInsight(insight: AIInsight): Promise<void> {
  if (USE_MOCK) {
    sessionCache.insights.unshift(insight)
    return
  }
  await appendRowByMap(TAB, insightToMap(insight), INSIGHT_COLUMNS)
}
