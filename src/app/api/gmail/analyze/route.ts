import { NextResponse } from 'next/server'
import { analyzeThread } from '@/lib/gmail/analyze'
import { getLeadById, getCompanyById } from '@/lib/sheets'
import { sessionCache } from '@/lib/sheets/cache'

export async function POST(req: Request) {
  try {
    const { thread_id, lead_id } = await req.json()

    if (!thread_id || !lead_id) {
      return NextResponse.json({ error: 'thread_id and lead_id are required' }, { status: 400 })
    }

    const leadThreads = sessionCache.threads[lead_id] ?? []
    const thread = leadThreads.find((t) => t.thread_id === thread_id)
    if (!thread) {
      return NextResponse.json({ error: 'Thread not found — sync first' }, { status: 404 })
    }

    const lead = await getLeadById(lead_id)
    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const company = await getCompanyById(lead.company_id)
    const analysis = await analyzeThread(thread, lead, company)

    sessionCache.analyses[thread_id] = analysis

    return NextResponse.json({ analysis })
  } catch (err) {
    console.error('Gmail analyze error:', err)
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
