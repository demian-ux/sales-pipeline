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

export async function readTab(tabName: string): Promise<string[][]> {
  const sheets = await getSheets()
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID!,
      range: `${tabName}!A:ZZ`,
    })
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
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID!,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

// Runs `fn` and falls back to `fallback` on any SheetsError, logging the reason.
export async function withFallback<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof SheetsError) {
      console.warn(`[Sheets] Falling back to mock data: ${e.message}`)
      return fallback
    }
    throw e
  }
}

export async function updateRow(tabName: string, rowIndex: number, values: string[]): Promise<void> {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID!,
    range: `${tabName}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
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
