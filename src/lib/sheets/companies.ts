import type { Company } from '../types'
import { mockCompanies } from '../mock-data'
import { USE_MOCK, readTab, appendRowByMap, rowsToObjects, withFallback } from './client'
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
  if (rows.length === 0) return [...mockCompanies, ...sessionCache.companies]
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
    company_id: `co_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    company_name: name.trim(),
    created_at: nowIso,
    updated_at: nowIso,
    ...hints,
  }
  await createCompany(company)
  return { company, wasNew: true }
}
