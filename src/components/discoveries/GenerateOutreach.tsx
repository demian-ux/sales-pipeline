'use client'

import { useState } from 'react'
import type { DiscoveryClientType } from '@/lib/types'
import { IconCopy, IconCheck, IconLoader, IconChevronDown } from '@/components/ui/icons'

interface GenerateOutreachProps {
  discoveryId: string
}

type OutputType = 'letter' | 'email' | 'linkedin'

const CLIENT_TYPE_OPTIONS: { value: DiscoveryClientType; label: string }[] = [
  { value: 'architecture_firm',     label: 'Architecture Firm' },
  { value: 'real_estate_developer', label: 'Real Estate Developer' },
  { value: 'interior_designer',     label: 'Interior Designer' },
  { value: 'urban_planner',         label: 'Urban Planner' },
]

const OUTPUT_TYPES: { value: OutputType; label: string }[] = [
  { value: 'letter',   label: 'Letter' },
  { value: 'email',    label: 'Email' },
  { value: 'linkedin', label: 'LinkedIn' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '6px 10px',
  fontSize: 12,
  color: 'var(--text)',
  outline: 'none',
}

export default function GenerateOutreach({ discoveryId }: GenerateOutreachProps) {
  const [recipientName, setRecipientName]     = useState('')
  const [recipientCompany, setRecipientCompany] = useState('')
  const [clientType, setClientType]           = useState<DiscoveryClientType>('architecture_firm')
  const [activeTab, setActiveTab]             = useState<OutputType>('letter')
  const [outputs, setOutputs] = useState<Record<OutputType, string>>({ letter: '', email: '', linkedin: '' })
  const [loading, setLoading] = useState<Record<OutputType, boolean>>({ letter: false, email: false, linkedin: false })
  const [errors,  setErrors]  = useState<Record<OutputType, string>>({ letter: '', email: '', linkedin: '' })
  const [copied,  setCopied]  = useState(false)

  async function generate(type: OutputType) {
    setLoading((p) => ({ ...p, [type]: true }))
    setErrors((p) => ({ ...p, [type]: '' }))
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}/generate/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_name:    recipientName || undefined,
          recipient_company: recipientCompany || undefined,
          client_type:       clientType,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors((p) => ({ ...p, [type]: data.error ?? `Request failed (${res.status})` }))
        return
      }
      const content = data.letter ?? data.email ?? data.linkedin ?? ''
      if (!content) {
        setErrors((p) => ({ ...p, [type]: 'Empty response from server' }))
        return
      }
      setOutputs((p) => ({ ...p, [type]: content }))
      setActiveTab(type)
    } catch (err) {
      setErrors((p) => ({ ...p, [type]: err instanceof Error ? err.message : 'Network error' }))
    } finally {
      setLoading((p) => ({ ...p, [type]: false }))
    }
  }

  async function copy() {
    const text = outputs[activeTab]
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const anyLoading = Object.values(loading).some(Boolean)

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <h3 style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
          margin: 0,
        }}>
          Generate Outreach
        </h3>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Recipient fields */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Field label="Recipient">
            <input
              type="text"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="John Smith"
              style={inputStyle}
            />
          </Field>
          <Field label="Company">
            <input
              type="text"
              value={recipientCompany}
              onChange={(e) => setRecipientCompany(e.target.value)}
              placeholder="Studio XYZ"
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Client type">
          <div style={{ position: 'relative' }}>
            <select
              value={clientType}
              onChange={(e) => setClientType(e.target.value as DiscoveryClientType)}
              style={{ ...inputStyle, appearance: 'none', paddingRight: 24, cursor: 'pointer' }}
            >
              {CLIENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: 'var(--surface)' }}>
                  {opt.label}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={12}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-faint)', pointerEvents: 'none',
              }}
            />
          </div>
        </Field>

        {/* Generate buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {OUTPUT_TYPES.map(({ value: type, label }) => {
            const hasOutput = !!outputs[type]
            return (
              <button
                key={type}
                onClick={() => generate(type)}
                disabled={anyLoading}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 11,
                  padding: '6px 0',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid',
                  background: hasOutput ? 'var(--accent-dim)' : 'transparent',
                  borderColor: hasOutput ? 'rgba(200,169,110,0.3)' : 'var(--border)',
                  color: hasOutput ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: anyLoading ? 'default' : 'pointer',
                  opacity: anyLoading ? 0.5 : 1,
                }}
              >
                {loading[type] && <IconLoader size={11} />}
                {loading[type] ? 'Generating…' : hasOutput ? `${label} ✓` : label}
              </button>
            )
          })}
        </div>

        {/* Errors */}
        {OUTPUT_TYPES.map(({ value: type, label }) =>
          errors[type] ? (
            <div key={type} style={{
              fontSize: 11,
              color: 'var(--red)',
              background: 'var(--red-dim)',
              border: '1px solid rgba(224,92,92,0.2)',
              borderRadius: 'var(--r-sm)',
              padding: '6px 10px',
            }}>
              {label}: {errors[type]}
            </div>
          ) : null,
        )}

        {/* Output viewer */}
        {(outputs.letter || outputs.email || outputs.linkedin) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {OUTPUT_TYPES.filter(({ value }) => outputs[value]).map(({ value: t, label }) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 'var(--r-xs)',
                    border: 'none',
                    background: activeTab === t ? 'var(--surface-2)' : 'transparent',
                    color: activeTab === t ? 'var(--text)' : 'var(--text-faint)',
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={copy}
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  padding: '4px 10px',
                  borderRadius: 'var(--r-xs)',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-faint)',
                }}
              >
                {copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {outputs[activeTab] && (
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                padding: 14,
              }}>
                <pre style={{
                  fontSize: 12,
                  color: 'var(--text)',
                  lineHeight: 1.6,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                }}>
                  {outputs[activeTab]}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-faint)',
        marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}
