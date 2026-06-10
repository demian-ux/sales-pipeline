import { NextRequest, NextResponse } from 'next/server'
import { getGmailClient, isGmailConfigured, isGmailConnected } from '@/lib/gmail/client'
import { saveWorkflowAction, newWorkflowActionId } from '@/lib/workflow/store'

// POST /api/gmail/create-draft
// Body: { to: string, subject: string, body: string, lead_id?: string }
export async function POST(req: NextRequest) {
  try {
    if (!isGmailConfigured()) {
      return NextResponse.json({ error: 'Gmail OAuth not configured' }, { status: 503 })
    }
    if (!(await isGmailConnected())) {
      return NextResponse.json({ error: 'Gmail not connected — connect in Settings' }, { status: 403 })
    }

    const { to, subject, body, lead_id } = await req.json()
    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }

    const gmail = await getGmailClient()
    if (!gmail) {
      return NextResponse.json({ error: 'Could not initialize Gmail client' }, { status: 500 })
    }

    // RFC 2822 raw message
    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\r\n')

    const encoded = Buffer.from(raw).toString('base64url')

    const result = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded },
      },
    })

    if (lead_id) {
      // Non-fatal: the Gmail draft exists either way.
      try {
        await saveWorkflowAction({
          action_id: newWorkflowActionId(),
          type: 'gmail_draft_created',
          lead_id,
          channel: 'email',
          recorded_at: new Date().toISOString(),
        })
      } catch (err) {
        console.error('create-draft: workflow log failed:', err)
      }
    }

    return NextResponse.json({
      draft_id: result.data.id,
      message: 'Draft created in Gmail — open Gmail to review and send.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create draft'
    // Scope error — user needs to reconnect with compose permission
    if (message.includes('insufficient') || message.includes('scope') || message.includes('403')) {
      return NextResponse.json(
        { error: 'Gmail needs compose permission. Disconnect and reconnect Gmail in Settings.' },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
