import type { ResearchFinding } from '../types'
import { mockResearchFindings } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Research_Findings'

export const RESEARCH_COLUMNS = [
  'finding_id', 'company_id', 'lead_id', 'source_type', 'source_url',
  'research_summary', 'design_observations', 'market_positioning',
  'visual_identity_notes', 'signals_detected', 'created_at',
] as const

function findingToMap(f: ResearchFinding): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of RESEARCH_COLUMNS) {
    map[col] = String(f[col as keyof ResearchFinding] ?? '')
  }
  return map
}

export async function getResearchFindings(): Promise<ResearchFinding[]> {
  if (USE_MOCK) return [...mockResearchFindings, ...sessionCache.research]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  return rowsToObjects<ResearchFinding>(rows)
}

export async function getResearchForLead(leadId: string): Promise<ResearchFinding[]> {
  const findings = await getResearchFindings()
  return findings.filter((f) => f.lead_id === leadId)
}

export async function saveResearchFinding(finding: ResearchFinding): Promise<void> {
  if (USE_MOCK) {
    sessionCache.research.unshift(finding)
    return
  }
  await appendRowByMap(TAB, findingToMap(finding), RESEARCH_COLUMNS)
}
