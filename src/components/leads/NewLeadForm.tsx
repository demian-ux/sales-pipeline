'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Campaign, PipelineStage, RelationshipTemperature } from '@/lib/types'

const PIPELINE_STAGES: PipelineStage[] = [
  'New Lead', 'Contacted', 'Replied', 'Discovery',
  'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Nurture', 'Dormant',
]

const TEMPERATURES: RelationshipTemperature[] = ['Hot', 'Warm', 'Cool', 'Cold']

const SOURCES = [
  'Referral', 'Event', 'LinkedIn', 'Instagram', 'Research', 'Past Client',
  'Website', 'Press', 'Cold Outreach', 'Other',
]

interface Props {
  campaigns: Campaign[]
}

type FormState = {
  first_name: string
  last_name: string
  company_name: string
  title: string
  email: string
  linkedin_url: string
  location: string
  source: string
  pipeline_stage: PipelineStage
  relationship_temperature: RelationshipTemperature | ''
  campaign_id: string
  business_fit_score: string
  taste_score: string
  relationship_score: string
  opportunity_score: string
  priority_score: string
  next_action: string
  next_followup_date: string
  known_pain_points: string
  notes: string
}

const INITIAL: FormState = {
  first_name: '', last_name: '', company_name: '', title: '', email: '',
  linkedin_url: '', location: '', source: '', pipeline_stage: 'New Lead',
  relationship_temperature: '', campaign_id: '', business_fit_score: '',
  taste_score: '', relationship_score: '', opportunity_score: '',
  priority_score: '', next_action: '', next_followup_date: '',
  known_pain_points: '', notes: '',
}

export default function NewLeadForm({ campaigns }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim() || !form.company_name.trim()) {
      setError('First name, last name, and company are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          relationship_temperature: form.relationship_temperature || undefined,
          campaign_id: form.campaign_id || undefined,
          business_fit_score: form.business_fit_score ? Number(form.business_fit_score) : undefined,
          taste_score: form.taste_score ? Number(form.taste_score) : undefined,
          relationship_score: form.relationship_score ? Number(form.relationship_score) : undefined,
          opportunity_score: form.opportunity_score ? Number(form.opportunity_score) : undefined,
          priority_score: form.priority_score ? Number(form.priority_score) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create lead')
      router.push(`/leads/${data.lead.lead_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(224,92,92,0.1)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 6, fontSize: 12, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Identity */}
        <Section title="Identity">
          <Row>
            <Field label="First name *">
              <Input value={form.first_name} onChange={(v) => set('first_name', v)} placeholder="Sofia" />
            </Field>
            <Field label="Last name *">
              <Input value={form.last_name} onChange={(v) => set('last_name', v)} placeholder="Marchetti" />
            </Field>
          </Row>
          <Row>
            <Field label="Company *">
              <Input value={form.company_name} onChange={(v) => set('company_name', v)} placeholder="Studio Marchetti" />
            </Field>
            <Field label="Title">
              <Input value={form.title} onChange={(v) => set('title', v)} placeholder="Founding Partner" />
            </Field>
          </Row>
          <Row>
            <Field label="Email">
              <Input value={form.email} onChange={(v) => set('email', v)} placeholder="sofia@..." type="email" />
            </Field>
            <Field label="LinkedIn URL">
              <Input value={form.linkedin_url} onChange={(v) => set('linkedin_url', v)} placeholder="linkedin.com/in/..." />
            </Field>
          </Row>
          <Row>
            <Field label="Location">
              <Input value={form.location} onChange={(v) => set('location', v)} placeholder="Milan, Italy" />
            </Field>
            <Field label="Source">
              <Select value={form.source} onChange={(v) => set('source', v)}>
                <option value="">Select source</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
        </Section>

        {/* Pipeline */}
        <Section title="Pipeline">
          <Row>
            <Field label="Stage">
              <Select value={form.pipeline_stage} onChange={(v) => set('pipeline_stage', v as PipelineStage)}>
                {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Relationship temperature">
              <Select value={form.relationship_temperature} onChange={(v) => set('relationship_temperature', v as RelationshipTemperature | '')}>
                <option value="">Not set</option>
                {TEMPERATURES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Campaign">
              <Select value={form.campaign_id} onChange={(v) => set('campaign_id', v)}>
                <option value="">No campaign</option>
                {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
              </Select>
            </Field>
          </Row>
        </Section>

        {/* Scores */}
        <Section title="Scores" subtitle="1–10, leave blank if unknown">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {([
              ['business_fit_score', 'Business fit'],
              ['taste_score', 'Taste'],
              ['relationship_score', 'Relationship'],
              ['opportunity_score', 'Opportunity'],
              ['priority_score', 'Priority'],
            ] as const).map(([field, label]) => (
              <Field key={field} label={label}>
                <Input
                  value={form[field]}
                  onChange={(v) => set(field, v)}
                  placeholder="—"
                  type="number"
                  min="1"
                  max="10"
                />
              </Field>
            ))}
          </div>
        </Section>

        {/* Next action */}
        <Section title="Next action">
          <Row>
            <Field label="Action">
              <Input value={form.next_action} onChange={(v) => set('next_action', v)} placeholder="Send portfolio intro" />
            </Field>
            <Field label="Follow-up date">
              <Input value={form.next_followup_date} onChange={(v) => set('next_followup_date', v)} type="date" />
            </Field>
          </Row>
        </Section>

        {/* Context */}
        <Section title="Context">
          <Field label="Known pain points">
            <Textarea
              value={form.known_pain_points}
              onChange={(v) => set('known_pain_points', v)}
              placeholder="What problems are they trying to solve?"
              rows={2}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(v) => set('notes', v)}
              placeholder="Anything else worth remembering about this contact."
              rows={3}
            />
          </Field>
        </Section>

      </div>

      {/* Submit */}
      <div style={{ display: 'flex', gap: 10, marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '9px 20px',
            background: saving ? 'var(--surface-2)' : 'var(--accent)',
            color: saving ? 'var(--text-faint)' : '#000',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? 'default' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'Creating…' : 'Create lead'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            padding: '9px 16px',
            background: 'transparent',
            color: 'var(--text-faint)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Small layout helpers ───────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{subtitle}</div>}
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '7px 10px',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}

function Input({
  value, onChange, placeholder, type = 'text', min, max,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  min?: string
  max?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      style={inputStyle}
    />
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
      {children}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
    />
  )
}
