import { getLeads, getCompanies, getOpportunities, USE_MOCK } from '@/lib/sheets'
import { loadDashboardSupabaseData } from '@/lib/dashboard/data'
import { sessionCache } from '@/lib/sheets/cache'
import DashboardClient, { type DashboardData } from '@/components/dashboard/DashboardClient'
import { ALL_CARD_IDS } from '@/lib/dashboard/cards'
import { headers } from 'next/headers'
import type { DashboardLayout } from '@/lib/types'

export const dynamic = 'force-dynamic'

const DEFAULT_LAYOUT: DashboardLayout = {
  cards: ALL_CARD_IDS.map((id) => ({ id, visible: true })),
}

async function loadLayout(): Promise<DashboardLayout> {
  // Server-side call to our own layout route — uses Supabase if configured,
  // otherwise falls back to default. Headers are forwarded so the auth
  // middleware sees a real session.
  try {
    const h = await headers()
    const proto = h.get('x-forwarded-proto') ?? 'http'
    const host  = h.get('host') ?? 'localhost:3000'
    const cookie = h.get('cookie') ?? ''
    const res = await fetch(`${proto}://${host}/api/dashboard/layout`, {
      headers: { cookie },
      cache: 'no-store',
    })
    if (!res.ok) return DEFAULT_LAYOUT
    const data = await res.json()
    return (data.layout as DashboardLayout) ?? DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

export default async function DashboardPage() {
  const [leads, companies, opportunities, supabaseData, layout] = await Promise.all([
    getLeads(),
    getCompanies(),
    getOpportunities(),
    loadDashboardSupabaseData(),
    loadLayout(),
  ])

  const threads = Object.values(sessionCache.threads).flat()

  const data: DashboardData = {
    leads,
    companies,
    opportunities,
    threads,
    strongDiscoveries: supabaseData.strongDiscoveries,
    highCandidates: supabaseData.highCandidates,
    snoozedSignals: supabaseData.snoozedSignals,
  }

  return (
    <>
      {USE_MOCK && (
        <div style={{
          position: 'absolute', top: 28, right: 32, zIndex: 1,
          fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)',
          border: '1px solid var(--border)', borderRadius: 5, padding: '4px 10px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          Mock data
        </div>
      )}
      <DashboardClient initialLayout={layout} data={data} />
    </>
  )
}
