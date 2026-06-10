// Edge-compatible session cookie helpers.
//
// Middleware (which runs on the Edge runtime) imports these alongside the
// Node-runtime API routes (`/api/auth/login`, `/api/auth/logout`). Use only
// Web Crypto + TextEncoder — no `node:crypto`, no `Buffer`.
//
// Cookie shape: `<payload_b64>.<signature_b64>`
//   payload   = JSON.stringify({ exp: <epoch seconds> })
//   signature = HMAC-SHA256(SESSION_SECRET, payload_b64), base64url-encoded

import { env } from '@/lib/env'

export const SESSION_COOKIE_NAME = 'oaki_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

interface SessionPayload {
  exp: number
}

// ─── base64url helpers (Edge-safe; avoid Buffer) ────────────────────────────

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const b of arr) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function stringToBase64Url(s: string): string {
  return bytesToBase64Url(new TextEncoder().encode(s))
}

function base64UrlToString(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return atob(padded)
}

// ─── HMAC ───────────────────────────────────────────────────────────────────

async function hmacSha256Base64Url(key: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
  return bytesToBase64Url(signature)
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function isAuthConfigured(): boolean {
  return !!(env.APP_PASSWORD && env.SESSION_SECRET)
}

export async function createSessionCookieValue(): Promise<string> {
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET not configured')
  }
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  }
  const payloadB64 = stringToBase64Url(JSON.stringify(payload))
  const signature = await hmacSha256Base64Url(env.SESSION_SECRET, payloadB64)
  return `${payloadB64}.${signature}`
}

export async function verifySessionCookieValue(value: string | undefined | null): Promise<boolean> {
  if (!value || !env.SESSION_SECRET) return false

  const dotIndex = value.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === value.length - 1) return false

  const payloadB64 = value.slice(0, dotIndex)
  const providedSig = value.slice(dotIndex + 1)

  const expectedSig = await hmacSha256Base64Url(env.SESSION_SECRET, payloadB64)
  if (providedSig !== expectedSig) return false

  try {
    const payload = JSON.parse(base64UrlToString(payloadB64)) as SessionPayload
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

// Verify a submitted password against APP_PASSWORD. Single equality check is
// fine for a single-user app — timing attacks aren't a realistic threat here.
export function isPasswordCorrect(submitted: string): boolean {
  return !!env.APP_PASSWORD && submitted === env.APP_PASSWORD
}

// ─── Ingest auth helper ────────────────────────────────────────────────────
// Shared by /api/discoveries/ingest (POST + GET) and its [runId] sibling so
// they accept the same auth paths consistently.

type IngestAuthRequest = {
  headers: { get: (name: string) => string | null }
  cookies: { get: (name: string) => { value: string } | undefined }
}

export async function isIngestAuthorized(request: IngestAuthRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization')

  // 1. Vercel cron — authenticated via CRON_SECRET. When the env var is set,
  //    Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to scheduled
  //    invocations. The bare x-vercel-cron header is client-spoofable, so it
  //    is only honored while CRON_SECRET is not yet configured (and we log
  //    loudly so it gets configured).
  if (env.CRON_SECRET && authHeader === `Bearer ${env.CRON_SECRET}`) return true
  if (!env.CRON_SECRET && request.headers.get('x-vercel-cron') === '1') {
    console.warn(
      '[auth] Accepting unauthenticated x-vercel-cron header — set CRON_SECRET to close this spoofable path',
    )
    return true
  }

  // 2. Bearer token from env.
  if (env.INGEST_SECRET && authHeader === `Bearer ${env.INGEST_SECRET}`) return true

  // 3. Valid session cookie — same HMAC the middleware uses.
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (cookie && (await verifySessionCookieValue(cookie))) return true

  // 4. Open mode — local development only. In production, unconfigured auth
  //    no longer opens the ingest endpoint (each run spends real API tokens).
  if (!isAuthConfigured() && env.NODE_ENV !== 'production') return true

  return false
}
