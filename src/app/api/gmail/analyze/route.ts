import { NextResponse } from 'next/server'
import { analyzeThread } from '@/lib/gmail/analyze'
import { getGmailClient } from '@/lib/gmail/client'
import { parseThread } from '@/lib/gmail/sync'
import { getThread, saveThreadsForLead, saveAnalysis } from '@/lib/gmail/store'
import { getLeadById, getCompanyById } from '@/lib/sheets'

export async function POST(req: Request) {
  try {
    const { thread_id, lead_id } = await req.json()

    if (!thread_id || !lead_id) {
      return NextResponse.json({ error: 'thread_id and lead_id are required' }, { status: 400 })
    }

    const lead = await getLeadById(lead_id)
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Read from the persistent store; if missing (e.g. never synced), fetch
    // the thread live from Gmail instead of failing with "sync first".
    let thread = await getThread(thread_id)
    if (!thread) {
      const gmail = await getGmailClient()
      if (gmail) {
        try {
          const full = await gmail.users.threads.get({ userId: 'me', id: thread_id, format: 'full' })
          thread = parseThread(full.data, lead)
          if (thread) await saveThreadsForLead(lead_id, [thread])
        } catch {
          thread = null
        }
      }
    }
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found — sync first' }, { status: 404 })
    }

    const company = await getCompanyById(lead.company_id)
    const analysis = await analyzeThread(thread, lead, company)

    await saveAnalysis(analysis)

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Gmail analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
