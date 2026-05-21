import { google } from 'googleapis'

const SHEET_ID = process.env.GOOGLE_SHEET_ID
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

function isValidPrivateKey(key?: string): boolean {
  // A real RSA private key body is ~1600 chars; placeholders are much shorter
  return !!(key && key.includes('-----BEGIN') && key.length > 500)
}

export const USE_MOCK = !SHEET_ID || !CLIENT_EMAIL || !isValidPrivateKey(PRIVATE_KEY)

function getAuth() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Google credentials not configured (GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY required)')
  }
  return new google.auth.GoogleAuth({
    credentials: { client_email: CLIENT_EMAIL, private_key: PRIVATE_KEY },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

async function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

export class SheetsError extends Error {
  constructor(
    message: string,
    public readonly code: 'tab_missing' | 'api_disabled' | 'permission_denied' | 'unknown'
  ) {
    super(message)
    this.name = 'SheetsError'
  }
}

// ─── Status tracking ───────────────────────────────────────────────────────
// Module-level so the layout can ask "are Sheets healthy?" without making its
// own API call. State is per-serverless-instance (Vercel doesn't share it),
// which is acceptable noise — any failing instance flips the banner on, any
// successful call flips it off.

interface SheetsStatus {
  mode: 'live' | 'mock' | 'degraded'
  lastError: string | null
  lastErrorAt: number | null
}

let lastError: { message: string; at: number } | null = null
const STATUS_FRESH_MS = 10 * 60 * 1000 // forget errors older than 10 min

export function markSheetsError(message: string): void {
  lastError = { message, at: Date.now() }
}

export function clearSheetsError(): void {
  lastError = null
}

export function getSheetsStatus(): SheetsStatus {
  if (USE_MOCK) {
    return { mode: 'mock', lastError: null, lastErrorAt: null }
  }
  if (lastError && Date.now() - lastError.at < STATUS_FRESH_MS) {
    return { mode: 'degraded', lastError: lastError.message, lastErrorAt: lastError.at }
  }
  // Auto-clear stale errors (assume recovery if no recent call has failed)
  if (lastError) lastError = null
  return { mode: 'live', lastError: null, lastErrorAt: null }
}

export async function readTab(tabName: string): Promise<string[][]> {
  const sheets = await getSheets()
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID!,
      range: `${tabName}!A:ZZ`,
    })
    clearSheetsError()
    return (res.data.values as string[][]) ?? []
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('Unable to parse range') || msg.includes('notFound')) {
      throw new SheetsError(`Sheet tab "${tabName}" not found. Add it to your spreadsheet.`, 'tab_missing')
    }
    if (msg.includes('has not been used') || msg.includes('disabled')) {
      throw new SheetsError('Google Sheets API is not enabled in your GCP project. Enable it at console.cloud.google.com → APIs → Google Sheets API.', 'api_disabled')
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      throw new SheetsError('Permission denied. Make sure the service account has access to this spreadsheet.', 'permission_denied')
    }
    throw new SheetsError(msg, 'unknown')
  }
}

export async function appendRow(tabName: string, values: string[]): Promise<void> {
  const sheets = await getSheets()
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID!,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    })
    clearSheetsError()
  } catch (e) {
    markSheetsError(e instanceof Error ? e.message : String(e))
    throw e
  }
}

// Appends a row to a sheet, aligning the values to whatever headers actually
// exist in row 1. Use this for entity writes (createLead, createCompany, …)
// — it's robust to the user having reordered columns or renamed headers in
// the sheet. The previous positional approach would silently misalign data.
//
// If the sheet has no header row, we write `canonicalHeaders` to row 1 first
// so the data row lands in the right place and future reads work.
//
// Fields in `valueMap` that don't match any header in the sheet are silently
// dropped (intentional — the user may have intentionally removed columns).
export async function appendRowByMap(
  tabName: string,
  valueMap: Record<string, string>,
  canonicalHeaders: readonly string[],
): Promise<void> {
  const existing = await readTab(tabName)
  let headers = existing[0]

  // Empty sheet (no header row, or all-blank row 1) — bootstrap with canonical headers
  if (!headers || headers.length === 0 || headers.every((h) => !h.trim())) {
    headers = [...canonicalHeaders]
    await appendRow(tabName, headers)
  }

  const row = headers.map((h) => valueMap[h.trim()] ?? '')
  await appendRow(tabName, row)
}

