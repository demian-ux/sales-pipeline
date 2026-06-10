import { NextResponse } from 'next/server'
import { isGmailConnected, isGmailConfigured, readTokens } from '@/lib/gmail/client'
import { getGmailStoreCounts } from '@/lib/gmail/store'

export async function GET() {
  const configured = isGmailConfigured()
  const connected = configured && (await isGmailConnected())
  const tokens = connected ? await readTokens() : null

  const counts = await getGmailStoreCounts()

  return NextResponse.json({
    configured,
    connected,
    has_refresh_token: !!(tokens?.refresh_token),
    thread_count: counts.threads,
    analysis_count: counts.analyses,
  })
}
