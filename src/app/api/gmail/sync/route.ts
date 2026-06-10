import { NextResponse } from 'next/server'
import { getGmailClient } from '@/lib/gmail/client'
import { syncThreadsForLead } from '@/lib/gmail/sync'
import { saveThreadsForLead } from '@/lib/gmail/store'
import { getLeads } from '@/lib/sheets'

export async function POST() {
  try {
    const gmail = await getGmailClient()
    if (!gmail) {
      return NextResponse.json({ error: 'Gmail not connected' }, { status: 401 })
    }

    const leads = await getLeads()
    const leadsWithEmail = leads.filter((l) => l.email)

    let synced = 0
    let total = 0
    const errors: string[] = []

    for (const lead of leadsWithEmail) {
      const threads = await syncThreadsForLead(lead, gmail)
      try {
        await saveThreadsForLead(lead.lead_id, threads)
        synced++
        total += threads.length
      } catch (err) {
        errors.push(`${lead.full_name}: ${err instanceof Error ? err.message : 'save failed'}`)
      }
    }

    return NextResponse.json({
      synced_leads: synced,
      total_threads: total,
      synced_at: new Date().toISOString(),
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err) {
    console.error('Gmail sync error:', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
