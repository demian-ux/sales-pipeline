import { NextResponse } from 'next/server'
import { isGmailConnected, isGmailConfigured, readTokens } from '@/lib/gmail/client'
import { sessionCache } from '@/lib/sheets/cache'

export async function GET() {
  const configured = isGmailConfigured()
  const connected = configured && (await isGmailConnected())
  const tokens = connected ? await readTokens() : null

  const threadCount = Object.values(sessionCache.threads).reduce((sum, t) => sum + t.length, 0)
  const analysisCount = Object.keys(sessionCache.analyses).length

  return NextResponse.json({
    configured,
    connected,
    has_refresh_token: !!(tokens?.refresh_token),
    thread_count: threadCount,
    analysis_count: analysisCount,
  })
}
