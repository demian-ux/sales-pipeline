'use client'

import { useState, useRef } from 'react'
import type { Lead } from '@/lib/types'
import type { ResearchExtractionOutput, ResearchExtractionOpportunity } from '@/lib/types'
import CopyButton from '@/components/ui/CopyButton'
import Link from 'next/link'

type Step = 'input' | 'extracting' | 'review' | 'saving' | 'saved'

type LeadMode = 'search' | 'create'

type SaveResult = {
  leadId: string
  leadName: string
  oppCount: number
  insightSaved: boolean
}

type SaveMode = 'finding' | 'finding_opp' | 'finding_opp_insight'

const SOURCE_TYPES = ['Website', 'LinkedIn', 'Instagram', 'Press', 'Event', 'Research terminal', 'Manual', 'Other']

const inp: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '7px 10px',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}

const OPP_TYPES = [
  'New project', 'Press', 'Event follow-up', 'Past client rekindling',
  'Anchor client check-in', 'Competition', 'Market expansion',
  'Brand refresh', 'Manual research', 'Other',
]

interface Props {
  leads: Lead[]
}

export default function ResearchIngestForm({ leads }: Props) {
  const [step, setStep] = useState<Step>('input')

  // Input state
  const [rawText, setRawText] = useState('')
  const [sourceType, setSourceType] = useState('Manual')
  const [sourceUrl, setSourceUrl] = useState('')
  const [leadMode, setLeadMode] = useState<LeadMode>('search')
  const [search, setSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Extraction state
  const [extraction, setExtraction] = useState<ResearchExtractionOutput | null>(null)
  const [extractError, setExtractError] = useState('')

  // Review edits
  const [editedSummary, setEditedSummary] = useState('')
  const [editedNextAction, setEditedNextAction] = useState('')
  const [oppEnabled, setOppEnabled] = useState<boolean[]>([])
  const [editedOpps, setEditedOpps] = useState<ResearchExtractionOpportunity[]>([])
  const [saveMode, setSaveMode] = useState<SaveMode>('finding_opp')

  // Save state
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [saveError, setSaveError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filteredLeads = leads.filter((l) =>
    search.length < 2 ? false :
    `${l.full_name} ${l.company_name}`.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8)

  async function handleExtract() {
    if (!rawText.trim()) return
    if (leadMode === 'create' && (!newFirst.trim() || !newLast.trim() || !newCompany.trim())) {
      setExtractError('First name, last name, and company are required to create a lead.')
      return
    }
    setStep('extracting')
    setExtractError('')
    try {
      const res = await fetch('/api/research/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: rawText,
          lead_id: selectedLead?.lead_id,
          lead_name: leadMode === 'create' ? `${newFirst} ${newLast}` : undefined,
          company_name: leadMode === 'create' ? newCompany : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Extraction failed')
      const ext: ResearchExtractionOutput = data.extraction
      setExtraction(ext)
      setEditedSummary(ext.research_summary)
      setEditedNextAction(ext.suggested_next_action)
      setEditedOpps(ext.opportunities.map((o) => ({ ...o })))
      setOppEnabled(ext.opportunities.map(() => true))
      setStep('review')
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed')
      setStep('input')
    }
  }

  async function handleSave() {
    if (!extraction) return
    setStep('saving')
    setSaveError('')
    try {
      let leadId = selectedLead?.lead_id ?? ''
      let leadName = selectedLead?.full_name ?? `${newFirst} ${newLast}`
      let companyId = selectedLead?.company_id ?? ''

      // Create lead if needed
      if (leadMode === 'create') {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ first_name: newFirst, last_name: newLast, company_name: newCompany, email: newEmail || undefined }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to create lead')
        leadId = data.lead.lead_id
        companyId = data.lead.company_id
        leadName = data.lead.full_name
      }

      // Save research finding
      const signals = extraction.signals_detected.join(', ')
      const rfRes = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId || undefined,
          company_id: companyId || undefined,
          source_type: sourceType,
          source_url: sourceUrl || undefined,
          research_summary: editedSummary,
          signals_detected: signals,
          design_observations: extraction.design_observations,
          market_positioning: extraction.market_positioning,
          visual_identity_notes: extraction.visual_identity_notes,
        }),
      })
      if (!rfRes.ok) throw new Error('Failed to save research finding')

      // Save selected opportunities
      const activeOpps = saveMode === 'finding'
        ? []
        : editedOpps.filter((_, i) => oppEnabled[i])
      for (const opp of activeOpps) {
        if (!leadId || !companyId) continue
        const oppRes = await fetch('/api/opportunities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            company_id: companyId,
            ...opp,
          }),
        })
        const oppData = await oppRes.json()
        if (!oppRes.ok) throw new Error(oppData.error || 'Failed to save opportunity')
      }

      let insightSaved = false
      if (saveMode === 'finding_opp_insight' && leadId && companyId) {
        const strongestOpp = activeOpps
          .sort((a, b) => Number(b.confidence) - Number(a.confidence))[0]
        const insightRes = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lead_id: leadId,
            company_id: companyId,
            summary: editedSummary,
            why_now: strongestOpp?.why_now || editedNextAction || editedSummary,
            recommended_next_action: editedNextAction || strongestOpp?.recommended_action || 'Review research and decide whether to contact.',
            suggested_email: extraction.suggested_email,
            suggested_linkedin_dm: extraction.suggested_linkedin_dm,
            intent_level: strongestOpp?.urgency === 'High' ? 'high' : strongestOpp?.urgency === 'Medium' ? 'medium' : 'low',
            risk_level: strongestOpp?.confidence && strongestOpp.confidence >= 75 ? 'low' : 'medium',
            confidence: strongestOpp?.confidence ?? 50,
            opportunities: activeOpps.map((opp) => opp.summary),
          }),
        })
        const insightData = await insightRes.json()
        if (!insightRes.ok) throw new Error(insightData.error || 'Failed to save AI insight')
        insightSaved = true
      }

      setSaveResult({ leadId, leadName, oppCount: activeOpps.length, insightSaved })
      setStep('saved')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
      setStep('review')
    }
  }

  function reset() {
    setStep('input')
    setRawText('')
    setSourceType('Manual')
    setSourceUrl('')
    setSearch('')
    setSelectedLead(null)
    setLeadMode('search')
    setNewFirst('')
    setNewLast('')
    setNewCompany('')
    setNewEmail('')
    setExtraction(null)
    setSaveMode('finding_opp')
    setExtractError('')
    setSaveResult(null)
    setSaveError('')
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  // ── Saved ────────────────────────────────────────────────────────────────────
  if (step === 'saved' && saveResult) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '28px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: 'var(--green)' }}>✓ Research saved</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Finding recorded{saveResult.oppCount > 0 ? ` · ${saveResult.oppCount} opportunit${saveResult.oppCount === 1 ? 'y' : 'ies'} created` : ''}.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {saveResult.leadId && (
            <Link href={`/leads/${saveResult.leadId}`} style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', background: 'var(--accent)', color: '#000', borderRadius: 6, textDecoration: 'none' }}>
              View {saveResult.leadName} →
            </Link>
          )}
          <button onClick={reset} style={{ fontSize: 13, padding: '7px 16px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', cursor: 'pointer' }}>
            Add more research
          </button>
        </div>
      </div>
    )
  }

  // ── Review ───────────────────────────────────────────────────────────────────
  if ((step === 'review' || step === 'saving') && extraction) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Review extraction</div>
          <button onClick={() => setStep('input')} style={{ fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Edit input
          </button>
        </div>

        {saveError && (
          <div style={{ padding: '10px 14px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
            {saveError}
          </div>
        )}

        {/* Summary */}
        <Card title="Research Summary">
          <textarea
            value={editedSummary}
            onChange={(e) => setEditedSummary(e.target.value)}
            rows={3}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }}
          />
        </Card>

        {/* Signals */}
        {extraction.signals_detected.length > 0 && (
          <Card title="Signals Detected">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {extraction.signals_detected.map((s, i) => (
                <span key={i} style={{ fontSize: 12, padding: '3px 10px', background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,169,110,0.25)', borderRadius: 20 }}>
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Observations */}
        {(extraction.design_observations || extraction.market_positioning || extraction.visual_identity_notes) && (
          <Card title="Observations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {extraction.design_observations && (
                <div>
                  <Label>Design</Label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{extraction.design_observations}</div>
                </div>
              )}
              {extraction.market_positioning && (
                <div>
                  <Label>Market positioning</Label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{extraction.market_positioning}</div>
                </div>
              )}
              {extraction.visual_identity_notes && (
                <div>
                  <Label>Visual identity</Label>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{extraction.visual_identity_notes}</div>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Opportunities */}
        {editedOpps.length > 0 && (
          <Card title={`Opportunities · ${editedOpps.filter((_, i) => oppEnabled[i]).length} selected`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {editedOpps.map((opp, i) => (
                <div key={i} style={{ background: oppEnabled[i] ? 'var(--surface)' : 'var(--surface-3)', border: `1px solid ${oppEnabled[i] ? 'var(--border)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '12px 14px', opacity: oppEnabled[i] ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={oppEnabled[i]}
                        onChange={(e) => setOppEnabled((prev) => { const n = [...prev]; n[i] = e.target.checked; return n })}
                        style={{ cursor: 'pointer' }}
                      />
                      <UrgencyPip urgency={opp.urgency} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{opp.opportunity_type || 'Opportunity'}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{opp.confidence}% confidence</span>
                  </div>
                  {oppEnabled[i] && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <div>
                          <Label>Type</Label>
                          <select value={opp.opportunity_type} onChange={(e) => updateOpp(i, 'opportunity_type', e.target.value)} style={{ ...inp, fontSize: 12 }}>
                            {OPP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <Label>Urgency</Label>
                          <select value={opp.urgency} onChange={(e) => updateOpp(i, 'urgency', e.target.value)} style={{ ...inp, fontSize: 12 }}>
                            {['Low', 'Medium', 'High'].map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <Label>Summary</Label>
                        <input value={opp.summary} onChange={(e) => updateOpp(i, 'summary', e.target.value)} style={{ ...inp, fontSize: 12 }} />
                      </div>
                      <div>
                        <Label>Why now</Label>
                        <textarea value={opp.why_now} onChange={(e) => updateOpp(i, 'why_now', e.target.value)} rows={2} style={{ ...inp, fontSize: 12, resize: 'vertical', lineHeight: 1.5 }} />
                      </div>
                      <div>
                        <Label>Recommended action</Label>
                        <input value={opp.recommended_action} onChange={(e) => updateOpp(i, 'recommended_action', e.target.value)} style={{ ...inp, fontSize: 12 }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Next action */}
        {editedNextAction && (
          <Card title="Suggested Next Action">
            <input value={editedNextAction} onChange={(e) => setEditedNextAction(e.target.value)} style={inp} />
          </Card>
        )}

        {/* Drafts */}
        {(extraction.suggested_email || extraction.suggested_linkedin_dm) && (
          <Card title="Message Drafts">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {extraction.suggested_email && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Label>Email draft</Label>
                    <CopyButton text={extraction.suggested_email} label="Copy email" />
                  </div>
                  <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                    {extraction.suggested_email}
                  </pre>
                </div>
              )}
              {extraction.suggested_linkedin_dm && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <Label>LinkedIn DM</Label>
                    <CopyButton text={extraction.suggested_linkedin_dm} label="Copy DM" />
                  </div>
                  <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
                    {extraction.suggested_linkedin_dm}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card title="Save Options">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SaveOption
              active={saveMode === 'finding'}
              title="Save research finding only"
              description="Keep the research in history without creating next-step objects."
              onClick={() => setSaveMode('finding')}
            />
            <SaveOption
              active={saveMode === 'finding_opp'}
              title="Save finding + selected opportunities"
              description="Create opportunity cards from selected signals."
              onClick={() => setSaveMode('finding_opp')}
            />
            <SaveOption
              active={saveMode === 'finding_opp_insight'}
              title="Save finding + opportunities + AI insight"
              description="Also store the extraction as strategic guidance in AI Insights."
              onClick={() => setSaveMode('finding_opp_insight')}
            />
          </div>
        </Card>

        {/* Save actions */}
        <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
          <button
            onClick={handleSave}
            disabled={step === 'saving'}
            style={{ padding: '9px 20px', background: step === 'saving' ? 'var(--surface-3)' : 'var(--accent)', color: step === 'saving' ? 'var(--text-faint)' : '#000', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: step === 'saving' ? 'default' : 'pointer' }}
          >
            {step === 'saving' ? 'Saving…' : `Save${oppEnabled.some(Boolean) ? ` + ${oppEnabled.filter(Boolean).length} opp${oppEnabled.filter(Boolean).length !== 1 ? 's' : ''}` : ' research'}`}
          </button>
          <button onClick={() => setStep('input')} style={{ padding: '9px 14px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text-faint)', cursor: 'pointer' }}>
            Back
          </button>
        </div>
      </div>
    )

    function updateOpp(i: number, field: keyof ResearchExtractionOpportunity, value: string) {
      setEditedOpps((prev) => { const n = [...prev]; n[i] = { ...n[i], [field]: value }; return n })
    }
  }

  // ── Extracting ────────────────────────────────────────────────────────────────
  if (step === 'extracting') {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 8, fontWeight: 500 }}>Extracting signals…</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Claude is analyzing your research notes</div>
      </div>
    )
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>New research</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Paste anything — LinkedIn posts, press articles, website copy, notes from a call.</div>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Raw text */}
        <div>
          <Label>Research notes *</Label>
          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste research here — LinkedIn posts, press coverage, website copy, event announcements, project descriptions, personal notes…"
            rows={7}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        {/* Source */}
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
          <div>
            <Label>Source type</Label>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} style={inp}>
              {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Source URL (optional)</Label>
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" style={inp} />
          </div>
        </div>

        {/* Lead selector */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Label>Prospect</Label>
            <div style={{ display: 'flex', gap: 4 }}>
              <TabBtn active={leadMode === 'search'} onClick={() => { setLeadMode('search'); setSelectedLead(null) }}>Select existing</TabBtn>
              <TabBtn active={leadMode === 'create'} onClick={() => { setLeadMode('create'); setSelectedLead(null) }}>Create new</TabBtn>
            </div>
          </div>

          {leadMode === 'search' && (
            <div style={{ position: 'relative' }}>
              {selectedLead ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--accent-dim)', border: '1px solid rgba(200,169,110,0.3)', borderRadius: 6 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{selectedLead.full_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8 }}>{selectedLead.company_name}</span>
                  </div>
                  <button onClick={() => { setSelectedLead(null); setSearch('') }} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or company…"
                    style={inp}
                  />
                  {filteredLeads.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, marginTop: 2, zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                      {filteredLeads.map((l) => (
                        <button key={l.lead_id} onClick={() => { setSelectedLead(l); setSearch('') }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{l.full_name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 8 }}>{l.company_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {search.length >= 2 && filteredLeads.length === 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-faint)' }}>
                      No match — switch to <button onClick={() => setLeadMode('create')} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Create new</button> to add them.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {leadMode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <Label>First name *</Label>
                  <input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="Sofia" style={inp} />
                </div>
                <div>
                  <Label>Last name *</Label>
                  <input value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Marchetti" style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <Label>Company *</Label>
                  <input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Studio Marchetti" style={inp} />
                </div>
                <div>
                  <Label>Email (optional)</Label>
                  <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="sofia@…" style={inp} />
                </div>
              </div>
            </div>
          )}
        </div>

        {extractError && (
          <div style={{ padding: '10px 14px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
            {extractError}
          </div>
        )}

        <div>
          <button
            onClick={handleExtract}
            disabled={!rawText.trim()}
            style={{ padding: '9px 20px', background: rawText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: rawText.trim() ? '#000' : 'var(--text-faint)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: rawText.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}
          >
            Extract with Claude →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SaveOption({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '9px 11px',
        background: active ? 'var(--accent-dim)' : 'var(--surface-2)',
        border: `1px solid ${active ? 'rgba(200,169,110,0.3)' : 'var(--border)'}`,
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 12, color: active ? 'var(--accent)' : 'var(--text)', fontWeight: 600, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4 }}>{description}</div>
    </button>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{children}</div>
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: active ? '1px solid rgba(200,169,110,0.3)' : '1px solid var(--border)', background: active ? 'var(--accent-dim)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-faint)', cursor: 'pointer' }}>
      {children}
    </button>
  )
}

function UrgencyPip({ urgency }: { urgency: string }) {
  const color = urgency === 'High' ? 'var(--red)' : urgency === 'Medium' ? 'var(--yellow)' : 'var(--text-faint)'
  return <span style={{ fontSize: 9, color }}>{urgency === 'High' ? '●●●' : urgency === 'Medium' ? '●●○' : '●○○'}</span>
}
