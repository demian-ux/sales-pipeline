// POST /api/auth/login — validates the password and sets the session cookie.
// Public (the middleware allows this path through without a session).

import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  isAuthConfigured,
  isPasswordCorrect,
  createSessionCookieValue,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth'

const BodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: 'Auth is not configured (APP_PASSWORD and SESSION_SECRET must be set)' },
      { status: 503 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
  }

  if (!isPasswordCorrect(parsed.data.password)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 })
  }

  const cookieValue = await createSessionCookieValue()
  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  return response
}
