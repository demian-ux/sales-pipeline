'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type {
  Lead,
  LinkedInConnectionStatus,
  LinkedInDMStatus,
  LinkedInWarmth,
  PipelineStage,
  RelationshipTemperature,
} from '@/lib/types'

const STAGES: PipelineStage[] = [
  'New Lead', 'Contacted', 'Replied', 'Discovery',
  'Proposal Sent', 'Negotiation', 'Won', 'Lost', 'Nurture', 'Dormant', 'Held',
]

const TEMPERATURES: RelationshipTemperature[] = ['Hot', 'Warm', 'Cool', 'Cold']
const LINKEDIN_CONNECTION_STATUSES: LinkedInConnectionStatus[] = ['Not Connected', 'Connection Ready', 'Connection Sent', 'Connected', 'Unknown']
const LINKEDIN_DM_STATUSES: LinkedInDMStatus[] = ['Not Started', 'DM Ready', 'DM Sent', 'Replied', 'Not Interested', 'Unknown']
const LINKEDIN_WARMTHS: LinkedInWarmth[] = ['Passive', 'Aware', 'Connected', 'Warm', 'Engaged', 'Active']

interface Props {
  lead: Lead
}

export default function LeadEditForm({ lead }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    pipeline_stage: lead.pipeline_stage,
    held_reason: lead.held_reason ?? '',
    held_until: lead.held_until?.slice(0, 10) ?? '',
    relationship_temperature: lead.relationship_temperature ?? '',
    linkedin_url: lead.linkedin_url ?? '',
    linkedin_connection_status: lead.linkedin_connection_status ?? '',
    linkedin_dm_status: lead.linkedin_dm_status ?? '',
    linkedin_warmth: lead.linkedin_warmth ?? '',
    last_linkedin_touch_date: lead.last_linkedin_touch_date?.slice(0, 10) ?? '',
    linkedin_notes: lead.linkedin_notes ?? '',
    next_action: lead.next_action ?? '',
    next_followup_date: lead.next_followup_date ?? '',
    known_pain_points: lead.known_pain_points ?? '',
    notes: lead.notes ?? '',
    business_fit_score: lead.business_fit_score?.toString() ?? '',
    taste_score: lead.taste_score?.toString() ?? '',
    relationship_score: lead.relationship_score?.toString() ?? '',
    opportunity_score: lead.opportunity_score?.toString() ?? '',
    priority_score: lead.priority_score?.toString() ?? '',
  })

  function set<K extends keyof typeof form>(key: K, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        pipeline_stage: form.pipeline_stage,
        // Only send held metadata when the lead is actually Held — avoids
        // clobbering the fields when moving a lead out of Held.
        held_reason: form.pipeline_stage === 'Held' ? (form.held_reason || undefined) : undefined,
        held_until: form.pipeline_stage === 'Held' ? (form.held_until || undefined) : undefined,
        relationship_temperature: form.relationship_temperature || undefined,
        next_action: form.next_action || undefined,
        next_followup_date: form.next_followup_date || undefined,
        known_pain_points: form.known_pain_points || undefined,
        notes: form.notes || undefined,
        linkedin_url: form.linkedin_url || undefined,
        linkedin_connection_status: form.linkedin_connection_status || undefined,
        linkedin_dm_status: form.linkedin_dm_status || undefined,
        linkedin_warmth: form.linkedin_warmth || undefined,
        last_linkedin_touch_date: form.last_linkedin_touch_date || undefined,
        linkedin_notes: form.linkedin_notes || undefined,
      }
      const scoreFields = ['business_fit_score', 'taste_score', 'relationship_score', 'opportunity_score', 'priority_score'] as const
      for (const f of scoreFields) {
        const val = parseFloat(form[f])
        if (!isNaN(val) && val >= 1 && val <= 10) payload[f] = val
      }

      const res = await fetch(`/api/leads/${lead.lead_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')

      setSaved(true)
      setTimeout(() => router.refresh(), 600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span>Edit Lead</span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stage + Temperature */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Label>Stage</Label>
                <select
                  value={form.pipeline_stage}
                  onChange={(e) => set('pipeline_stage', e.target.value)}
                  style={inputStyle}
                >
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <Label>Temperature</Label>
                <select
                  value={form.relationship_temperature}
                  onChange={(e) => set('relationship_temperature', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">—</option>
                  {TEMPERATURES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Held metadata — only when the lead is parked in Held. */}
            {form.pipeline_stage === 'Held' && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                <div>
                  <Label>Held reason *</Label>
                  <input
                    value={form.held_reason}
                    onChange={(e) => set('held_reason', e.target.value)}
                    placeholder="Why parked? (required)"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <Label>Re-arm on</Label>
                  <input
                    type="date"
                    value={form.held_until}
                    onChange={(e) => set('held_until', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            <div>
              <Label>LinkedIn URL</Label>
              <input
                value={form.linkedin_url}
                onChange={(e) => set('linkedin_url', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Label>LinkedIn connection</Label>
                <select
                  value={form.linkedin_connection_status}
                  onChange={(e) => set('linkedin_connection_status', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Not set</option>
                  {LINKEDIN_CONNECTION_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div>
                <Label>LinkedIn DM</Label>
                <select
                  value={form.linkedin_dm_status}
                  onChange={(e) => set('linkedin_dm_status', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Not set</option>
                  {LINKEDIN_DM_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <Label>LinkedIn warmth</Label>
                <select
                  value={form.linkedin_warmth}
                  onChange={(e) => set('linkedin_warmth', e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Not set</option>
                  {LINKEDIN_WARMTHS.map((warmth) => <option key={warmth} value={warmth}>{warmth}</option>)}
                </select>
              </div>
              <div>
                <Label>Last LinkedIn touch</Label>
                <input
                  type="date"
                  value={form.last_linkedin_touch_date}
                  onChange={(e) => set('last_linkedin_touch_date', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <Label>LinkedIn notes</Label>
              <textarea
                value={form.linkedin_notes}
                onChange={(e) => set('linkedin_notes', e.target.value)}
                placeholder="Manual LinkedIn context, warmth, or risks."
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            {/* Next action */}
            <div>
              <Label>Next action</Label>
              <input
                value={form.next_action}
                onChange={(e) => set('next_action', e.target.value)}
                placeholder="What's the next step?"
                style={inputStyle}
              />
            </div>

            {/* Follow-up date */}
            <div>
              <Label>Follow-up date</Label>
              <input
                type="date"
                value={form.next_followup_date}
                onChange={(e) => set('next_followup_date', e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Scores */}
            <div>
              <Label>Scores (1–10)</Label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                {[
                  { key: 'business_fit_score' as const, label: 'Fit' },
                  { key: 'taste_score' as const, label: 'Taste' },
                  { key: 'relationship_score' as const, label: 'Relation' },
                  { key: 'opportunity_score' as const, label: 'Opp' },
                  { key: 'priority_score' as const, label: 'Priority' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 3 }}>{label}</div>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      style={{ ...inputStyle, textAlign: 'center', padding: '5px 6px' }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Known pain points */}
            <div>
              <Label>Known pain points</Label>
              <input
                value={form.known_pain_points}
                onChange={(e) => set('known_pain_points', e.target.value)}
                placeholder="What are their frustrations?"
                style={inputStyle}
              />
            </div>

            {/* Notes */}
            <div>
              <Label>Notes</Label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Context, observations, anything relevant…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleSave}
                disabled={saving || saved}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: saved ? 'var(--green-dim)' : 'var(--accent-dim)',
                  color: saved ? 'var(--green)' : 'var(--accent)',
                  border: `1px solid ${saved ? 'rgba(76,175,134,0.3)' : 'rgba(200,169,110,0.3)'}`,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: saving || saved ? 'default' : 'pointer',
                }}
              >
                {saved ? 'Saved — reloading…' : saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '8px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-faint)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>

            {error && (
              <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
      {children}
    </div>
  )
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
  boxSizing: 'border-box',
}
