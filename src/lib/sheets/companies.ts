import type { Company } from '../types'
import { mockCompanies } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, updateRow, rowsToObjects, withFallback, deleteRowsAt, batchUpdateCells, columnIndexToLetter } from './client'
import { sessionCache } from './cache'

const TAB = 'Companies'

export const COMPANY_COLUMNS = [
  'company_id', 'company_name', 'website', 'linkedin_company_url', 'industry',
  'location', 'company_size', 'project_type', 'ideal_client_fit', 'fit_reason',
  'design_quality_score', 'visual_identity_score', 'brand_positioning',
  'architectural_style', 'market_position', 'project_scale', 'known_projects',
  'notes', 'created_at', 'updated_at',
] as const

function companyToMap(company: Company): Record<string, string> {
  const map: Record<string, string> = {}
  for (const col of COMPANY_COLUMNS) {
    map[col] = String(company[col as keyof Company] ?? '')
  }
  return map
}

export async function getCompanies(): Promise<Company[]> {
  if (USE_MOCK) return [...mockCompanies, ...sessionCache.companies]
  const rows = await withFallback(() => readTab(TAB), [] as string[][])
  return rowsToObjects<Company>(rows)
}

export async function getCompanyById(companyId: string): Promise<Company | null> {
  const companies = await getCompanies()
  return companies.find((c) => c.company_id === companyId) ?? null
}

export async function createCompany(company: Company): Promise<void> {
  if (USE_MOCK) {
    sessionCache.companies.unshift(company)
    return
  }
  await appendRowByMap(TAB, companyToMap(company), COMPANY_COLUMNS)
}

export async function updateCompany(companyId: string, updates: Partial<Company>): Promise<boolean> {
  if (USE_MOCK) {
    const idx = sessionCache.companies.findIndex((c) => c.company_id === companyId)
    if (idx >= 0) sessionCache.companies[idx] = { ...sessionCache.companies[idx], ...updates, updated_at: new Date().toISOString() }
    return idx >= 0
  }
  const rows = await readTab(TAB, { fresh: true })
  if (rows.length < 2) return false
  const headers = rows[0]
  const rowIndex = rows.findIndex((r) => r[0] === companyId)
  if (rowIndex < 1) return false
  const updated = [...rows[rowIndex]]
  Object.entries(updates).forEach(([key, val]) => {
    const colIndex = headers.indexOf(key)
    if (colIndex >= 0) updated[colIndex] = String(val ?? '')
  })
  await updateRow(TAB, rowIndex + 1, updated)
  return true
}

export async function deleteCompany(companyId: string): Promise<boolean> {
  if (USE_MOCK) {
    const before = sessionCache.companies.length
    sessionCache.companies = sessionCache.companies.filter((c) => c.company_id !== companyId)
    return sessionCache.companies.length < before
  }
  const rows = await readTab(TAB, { fresh: true })
  const rowIndex = rows.findIndex((r) => r[0] === companyId)
  if (rowIndex < 1) return false
  await deleteRowsAt(TAB, [rowIndex])
  return true
}

// Repoint every row in `tab` whose company_id matches one of `fromIds` to
// `toId` (and, when the tab has a company_name column and `toName` is given,
// rewrite that too). One read + one batchUpdate per tab.
async function repointCompanyRefs(
  tab: string,
  fromIds: Set<string>,
  toId: string,
  toName?: string,
): Promise<number> {
  const rows = await readTab(tab, { fresh: true })
  if (rows.length < 2) return 0
  const headers = rows[0]
  const idCol = headers.indexOf('company_id')
  if (idCol < 0) return 0
  const nameCol = toName ? headers.indexOf('company_name') : -1
  const updates: { tab: string; row: number; col: string; value: string }[] = []
  let matched = 0
  for (let i = 1; i < rows.length; i++) {
    if (!fromIds.has(rows[i][idCol])) continue
    matched++
    const sheetRow = i + 1
    updates.push({ tab, row: sheetRow, col: columnIndexToLetter(idCol), value: toId })
    if (nameCol >= 0) updates.push({ tab, row: sheetRow, col: columnIndexToLetter(nameCol), value: toName! })
  }
  if (updates.length > 0) await batchUpdateCells(updates)
  return matched
}

// Merge duplicate Companies: repoint Leads / Opportunities / Interactions from
// the merge_ids onto keep_id, then delete the merged Company rows. The kept
// row's own fields are left untouched — edit them in Sheets if the merged rows
// carried better data.
export async function mergeCompanies(
  keepId: string,
  mergeIds: string[],
): Promise<{ leads_repointed: number; opportunities_repointed: number; interactions_repointed: number; companies_deleted: number }> {
  const keep = await getCompanyById(keepId)
  if (!keep) throw new Error(`keep_id ${keepId} does not exist`)
  const fromIds = new Set(mergeIds.filter((id) => id !== keepId))

  const leads = await repointCompanyRefs('Leads', fromIds, keepId, keep.company_name)
  const opps = await repointCompanyRefs('Opportunities', fromIds, keepId)
  const ints = await repointCompanyRefs('Interactions', fromIds, keepId)

  let deleted = 0
  if (USE_MOCK) {
    const before = sessionCache.companies.length
    sessionCache.companies = sessionCache.companies.filter((c) => !fromIds.has(c.company_id))
    deleted = before - sessionCache.companies.length
  } else {
    const rows = await readTab(TAB, { fresh: true })
    const indices: number[] = []
    for (let i = 1; i < rows.length; i++) {
      if (fromIds.has(rows[i][0])) indices.push(i)
    }
    if (indices.length > 0) await deleteRowsAt(TAB, indices)
    deleted = indices.length
  }
  return { leads_repointed: leads, opportunities_repointed: opps, interactions_repointed: ints, companies_deleted: deleted }
}

// Case-insensitive name match. Returns the existing Company if one already
// exists with the same name, otherwise creates a new one populated from
// the optional hints (website, country/location, notes, etc.) and returns
// that. Used by the Discovery firms-promotion flow + Apollo import.
export async function findOrCreateCompanyByName(
  name: string,
  hints: Partial<Omit<Company, 'company_id' | 'company_name' | 'created_at' | 'updated_at'>> = {},
): Promise<{ company: Company; wasNew: boolean }> {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    throw new Error('Company name is required')
  }

  const existing = (await getCompanies()).find((c) => c.company_name.trim().toLowerCase() === normalized)
  if (existing) {
    return { company: existing, wasNew: false }
  }

  const nowIso = new Date().toISOString()
  const company: Company = {
    company_id: `co_${crypto.randomUUID()}`,
    company_name: name.trim(),
    created_at: nowIso,
    updated_at: nowIso,
    ...hints,
  }
  await createCompany(company)
  return { company, wasNew: true }
}
