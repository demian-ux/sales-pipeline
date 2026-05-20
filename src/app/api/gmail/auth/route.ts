import { NextResponse } from 'next/server'
import { getAuthUrl, isGmailConfigured, deleteTokens } from '@/lib/gmail/client'

export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are not configured' },
      { status: 503 },
    )
  }
  return NextResponse.redirect(getAuthUrl())
}

export async function DELETE() {
  try {
    await deleteTokens()
    return NextResponse.json({ disconnected: true })
  } catch (err) {
    console.error('Gmail disconnect error:', err)
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
