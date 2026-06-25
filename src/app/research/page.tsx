import { Suspense } from 'react'
import { getLeads, getResearchFindings } from '@/lib/sheets'
import ResearchClient from '@/components/research/ResearchClient'

export const dynamic = 'force-dynamic'

export default function ResearchPage() {
  return (
    <div className="page">
      <Suspense fallback={<ResearchSkeleton />}>
        <ResearchData />
      </Suspense>
    </div>
  )
}

// The two full Google Sheets reads (getLeads + getResearchFindings) happen here,
// OFF the initial render path. The page shell + skeleton stream to the browser
// immediately; this content streams in when the reads resolve — so the renderer
// never blocks on Sheets (the previous version awaited both before sending any
// HTML, which froze the page on a slow/large Sheet).
async function ResearchData() {
  const [leads, findings] = await Promise.all([getLeads(), getResearchFindings()])
  return <ResearchClient leads={leads} findings={findings} />
}

function ResearchSkeleton() {
  return (
    <div className="page-head">
      <div>
        <div className="page-eyebrow">Intelligence</div>
        <div className="page-title">Research</div>
        <div className="page-sub">Loading research…</div>
      </div>
    </div>
  )
}
