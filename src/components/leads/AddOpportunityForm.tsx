'use client'

import { useState } from 'react'

const OPP_TYPES = [
  'New project', 'Press', 'Event follow-up', 'Past client rekindling',
  'Anchor client check-in', 'Competition', 'Market expansion',
  'Brand refresh', 'Manual research', 'Other',
]

interface Props {
  leadId: string
  companyId: string
  onCreated?: (oppId: string) => void
}

type FormState = {
  opportunity_type: string
  summary: string
  why_now: string
  recommended_action: string
  urgency: 'Low' | 'Medium' | 'High'
  confidence: string
  source: string
}

const INITIAL: FormState = {
  opportunity_type: '',
  summary: '',
  why_now: '',
  recommended_action: '',
  urgency: 'Medium',
  confidence: '50',
  source: '',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function AddOpportunityForm({ leadId, companyId, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.opportunity_type || !form.summary || !form.why_now || !form.recommended_action) {
      setError('Type, summary, why now, and recommended action are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: leadId,
          company_id: companyId,
          ...form,
          confidence: Number(form.confidence) || 50,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create opportunity')
      setForm(INITIAL)
      setOpen(false)
      if (onCreated) onCreated(data.opportunity.opportunity_id)
      else window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          fontSize: 12,
          padding: '6px 12px',
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 6,
          color: 'var(--text-faint)',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          marginTop: 8,
        }}
      >
        + Add opportunity
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ marginTop: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
        New opportunity
      </div>

      {error && (
        <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--red)', padding: '6px 10px', background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 5 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Label text="Type *">
            <select value={form.opportunity_type} onChange={(e) => set('opportunity_type', e.target.value)} style={inputStyle}>
              <option value="">Select type</option>
              {OPP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Label>
          <Label text="Source">
            <input value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="Where did this come from?" style={inputStyle} />
          </Label>
        </div>

        <Label text="Summary *">
          <input value={form.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Brief description of the opportunity" style={inputStyle} />
        </Label>

        <Label text="Why now *">
          <textarea
            value={form.why_now}
            onChange={(e) => set('why_now', e.target.value)}
            placeholder="What specific signal makes this timely?"
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
          />
        </Label>

        <Label text="Recommended action *">
          <input value={form.recommended_action} onChange={(e) => set('recommended_action', e.target.value)} placeholder="What should Oaki do next?" style={inputStyle} />
        </Label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Label text="Urgency">
            <select value={form.urgency} onChange={(e) => set('urgency', e.target.value as 'Low' | 'Medium' | 'High')} style={inputStyle}>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </Label>
          <Label text="Confidence (0–100)">
            <input
              type="number"
              min="0"
              max="100"
              value={form.confidence}
              onChange={(e) => set('confidence', e.target.value)}
              style={inputStyle}
            />
          </Label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '6px 14px',
            background: saving ? 'var(--surface-3)' : 'var(--accent)',
            color: saving ? 'var(--text-faint)' : '#000',
            border: 'none',
            borderRadius: 5,
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save opportunity'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setForm(INITIAL); setError(null) }}
          style={{ padding: '6px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 5, fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{text}</div>
      {children}
    </div>
  )
}
