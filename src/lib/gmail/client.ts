// Gmail OAuth client.
//
// Token storage: Supabase-first (single row in `app_secrets` keyed by 'gmail_tokens')
// with a local-file fallback for dev. The local file (`gmail_tokens.json` at repo
// root) is migrated to Supabase on first read once Supabase is configured.
//
// This is critical for Vercel: the deployed filesystem is ephemeral and a local
// JSON file would not survive deploys/restarts.

import { google } from 'googleapis'
import fs from 'fs'
import path from 'path'
import { env } from '@/lib/env'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'

const LOCAL_TOKENS_PATH = path.join(process.cwd(), 'gmail_tokens.json')
const TOKEN_KEY = 'gmail_tokens'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
]

export const OAKI_EMAIL = 'demian@oaki.studio'

// Mirrors googleapis' Credentials shape (which uses `string | null`).
export interface GmailTokens {
  access_token?: string | null
  refresh_token?: string | null
  expiry_date?: number | null
  scope?: string
  token_type?: string | null
  id_token?: string | null
}

export function isGmailConfigured(): boolean {
  return !!(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET)
}

function getOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    env.GOOGLE_OAUTH_REDIRECT_URI,
  )
}

export function getAuthUrl(): string {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    // 'select_account' forces Google's account picker every time so you can
    // pick which Gmail to connect, even if you're already signed into another
    // Google account in the browser. 'consent' still re-prompts for scope
    // grant (needed to receive a refresh_token).
    prompt: 'select_account consent',
  })
}

// ─── Local-file persistence (dev fallback) ──────────────────────────────────

function readTokensFromFile(): GmailTokens | null {
  try {
    if (!fs.existsSync(LOCAL_TOKENS_PATH)) return null
    return JSON.parse(fs.readFileSync(LOCAL_TOKENS_PATH, 'utf-8'))
  } catch {
    return null
  }
}

function writeTokensToFile(tokens: GmailTokens): void {
  try {
    fs.writeFileSync(LOCAL_TOKENS_PATH, JSON.stringify(tokens, null, 2))
  } catch (err) {
    // Vercel's filesystem is read-only — this fails by design in production.
    // The Supabase path is what we actually rely on when deployed.
    console.warn('[gmail] writeTokensToFile failed (expected on read-only fs):', err instanceof Error ? err.message : err)
  }
}

function deleteTokensFromFile(): void {
  try {
    if (fs.existsSync(LOCAL_TOKENS_PATH)) fs.unlinkSync(LOCAL_TOKENS_PATH)
  } catch (err) {
    console.warn('[gmail] deleteTokensFromFile failed:', err instanceof Error ? err.message : err)
  }
}

// ─── Supabase persistence (production) ──────────────────────────────────────

async function readTokensFromSupabase(): Promise<GmailTokens | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('app_secrets')
    .select('value')
    .eq('key', TOKEN_KEY)
    .maybeSingle()
  if (error) {
    console.warn('[gmail] readTokensFromSupabase error:', error.message)
    return null
  }
  return (data?.value ?? null) as GmailTokens | null
}

async function writeTokensToSupabase(tokens: GmailTokens): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('app_secrets')
    .upsert(
      { key: TOKEN_KEY, value: tokens, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
  if (error) console.warn('[gmail] writeTokensToSupabase error:', error.message)
}

async function deleteTokensFromSupabase(): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('app_secrets')
    .delete()
    .eq('key', TOKEN_KEY)
  if (error) console.warn('[gmail] deleteTokensFromSupabase error:', error.message)
}

// ─── Public token API ───────────────────────────────────────────────────────

export async function readTokens(): Promise<GmailTokens | null> {
  if (isSupabaseAdminConfigured()) {
    const fromDb = await readTokensFromSupabase()
    if (fromDb) return fromDb

    // One-time migration: if a local file exists, copy it into Supabase so
    // subsequent reads (including from Vercel where the local file does not
    // exist) succeed.
    const fromFile = readTokensFromFile()
    if (fromFile) {
      console.log('[gmail] Migrating gmail_tokens.json → Supabase app_secrets')
      await writeTokensToSupabase(fromFile)
      return fromFile
    }
    return null
  }
  return readTokensFromFile()
}

export async function writeTokens(tokens: GmailTokens): Promise<void> {
  if (isSupabaseAdminConfigured()) {
    await writeTokensToSupabase(tokens)
    return
  }
  writeTokensToFile(tokens)
}

export async function deleteTokens(): Promise<void> {
  if (isSupabaseAdminConfigured()) {
    await deleteTokensFromSupabase()
  }
  // Also delete any local file — harmless if absent. Keeps the two stores in sync.
  deleteTokensFromFile()
}

export async function isGmailConnected(): Promise<boolean> {
  const tokens = await readTokens()
  return !!tokens?.refresh_token
}

export async function getGmailClient() {
  const tokens = await readTokens()
  if (!tokens?.refresh_token) return null

  const auth = getOAuth2Client()
  auth.setCredentials(tokens)

  // Fire-and-forget token persistence on refresh. The callback is synchronous
  // by design (googleapis); we kick off the async write without blocking.
  auth.on('tokens', (newTokens) => {
    void (async () => {
      const current = (await readTokens()) ?? {}
      await writeTokens({ ...current, ...newTokens })
    })()
  })

  return google.gmail({ version: 'v1', auth })
}

export async function exchangeCode(code: string): Promise<void> {
  const auth = getOAuth2Client()
  const { tokens } = await auth.getToken(code)
  await writeTokens(tokens)
}
