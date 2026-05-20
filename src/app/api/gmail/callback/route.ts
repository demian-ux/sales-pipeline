import { NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/gmail/client'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/settings?gmail=denied', req.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?gmail=error', req.url))
  }

  try {
    await exchangeCode(code)
    return NextResponse.redirect(new URL('/settings?gmail=connected', req.url))
  } catch (err) {
    console.error('Gmail OAuth callback error:', err)
    return NextResponse.redirect(new URL('/settings?gmail=error', req.url))
  }
}
