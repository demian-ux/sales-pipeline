'use client'
/* eslint-disable react/no-unescaped-entities */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OPP_TYPES } from '@/lib/constants/opportunity-types'
import { Icon } from '@/components/ui/icons'
import { logInteraction, fetchMeta, todayYMD, type MetaVocab } from '@/lib/client/interactions'

interface Props {
  leadId: string
  companyId: string
  tab: 'analyze' | 'research' | 'log'
}

export default function LeadActions({ leadId, companyId, tab }: Props) {
  if (tab === 'analyze') return <AnalyzeButton leadId={leadId} />
  if (tab === 'research') return <ResearchForm leadId={leadId} companyId={companyId} />
  if (tab === 'log') return <LogForm leadId={leadId} companyId={companyId} />
  return null
}

function AnalyzeButton({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleAnalyze() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setDone(true)
      setTimeout(() => router.refresh(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card card-pad">
      <div className="micro" style={{ marginBottom: 10 }}>Analysis</div>
      <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
        Generates the strategic assessment, why-now signal, and discovery questions. Email and LinkedIn
        drafts are separate, in the analysis card.
      </div>
      <button
        className="btn btn-primary"
        style={{ width: '100%' }}
        onClick={handleAnalyze}
        disabled={loading || done}
      >
        <Icon name="sparkle" size={12} />
        {done ? 'Ready — reloading…' : loading ? 'Analyzing…' : 'Analyze — why now?'}
      </button>
      {error && <div className="risk" style={{ marginTop: 8, fontSize: 12 }}>{error}</div>}
    </div>
  )
}

type ResearchFormState = {
  source_type: string
  source_url: string
  research_summary: string
  signals_detected: string
  design_observations: string
  market_positioning: string
  visual_identity_notes: string
}

const RESEARCH_INITIAL: ResearchFormState = {
  source_type: 'Manual',
  source_url: '',
  research_summary: '',
  signals_detected: '',
  design_observations: '',
  market_positioning: '',
  visual_identity_notes: '',
}

type OppFormState = {
  opportunity_type: string
  summary: string
  why_now: string
  recommended_action: string
  urgency: 'Low' | 'Medium' | 'High'
  confidence: string
}

function ResearchForm({ leadId, companyId }: { leadId: string; companyId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState<ResearchFormState | null>(null)
  const [phase, setPhase] = useState<'form' | 'next' | 'opp' | 'analyzing' | 'done'>('form')
  const [form, setForm] = useState<ResearchFormState>(RESEARCH_INITIAL)
  const [oppForm, setOppForm] = useState<OppFormState>({
    opportunity_type: '', summary: '', why_now: '', recommended_action: '', urgency: 'Medium', confidence: '65',
  })
  const [oppSaving, setOppSaving] = useState(false)
  const [oppError, setOppError] = useState<string | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.research_summary.trim()) return
    setLoading(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, lead_id: leadId, company_id: companyId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not save finding')
      }
      setSaved(form)
      setOppForm({
        opportunity_type: '',
        summary: form.signals_detected || form.research_summary.slice(0, 120),
        why_now: form.signals_detected || '',
        recommended_action: '',
        urgency: 'Medium',
        confidence: '65',
      })
      setForm(RESEARCH_INITIAL)
      setPhase('next')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save finding')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveOpp(e: React.FormEvent) {
    e.preventDefault()
    if (!oppForm.opportunity_type || !oppForm.summary || !oppForm.why_now || !oppForm.recommended_action) {
      setOppError('Type, summary, why now, and recommended action are required.')
      return
    }
    setOppSaving(true)
    setOppError(null)
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          company_id: companyId,
          ...oppForm,
          confidence: Number(oppForm.confidence) || 65,
          source: saved?.source_type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create opportunity')
      setPhase('done')
      setTimeout(() => router.refresh(), 800)
    } catch (err) {
      setOppError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setOppSaving(false)
    }
  }

  async function handleAnalyze() {
    setPhase('analyzing')
    setAnalyzeError(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: leadId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setPhase('done')
      setTimeout(() => router.refresh(), 800)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
      setPhase('next')
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', width: '100%' }}
      >
        + Add research finding
      </button>
    )
  }

  if (phase === 'done') {
    return (
      <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--green-dim)', border: '1px solid rgba(76,175,134,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--green)' }}>
        Saved — reloading…
      </div>
    )
  }

  if (phase === 'analyzing') {
    return (
      <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--accent-dim)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent)' }}>
        Analyzing with Claude…
      </div>
    )
  }

  if (phase === 'next') {
    return (
      <div style={{ marginTop: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>✓ Finding saved</span>
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>— what's next?</span>
        </div>
        {analyzeError && (
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--red)', borderBottom: '1px solid var(--border-subtle)' }}>{analyzeError}</div>
        )}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => setPhase('opp')}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            <div style={{ fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>Create opportunity from this →</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Log a strategic opportunity based on what you found</div>
          </button>
          <button
            onClick={handleAnalyze}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'var(--accent-dim)', border: '1px solid rgba(200,169,110,0.3)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            <div style={{ fontWeight: 500, color: 'var(--accent)', marginBottom: 2 }}>Analyze with Claude →</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Generate why-now signal, email draft, and discovery questions</div>
          </button>
          <button
            onClick={() => { setPhase('form'); setOpen(false); router.refresh() }}
            style={{ fontSize: 12, color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '4px 0' }}
          >
            Done, just reload
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'opp') {
    return (
      <form onSubmit={handleSaveOpp} style={{ marginTop: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>New opportunity</span>
          <button type="button" onClick={() => setPhase('next')} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
        </div>
        {oppError && (
          <div style={{ margin: '10px 14px 0', fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 5 }}>{oppError}</div>
        )}
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <Label>Type *</Label>
              <select value={oppForm.opportunity_type} onChange={(e) => setOppForm((f) => ({ ...f, opportunity_type: e.target.value }))} style={inputStyle}>
                <option value="">Select type</option>
                {OPP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label>Urgency</Label>
              <select value={oppForm.urgency} onChange={(e) => setOppForm((f) => ({ ...f, urgency: e.target.value as 'Low' | 'Medium' | 'High' }))} style={inputStyle}>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Summary *</Label>
            <input value={oppForm.summary} onChange={(e) => setOppForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Brief description" style={inputStyle} />
          </div>
          <div>
            <Label>Why now *</Label>
            <textarea
              value={oppForm.why_now}
              onChange={(e) => setOppForm((f) => ({ ...f, why_now: e.target.value }))}
              placeholder="What specific signal makes this timely?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
          <div>
            <Label>Recommended action *</Label>
            <input value={oppForm.recommended_action} onChange={(e) => setOppForm((f) => ({ ...f, recommended_action: e.target.value }))} placeholder="What should Oaki do next?" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" disabled={oppSaving} style={{ ...btnStyle, background: oppSaving ? 'var(--surface-3)' : 'var(--accent)', color: oppSaving ? 'var(--text-faint)' : '#000', border: 'none', fontWeight: 600 }}>
              {oppSaving ? 'Saving…' : 'Save opportunity'}
            </button>
            <button type="button" onClick={() => setPhase('next')} style={{ ...btnStyle, color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Source type</Label>
          <select value={form.source_type} onChange={(e) => setForm((f) => ({ ...f, source_type: e.target.value }))} style={inputStyle}>
            {['Website', 'LinkedIn', 'Instagram', 'Press', 'Event', 'Research terminal', 'Manual', 'Other'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Source URL (optional)</Label>
          <input type="url" value={form.source_url} onChange={(e) => setForm((f) => ({ ...f, source_url: e.target.value }))} placeholder="https://…" style={inputStyle} />
        </div>
      </div>
      <div>
        <Label>Research summary *</Label>
        <textarea
          required
          value={form.research_summary}
          onChange={(e) => setForm((f) => ({ ...f, research_summary: e.target.value }))}
          placeholder="What did you find? Be specific — new project, press coverage, LinkedIn post…"
          rows={3}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>
      <div>
        <Label>Signals detected</Label>
        <input value={form.signals_detected} onChange={(e) => setForm((f) => ({ ...f, signals_detected: e.target.value }))} placeholder="e.g. new hospitality project, competition deadline, visual gap" style={inputStyle} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Design observations</Label>
          <input value={form.design_observations} onChange={(e) => setForm((f) => ({ ...f, design_observations: e.target.value }))} placeholder="e.g. editorial aesthetic, material-driven" style={inputStyle} />
        </div>
        <div>
          <Label>Visual identity notes</Label>
          <input value={form.visual_identity_notes} onChange={(e) => setForm((f) => ({ ...f, visual_identity_notes: e.target.value }))} placeholder="e.g. outdated logo, strong palette, no brand guide" style={inputStyle} />
        </div>
      </div>
      <div>
        <Label>Market positioning</Label>
        <input value={form.market_positioning} onChange={(e) => setForm((f) => ({ ...f, market_positioning: e.target.value }))} placeholder="e.g. expanding into luxury segment, repositioning post-merger" style={inputStyle} />
      </div>
      {saveError && (
        <div style={{ fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 5 }}>{saveError}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading} style={{ ...btnStyle, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,169,110,0.3)' }}>
          {loading ? 'Saving…' : 'Save finding'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setPhase('form') }} style={{ ...btnStyle, color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function LogForm({ leadId }: { leadId: string; companyId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [meta, setMeta] = useState<MetaVocab | null>(null)
  const [form, setForm] = useState({
    channel: 'Email',
    direction: 'Outbound',
    sent_at: todayYMD(),
    subject: '',
    body_summary: '',
    linkedin_manual_status: '',
    gmail_thread_id: '',
    gmail_message_id: '',
  })

  // Channel/direction options come from GET /api/meta at runtime — never
  // hardcoded, so the form can't drift from what the server accepts.
  useEffect(() => {
    if (!open || meta) return
    fetchMeta()
      .then(setMeta)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load field options'))
  }, [open, meta])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.body_summary.trim()) {
      setError('Summary is required.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      // Single write path — updates the lead's last_touch_date server-side.
      await logInteraction(leadId, {
        channel: form.channel as 'Email' | 'LinkedIn' | 'Phone' | 'Meeting' | 'Other',
        direction: form.direction as 'Inbound' | 'Outbound',
        sent_at: form.sent_at,
        subject: form.subject.trim() || undefined,
        body_summary: form.body_summary.trim(),
        linkedin_manual_status: form.linkedin_manual_status || undefined,
        gmail_thread_id: form.gmail_thread_id.trim() || undefined,
        gmail_message_id: form.gmail_message_id.trim() || undefined,
      })
      // Success: reset, close, and refetch server state so the card renders
      // the saved record, not the local draft.
      setForm({ channel: 'Email', direction: 'Outbound', sent_at: todayYMD(), subject: '', body_summary: '', linkedin_manual_status: '', gmail_thread_id: '', gmail_message_id: '' })
      setOpen(false)
      router.refresh()
    } catch (err) {
      // Failure: keep the form populated, show the error, do NOT render as saved.
      setError(err instanceof Error ? err.message : 'Could not log interaction')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ marginTop: 10, fontSize: 12, color: 'var(--text-faint)', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', width: '100%' }}
      >
        + Log interaction
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Channel</Label>
          <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))} style={inputStyle} disabled={!meta}>
            {(meta?.interaction_channel ?? [form.channel]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <Label>Direction</Label>
          <select value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))} style={inputStyle} disabled={!meta}>
            {(meta?.interaction_direction ?? [form.direction]).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <Label>Date</Label>
          <input
            type="date"
            value={form.sent_at}
            onChange={(e) => setForm((f) => ({ ...f, sent_at: e.target.value }))}
            style={{ ...inputStyle, colorScheme: 'dark' }}
          />
        </div>
        <div>
          <Label>Subject (optional)</Label>
          <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Email subject or topic" style={inputStyle} />
        </div>
      </div>
      <div>
        <Label>Summary *</Label>
        <textarea
          required
          value={form.body_summary}
          onChange={(e) => setForm((f) => ({ ...f, body_summary: e.target.value }))}
          placeholder="What was said or done?"
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
        />
      </div>
      {form.channel === 'LinkedIn' && (
        <div>
          <Label>LinkedIn status</Label>
          <select value={form.linkedin_manual_status} onChange={(e) => setForm((f) => ({ ...f, linkedin_manual_status: e.target.value }))} style={inputStyle}>
            <option value="">—</option>
            <option value="Sent">Sent</option>
            <option value="Replied">Replied</option>
            <option value="Connected">Connected</option>
          </select>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        {showAdvanced ? '▾ Advanced' : '▸ Advanced (Gmail IDs)'}
      </button>
      {showAdvanced && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <Label>Gmail thread ID</Label>
            <input value={form.gmail_thread_id} onChange={(e) => setForm((f) => ({ ...f, gmail_thread_id: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <Label>Gmail message ID</Label>
            <input value={form.gmail_message_id} onChange={(e) => setForm((f) => ({ ...f, gmail_message_id: e.target.value }))} style={inputStyle} />
          </div>
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 5 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={loading} style={{ ...btnStyle, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          {loading ? 'Saving…' : 'Log interaction'}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ ...btnStyle, color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{children}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 10px',
  color: 'var(--text)',
  fontSize: 12,
  outline: 'none',
}

const btnStyle: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 500,
  background: 'transparent',
}
