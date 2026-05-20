import type { AIInsight } from '../types'
import { mockAIInsights } from '../mock-data'
import { USE_MOCK, readTab, appendRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'AI_Insights'

const COLUMNS = [
  'insight_id', 'lead_id', 'company_id', 'opportunity_id', 'summary', 'why_now',
  'intent_level', 'recommended_next_action', 'suggested_email', 'suggested_linkedin_dm',
  'discovery_questions', 'objections', 'opportunities', 'risk_level', 'confidence',
  'created_at',
] as const

function insightToRow(i: AIInsight): string[] {
  return [
    i.insight_id,
    i.lead_id,
    i.company_id,
    i.opportunity_id ?? '',
    i.summary,
    i.why_now,
    i.intent_level,
    i.recommended_next_action,
    i.suggested_email ?? '',
    i.suggested_linkedin_dm ?? '',
    JSON.stringify(i.discovery_questions),
    JSON.stringify(i.objections),
    JSON.stringify(i.opportunities),
    i.risk_level,
    String(i.confidence),
    i.created_at,
  ]
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
  await appendRow(TAB, insightToRow(insight))
}