// Runs `fn` and falls back to `fallback` on any SheetsError, logging the reason
// and marking Sheets as degraded so the UI can surface a banner.
export async function withFallback<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof SheetsError) {
      console.warn(`[Sheets] Falling back to mock data: ${e.message}`)
      markSheetsError(e.message)
      return fallback
    }
    throw e
  }
}

export async function updateRow(tabName: string, rowIndex: number, values: string[]): Promise<void> {
  const sheets = await getSheets()
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID!,
      range: `${tabName}!A${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    })
    clearSheetsError()
  } catch (e) {
    markSheetsError(e instanceof Error ? e.message : String(e))
    throw e
  }
}

// ─── Bulk + delete primitives ──────────────────────────────────────────────

// 0-based column index → A1 letter (A, B, …, Z, AA, AB, …).
export function columnIndexToLetter(zeroBasedIndex: number): string {
  let s = ''
  let n = zeroBasedIndex + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Sheet GIDs are needed for batchUpdate row deletion. Cache so we don't
// re-fetch metadata per call. Per-serverless-instance state — fine for
// single-user; would re-fetch on cold starts.
let sheetIdCache: Record<string, number> | null = null

export async function getSheetIdForTab(tabName: string): Promise<number> {
  if (sheetIdCache && tabName in sheetIdCache) return sheetIdCache[tabName]
  const sheets = await getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID! })
  sheetIdCache = {}
  for (const s of meta.data.sheets ?? []) {
    const title = s.properties?.title
    const sid = s.properties?.sheetId
    if (title && sid !== null && sid !== undefined) sheetIdCache[title] = sid
  }
  if (!(tabName in sheetIdCache)) {
    throw new SheetsError(`Sheet tab "${tabName}" not found`, 'tab_missing')
  }
  return sheetIdCache[tabName]
}

// Delete N rows in one batchUpdate. `sheetRowIndices0` is 0-based row indices
// in our `rows` array (where rows[0] = header row = sheet row 1, rows[1] =
// first data row = sheet row 2, …). The API uses the SAME 0-based indexing
// for deleteDimension.startIndex.
//
// Sorts descending internally so deleting row 5 doesn't shift row 8 to row 7.
export async function deleteRowsAt(tabName: string, sheetRowIndices0: number[]): Promise<void> {
  if (sheetRowIndices0.length === 0) return
  const sheets = await getSheets()
  const sheetId = await getSheetIdForTab(tabName)
  const sorted = [...sheetRowIndices0].sort((a, b) => b - a)
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID!,
      requestBody: {
        requests: sorted.map((idx) => ({
          deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 },
          },
        })),
      },
    })
    clearSheetsError()
  } catch (e) {
    markSheetsError(e instanceof Error ? e.message : String(e))
    throw e
  }
}

// Bulk single-cell updates in one HTTP call. `row` is 1-based (the literal
// sheet row number); `col` is the A1 letter.
export interface CellUpdate {
  tab: string
  row: number
  col: string
  value: string
}

export async function batchUpdateCells(updates: CellUpdate[]): Promise<void> {
  if (updates.length === 0) return
  const sheets = await getSheets()
  try {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID!,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates.map((u) => ({
          range: `${u.tab}!${u.col}${u.row}`,
          values: [[u.value]],
        })),
      },
    })
    clearSheetsError()
  } catch (e) {
    markSheetsError(e instanceof Error ? e.message : String(e))
    throw e
  }
}

export function rowsToObjects<T>(rows: string[][]): T[] {
  if (rows.length < 2) return []
  const [headers, ...dataRows] = rows
  return dataRows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => {
        obj[h.trim()] = row[i] ?? ''
      })
      return obj as unknown as T
    })
}
