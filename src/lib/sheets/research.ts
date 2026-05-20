import type { ResearchFinding } from '../types'
import { mockResearchFindings } from '../mock-data'
import { USE_MOCK, readTab, appendRow, rowsToObjects, withFallback } from './client'
import { sessionCache } from './cache'

const TAB = 'Research_Findings'

const COLUMNS = [
  'finding_id', 'company_id', 'lead_id', 'source_type', 'source_url',
  'research_summary', 'design_observations', 'market_positioning',
  'visual_identity_notes', 'signals_detected', 'created_at',
] as const

function findingToRow(f: ResearchFinding): string[] {
  return COLUMNS.map((col) => String(f[col as keyof ResearchFinding] ?? ''))
}

export async function getResearchFindings(): Promise<ResearchFinding[]> {
  if (USE_MOCK) return [...mockResearchFindings, ...sessionCache.research]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  if (rows.length === 0) return [...mockResearchFindings, ...sessionCache.research]
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
  await appendRow(TAB, findingToRow(finding))
}
