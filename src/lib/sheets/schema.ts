// Single source of truth for the canonical headers of every Sheets-backed
// entity. The setup wizard at /settings/sheets compares each tab's actual
// header row against these to surface drift.
//
// Entity write functions (createLead, createCompany, etc.) use these via
// `appendRowByMap` — which aligns values to whatever headers the sheet
// actually has, regardless of order. The canonical headers are used only
// when bootstrapping an empty tab.

import { LEAD_COLUMNS } from './leads'
import { COMPANY_COLUMNS } from './companies'
import { OPPORTUNITY_COLUMNS } from './opportunities'
import { INTERACTION_COLUMNS } from './interactions'
import { INSIGHT_COLUMNS } from './insights'
import { RESEARCH_COLUMNS } from './research'
import { CAMPAIGN_COLUMNS } from './campaigns'
import { readTab, SheetsError } from './client'

export interface SheetSchema {
  tab: string
  canonicalHeaders: readonly string[]
  description: string
}

export const SHEET_SCHEMAS: SheetSchema[] = [
  { tab: 'Leads',             canonicalHeaders: LEAD_COLUMNS,        description: 'People you contact. Sole source of lead data.' },
  { tab: 'Companies',         canonicalHeaders: COMPANY_COLUMNS,     description: 'Firms you engage with. Scored on design quality.' },
  { tab: 'Opportunities',     canonicalHeaders: OPPORTUNITY_COLUMNS, description: 'Lead-attached deals. Promoted from Discoveries when applicable.' },
  { tab: 'Interactions',      canonicalHeaders: INTERACTION_COLUMNS, description: 'Touchpoints (email, LinkedIn, calls, meetings) per lead.' },
  { tab: 'AI_Insights',       canonicalHeaders: INSIGHT_COLUMNS,     description: 'Claude analyses per lead — cached.' },
  { tab: 'Research_Findings', canonicalHeaders: RESEARCH_COLUMNS,    description: 'Structured research notes per company/lead.' },
  { tab: 'Campaigns',         canonicalHeaders: CAMPAIGN_COLUMNS,    description: 'Outreach campaign definitions.' },
]

export type SchemaStatus =
  | { kind: 'match';      tab: string; currentHeaders: string[]; canonicalHeaders: readonly string[] }
  | { kind: 'reordered';  tab: string; currentHeaders: string[]; canonicalHeaders: readonly string[]; missing: string[]; extra: string[] }
  | { kind: 'partial';    tab: string; currentHeaders: string[]; canonicalHeaders: readonly string[]; missing: string[]; extra: string[] }
  | { kind: 'empty';      tab: string; canonicalHeaders: readonly string[] }
  | { kind: 'missing';    tab: string; canonicalHeaders: readonly string[]; error: string }

export interface SchemaCheckResult {
  tab: string
  description: string
  canonicalHeaders: readonly string[]
  status: SchemaStatus
}

function diffHeaders(
  current: string[],
  canonical: readonly string[],
): { missing: string[]; extra: string[]; sameSet: boolean; sameOrder: boolean } {
  const currentSet = new Set(current.map((h) => h.trim()))
  const canonicalSet = new Set(canonical)
  const missing = canonical.filter((h) => !currentSet.has(h))
  const extra = current.filter((h) => h.trim() !== '' && !canonicalSet.has(h.trim()))
  const sameSet = missing.length === 0 && extra.length === 0
  const sameOrder = sameSet && canonical.every((h, i) => current[i]?.trim() === h)
  return { missing, extra, sameSet, sameOrder }
}

export async function checkSheetSchemas(): Promise<SchemaCheckResult[]> {
  const results: SchemaCheckResult[] = []
  for (const schema of SHEET_SCHEMAS) {
    let status: SchemaStatus
    try {
      const rows = await readTab(schema.tab)
      const headers = rows[0] ?? []
      if (headers.length === 0 || headers.every((h) => !h.trim())) {
        status = { kind: 'empty', tab: schema.tab, canonicalHeaders: schema.canonicalHeaders }
      } else {
        const diff = diffHeaders(headers, schema.canonicalHeaders)
        if (diff.sameOrder) {
          status = { kind: 'match', tab: schema.tab, currentHeaders: headers, canonicalHeaders: schema.canonicalHeaders }
        } else if (diff.sameSet) {
          status = { kind: 'reordered', tab: schema.tab, currentHeaders: headers, canonicalHeaders: schema.canonicalHeaders, missing: diff.missing, extra: diff.extra }
        } else {
          status = { kind: 'partial', tab: schema.tab, currentHeaders: headers, canonicalHeaders: schema.canonicalHeaders, missing: diff.missing, extra: diff.extra }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isMissingTab = e instanceof SheetsError && e.code === 'tab_missing'
      status = {
        kind: 'missing',
        tab: schema.tab,
        canonicalHeaders: schema.canonicalHeaders,
        error: isMissingTab ? 'Tab does not exist in your spreadsheet.' : msg,
      }
    }
    results.push({
      tab: schema.tab,
      description: schema.description,
      canonicalHeaders: schema.canonicalHeaders,
      status,
    })
  }
  return results
}
