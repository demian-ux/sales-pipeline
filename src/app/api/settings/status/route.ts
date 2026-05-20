import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function maskKey(key?: string): string {
  if (!key) return ''
  if (key.length <= 12) return '•'.repeat(key.length)
  return key.slice(0, 6) + '•'.repeat(8) + key.slice(-4)
}

export async function GET() {
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const sheetId = process.env.GOOGLE_SHEET_ID
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY

  // Test Anthropic connection
  let anthropicStatus: 'connected' | 'error' | 'not_configured' = 'not_configured'
  let anthropicError: string | undefined

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      })
      anthropicStatus = 'connected'
    } catch (e) {
      anthropicStatus = 'error'
      anthropicError = e instanceof Error ? e.message : 'Unknown error'
    }
  }

  // Check Google Sheets config (validate structure, don't make a live call)
  const sheetsConfigured = !!(sheetId && clientEmail && privateKey)
  const sheetsStatus: 'connected' | 'error' | 'not_configured' = !sheetId
    ? 'not_configured'
    : !clientEmail || !privateKey
    ? 'error'
    : 'connected'

  const sheetsError =
    sheetId && (!clientEmail || !privateKey)
      ? 'GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY are required.'
      : undefined

  return NextResponse.json({
    anthropic: {
      status: anthropicStatus,
      key_preview: maskKey(anthropicKey),
      error: anthropicError,
    },
    google_sheets: {
      status: sheetsStatus,
      spreadsheet_id: sheetId ?? null,
      key_preview: clientEmail ? `Service account: ${clientEmail}` : '',
      error: sheetsError,
    },
    mock_mode: !sheetsConfigured,
  })
}
