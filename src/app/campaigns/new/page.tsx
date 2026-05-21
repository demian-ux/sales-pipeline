'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { CampaignChannel, CampaignCadence, CampaignStatus } from '@/lib/types'
import { IconArrowLeft, IconLoader } from '@/components/ui/icons'

const CHANNELS: CampaignChannel[] = ['Email', 'LinkedIn', 'Letter', 'Phone']
const CADENCES: CampaignCadence[] = ['Daily', 'Twice weekly', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly']
const STATUSES: CampaignStatus[] = ['Active', 'Paused', 'Archived']

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text)',
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 72,
  resize: 'vertical',
  fontFamily: 'inherit',
}

export default function NewCampaignPage() {
  const router = useRouter()

  const [name, setName]                   = useState('')
  const [description, setDescription]     = useState('')
  const [targetSegment, setTargetSegment] = useState('')
  const [location, setLocation]           = useState('')
  const [projectTypes, setProjectTypes]   = useState('')
  const [offer, setOffer]                 = useState('')
  const [painPoint, setPainPoint]         = useState('')
  const [cta, setCta]                     = useState('Set a discovery meeting')
  const [channels, setChannels]           = useState<CampaignChannel[]>(['Email'])
  const [cadence, setCadence]             = useState<CampaignCadence>('Weekly')
  const [status, setStatus]               = useState<CampaignStatus>('Active')
  const [owner, setOwner]                 = useState('')
  const [notes, setNotes]                 = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  function toggleChannel(ch: CampaignChannel) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch],
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          target_segment: targetSegment || undefined,
          location: location || undefined,
          project_types: projectTypes || undefined,
          offer: offer || undefined,
          pain_point: painPoint || undefined,
          cta,
          channels,
          cadence,
          status,
          owner: owner || undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`)
        setSubmitting(false)
        return
      }
      router.push('/campaigns')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 760 }}>
      <Link
        href="/campaigns"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none',
          marginBottom: 16,
        }}
      >
        <IconArrowLeft size={12} /> Campaigns
      </Link>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>New campaign</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          A campaign groups leads under a shared outreach angle, cadence, and CTA. Assign leads
          to it later from the lead detail page or during Apollo import.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Section label="Basics">
          <Field label="Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Anchor Clients" autoFocus />
          </Field>
          <Field label="Description" required>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} required style={textareaStyle} placeholder="1–2 sentences. What's the angle? Who is it for? What outcome are you after?" />
          </Field>
        </Section>

        <Section label="Targeting">
          <Field label="Target segment">
            <input value={targetSegment} onChange={(e) => setTargetSegment(e.target.value)} style={inputStyle} placeholder="e.g. Top-tier hospitality architects" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Location">
              <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="e.g. New York, Miami" />
            </Field>
            <Field label="Project types">
              <input value={projectTypes} onChange={(e) => setProjectTypes(e.target.value)} style={inputStyle} placeholder="e.g. Hospitality, Mixed-use" />
            </Field>
          </div>
        </Section>

        <Section label="Message">
          <Field label="Pain point">
            <input value={painPoint} onChange={(e) => setPainPoint(e.target.value)} style={inputStyle} placeholder="e.g. Visualization vendor lacks editorial quality" />
          </Field>
          <Field label="Offer / angle">
            <input value={offer} onChange={(e) => setOffer(e.target.value)} style={inputStyle} placeholder="e.g. Premium architectural visualization with editorial polish" />
          </Field>
          <Field label="CTA" required>
            <input value={cta} onChange={(e) => setCta(e.target.value)} required style={inputStyle} placeholder="e.g. Set a discovery meeting" />
          </Field>
        </Section>

        <Section label="Execution">
          <Field label="Channels">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CHANNELS.map((ch) => {
                const on = channels.includes(ch)
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    style={{
                      fontSize: 12,
                      padding: '6px 14px',
                      borderRadius: 'var(--r-sm)',
                      border: '1px solid',
                      background:     on ? 'var(--accent-dim)' : 'transparent',
                      borderColor:    on ? 'rgba(200,169,110,0.4)' : 'var(--border)',
                      color:          on ? 'var(--accent)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {ch}
                  </button>
                )
              })}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Cadence">
              <select value={cadence} onChange={(e) => setCadence(e.target.value as CampaignCadence)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {CADENCES.map((c) => <option key={c} value={c} style={{ background: 'var(--surface)' }}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {STATUSES.map((s) => <option key={s} value={s} style={{ background: 'var(--surface)' }}>{s}</option>)}
              </select>
            </Field>
          </div>
        </Section>

        <Section label="Optional">
          <Field label="Owner">
            <input value={owner} onChange={(e) => setOwner(e.target.value)} style={inputStyle} placeholder="e.g. Demian" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} style={textareaStyle} placeholder="Internal notes, references, follow-ups…" />
          </Field>
        </Section>

        {error && (
          <div style={{
            fontSize: 12, color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid rgba(224,92,92,0.25)',
            borderRadius: 'var(--r-sm)',
            padding: '8px 12px',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={submitting || !name || !description || !cta}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 18px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--accent)',
              background: 'var(--accent)',
              color: '#000',
              fontSize: 13, fontWeight: 600,
              cursor: submitting || !name || !description || !cta ? 'default' : 'pointer',
              opacity: submitting || !name || !description || !cta ? 0.5 : 1,
            }}
          >
            {submitting && <IconLoader size={12} />}
            {submitting ? 'Creating…' : 'Create campaign'}
          </button>
          <Link
            href="/campaigns"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 13, textDecoration: 'none',
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em',
        color: 'var(--text-faint)',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4,
      }}>
        {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 4 }}>·</span>}
      </label>
      {children}
    </div>
  )
}
