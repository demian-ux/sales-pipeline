import { NextResponse } from 'next/server'
import { recommendLinkedInStrategy } from '@/lib/claude'
import {
  getLeadById,
  getCompanyById,
  getResearchForLead,
  getInteractionsForLead,
  getOpportunitiesForLead,
} from '@/lib/sheets'
import { sessionCache } from '@/lib/sheets/cache'

export async function POST(req: Request) {
  try {
    const { lead_id } = await req.json()
    if (!lead_id) return NextResponse.json({ error: 'lead_id required' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
    }

    const lead = await getLeadById(lead_id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    const [company, findings, interactions, opportunities] = await Promise.all([
      getCompanyById(lead.company_id),
      getResearchForLead(lead_id),
      getInteractionsForLead(lead_id),
      getOpportunitiesForLead(lead_id, lead.company_id),
    ])

    const leadThreads = sessionCache.threads[lead_id] ?? []
    const latestThread = leadThreads
      .map((thread) => ({
        thread,
        analysis: sessionCache.analyses[thread.thread_id],
      }))
      .sort((a, b) => new Date(b.thread.last_message_at).getTime() - new Date(a.thread.last_message_at).getTime())[0]

    const gmailState = latestThread
      ? [
          latestThread.analysis?.state ?? latestThread.thread.inferred_state,
          latestThread.analysis?.intent ? `intent: ${latestThread.analysis.intent}` : '',
          latestThread.analysis?.recommended_response ? `recommended response: ${latestThread.analysis.recommended_response}` : '',
        ].filter(Boolean).join(' | ')
      : undefined

    const strategy = await recommendLinkedInStrategy(
      lead,
      company,
      findings,
      interactions,
      opportunities,
      gmailState
    )

    return NextResponse.json({ strategy })
  } catch (err) {
    console.error('POST /api/ai/linkedin-strategy error:', err)
    return NextResponse.json({ error: 'LinkedIn strategy failed' }, { status: 500 })
  }
}
