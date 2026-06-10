// Auth gate for the merged Oaki app.
//
// Behavior:
//   - If APP_PASSWORD / SESSION_SECRET are not both set, auth is OFF — every
//     request passes through. This keeps local dev frictionless before
//     production env vars are wired.
//   - When auth is configured, every non-public path requires a valid session
//     cookie. UI routes redirect to /login; API routes get a 401.
//   - Public paths: /login, /api/auth/*, /api/gmail/callback (Google OAuth
//     redirect — Google can't include our cookie), /api/discoveries/ingest
//     (cron + bearer-protected; no cookie possible).
//   - Always injects an x-pathname header so the root layout can decide
//     whether to render the sidebar (skipped on /login).
//
// Note: Next.js 16 renamed `middleware` → `proxy` and prints a deprecation
// warning on boot. We're sticking with `src/middleware.ts` + `export function
// middleware()` because as of 16.2.6 the new `proxy.ts` convention silently
// fails to register with Turbopack (compiled to the bundle but never added to
// `middleware-manifest.json`, so it never runs). Revisit once that's fixed
// upstream — the codemod is `npx @next/codemod@latest middleware-to-proxy .`

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthConfigured, verifySessionCookieValue, SESSION_COOKIE_NAME } from '@/lib/auth'
import { env } from '@/lib/env'

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/api/gmail/callback',
  '/api/discoveries/ingest',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/'),
  )
}

function passThrough(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

function unauthorizedJson(request: NextRequest): NextResponse {
  const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  res.headers.set('x-pathname', request.nextUrl.pathname)
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Auth off:
  //   - development → pass through (frictionless local dev)
  //   - production  → FAIL CLOSED. A deployed app with no APP_PASSWORD /
  //     SESSION_SECRET would expose every page and paid API route publicly.
  if (!isAuthConfigured()) {
    if (env.NODE_ENV !== 'production') return passThrough(request)
    // Cron/bearer-authenticated ingest does its own auth — let it through so
    // a missing APP_PASSWORD doesn't silently stop scheduled research.
    if (pathname.startsWith('/api/discoveries/ingest')) return passThrough(request)
    return new NextResponse(
      'Auth not configured: set APP_PASSWORD and SESSION_SECRET in the environment.',
      { status: 503, headers: { 'content-type': 'text/plain' } },
    )
  }

  // Always let public paths through (login form, OAuth callback, cron).
  if (isPublic(pathname)) return passThrough(request)

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const ok = await verifySessionCookieValue(cookie)
  if (ok) return passThrough(request)

  // API routes: 401 instead of redirect so fetch() callers can see a real status.
  if (pathname.startsWith('/api/')) return unauthorizedJson(request)

  // UI: redirect to /login, preserving where they were trying to go.
  const loginUrl = new URL('/login', request.url)
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

// Skip static assets + Next internals. Everything else (pages + APIs) flows
// through the proxy so it can gate them.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
