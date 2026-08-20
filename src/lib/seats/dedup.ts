// Blocking dedup for the seats worker — ALWAYS runs before any credit is spent
// (guardrail from the 18-ago incident: 3 credits burned on people already in
// cadence). Checks, in order:
//   1. Hard blacklist (firms + people) — silent filter, no seat row noise.
//   2. CRM: firm vs Leads/Companies (engaged or already-worked company), and
//      person vs Leads by email and by name+company.
//   3. The `programados` staging sheet (separate spreadsheet) — a person or
//      firm with a staged send must not be re-sourced.
//
// Fails CLOSED on the CRM check (can't verify ⇒ don't spend), but the
// programados sheet fails OPEN with a loud log — it's a secondary net and its
// spreadsheet may be unshared/renamed without meaning "spend freely elsewhere".

import { google } from 'googleapis'
import { getLeads } from '@/lib/sheets'
import { entityMatches } from '@/lib/discoveries/roster-match'
import { computeExclusion } from '@/lib/firm-pool/exclusion'
import { env } from '@/lib/env'

// Hard blacklist (handoff §2.1). Matched case-insensitively as substrings.
const BLACKLIST_FIRMS = ['norr group']
const BLACKLIST_PEOPLE = ['saif wahab', 'garrett singer', 'grace browse']

export function isBlacklistedFirm(name: string): boolean {
  const n = name.toLowerCase()
  return BLACKLIST_FIRMS.some((b) => n.includes(b))
}

export function isBlacklistedPerson(name: string | null): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return BLACKLIST_PEOPLE.some((b) => n.includes(b))
}

export interface FirmDedupVerdict {
  blocked: boolean
  reason?: string
}

/** Firm-level check: blacklist + engaged/warm CRM account. */
export async function checkFirm(firmName: string): Promise<FirmDedupVerdict> {
  if (isBlacklistedFirm(firmName)) return { blocked: true, reason: 'blacklist' }
  const verdict = await computeExclusion(firmName)
  if (verdict.excluded) return { blocked: true, reason: verdict.reason ?? 'engaged CRM account' }
  return { blocked: false }
}

export interface PersonDedupContext {
  leadEmails: Set<string>
  leadNameCompany: { name: string; company: string }[]
  staged: { names: Set<string>; emails: Set<string>; companies: string[] }
}

/** Load leads + programados once per run; person checks are then in-memory. */
export async function loadPersonDedupContext(): Promise<PersonDedupContext> {
  const leads = await getLeads()
  const leadEmails = new Set(
    leads.map((l) => (l.email ?? '').toLowerCase().trim()).filter(Boolean),
  )
  const leadNameCompany = leads
    .filter((l) => l.full_name)
    .map((l) => ({ name: l.full_name.toLowerCase().trim(), company: (l.company_name ?? '').toLowerCase().trim() }))
  const staged = await readProgramados()
  return { leadEmails, leadNameCompany, staged }
}

export function isPersonDuplicate(
  ctx: PersonDedupContext,
  person: { name: string | null; email: string | null },
  firmName: string,
): { blocked: boolean; reason?: string } {
  if (isBlacklistedPerson(person.name)) return { blocked: true, reason: 'blacklist' }
  const email = (person.email ?? '').toLowerCase().trim()
  if (email && (ctx.leadEmails.has(email) || ctx.staged.emails.has(email))) {
    return { blocked: true, reason: 'email already in CRM/staged' }
  }
  const name = (person.name ?? '').toLowerCase().trim()
  if (name) {
    const hit = ctx.leadNameCompany.some(
      (l) => l.name === name && (l.company === '' || entityMatches(firmName, l.company)),
    )
    if (hit) return { blocked: true, reason: 'name+firm already a lead' }
    if (ctx.staged.names.has(name)) return { blocked: true, reason: 'name staged in programados' }
  }
  if (ctx.staged.companies.some((c) => entityMatches(firmName, c))) {
    return { blocked: true, reason: 'firm has a staged send in programados' }
  }
  return { blocked: false }
}

// ── programados sheet (separate spreadsheet, same service account) ──────────

async function readProgramados(): Promise<PersonDedupContext['staged']> {
  const empty = { names: new Set<string>(), emails: new Set<string>(), companies: [] as string[] }
  const sheetId = env.PROGRAMADOS_SHEET_ID
  if (!sheetId || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY) return empty
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CLIENT_EMAIL,
        private_key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: 'A:Z' })
    const rows = (res.data.values as string[][]) ?? []
    const out = { names: new Set<string>(), emails: new Set<string>(), companies: [] as string[] }
    // Column-agnostic scan: emails by shape, names/companies from all cells is
    // too noisy — use header row when present.
    const headers = (rows[0] ?? []).map((h) => h.toLowerCase().trim())
    const nameCol = headers.findIndex((h) => /name|nombre/.test(h))
    const companyCol = headers.findIndex((h) => /company|empresa|firm/.test(h))
    for (const row of rows.slice(1)) {
      for (const cell of row) {
        const v = (cell ?? '').toLowerCase().trim()
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) out.emails.add(v)
      }
      if (nameCol >= 0 && row[nameCol]?.trim()) out.names.add(row[nameCol].toLowerCase().trim())
      if (companyCol >= 0 && row[companyCol]?.trim()) out.companies.push(row[companyCol].trim())
    }
    return out
  } catch (e) {
    console.warn('[seats] programados sheet unreadable — proceeding without it:', e instanceof Error ? e.message : e)
    return empty
  }
}
