'use client'

import { useState, useEffect } from 'react'
import type { Campaign, CampaignChannel, CampaignCadence } from '@/lib/types'

const CHANNELS: CampaignChannel[] = ['Email', 'LinkedIn', 'Letter', 'Phone']
const CADENCES: CampaignCadence[] = ['Daily', 'Twice weekly', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly']

interface StatusResult {
  anthropic: { status: 'connected' | 'error' | 'not_configured'; key_preview: string; error?: string }
  google_sheets: { status: 'connected' | 'error' | 'not_configured'; spreadsheet_id: string | null; key_preview: string; error?: string }
  mock_mode: boolean
}

interface Props {
  campaigns: Campaign[]
}

export default function SettingsClient({ campaigns }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <ConnectionsPanel />
      <GmailPanel />
      <CampaignsPanel campaigns={campaigns} />
      <PreferencesPanel />
    </div>
  )
}

// ─── Connections ─────────────────────────────────────────────────────────────

function ConnectionsPanel() {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [tested, setTested] = useState(false)

  async function checkStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/settings/status')
      setStatus(await res.json())
      setTested(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Panel title="Connections" description="API keys and integration status. Keys are read from .env.local — never exposed in the browser.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <ConnectionRow
          name="Anthropic (Claude API)"
          description="Required for Why now? analysis, Discovery Prep, and message drafting."
          envVar="ANTHROPIC_API_KEY"
          status={status?.anthropic}
          preview={status?.anthropic.key_preview}
        />

        <ConnectionRow
          name="Google Sheets"
          description="Source of truth for leads, companies, opportunities, and interactions."
          envVar="GOOGLE_SHEETS_SPREADSHEET_ID + GOOGLE_SERVICE_ACCOUNT_KEY"
          status={status?.google_sheets}
          preview={status?.google_sheets.key_preview}
          extra={status?.google_sheets.spreadsheet_id ? (
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>
              ID: {status.google_sheets.spreadsheet_id}
            </span>
          ) : null}
        />

        {status?.mock_mode && (
          <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--yellow)', lineHeight: 1.5 }}>
            Running in mock mode — Google Sheets is not connected. Data is stored in memory and resets on server restart.
            Add <code style={{ fontSize: 11, background: 'rgba(212,168,67,0.15)', padding: '1px 5px', borderRadius: 3 }}>GOOGLE_SHEETS_SPREADSHEET_ID</code> and a valid{' '}
            <code style={{ fontSize: 11, background: 'rgba(212,168,67,0.15)', padding: '1px 5px', borderRadius: 3 }}>GOOGLE_SERVICE_ACCOUNT_KEY</code> to <code style={{ fontSize: 11, background: 'rgba(212,168,67,0.15)', padding: '1px 5px', borderRadius: 3 }}>.env.local</code> to enable persistence.
          </div>
        )}

        <div style={{ paddingTop: 4 }}>
          <button
            onClick={checkStatus}
            disabled={loading}
            style={{
              padding: '7px 16px',
              background: tested && !loading ? 'var(--surface-2)' : 'var(--accent-dim)',
              color: tested && !loading ? 'var(--text-muted)' : 'var(--accent)',
              border: `1px solid ${tested && !loading ? 'var(--border)' : 'rgba(200,169,110,0.3)'}`,
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Testing connections…' : tested ? 'Re-test connections' : 'Test connections'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

function ConnectionRow({
  name,
  description,
  envVar,
  status,
  preview,
  extra,
}: {
  name: string
  description: string
  envVar: string
  status?: { status: 'connected' | 'error' | 'not_configured'; error?: string }
  preview?: string
  extra?: React.ReactNode
}) {
  const dot = status
    ? status.status === 'connected' ? '●'
      : status.status === 'error' ? '●'
      : '○'
    : '○'
  const dotColor = status
    ? status.status === 'connected' ? 'var(--green)'
      : status.status === 'error' ? 'var(--red)'
      : 'var(--text-faint)'
    : 'var(--text-faint)'

  const statusLabel = status
    ? status.status === 'connected' ? 'Connected'
      : status.status === 'error' ? 'Error'
      : 'Not configured'
    : 'Not tested'

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 16 }}>
          <span style={{ fontSize: 10, color: dotColor }}>{dot}</span>
          <span style={{ fontSize: 12, color: dotColor, fontWeight: 500 }}>{statusLabel}</span>
        </div>
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <code style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>
          {envVar}
        </code>
        {preview && (
          <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{preview}</span>
        )}
        {extra}
      </div>
      {status?.error && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', lineHeight: 1.5 }}>{status.error}</div>
      )}
    </div>
  )
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

type GmailStatus = {
  configured: boolean
  connected: boolean
  has_refresh_token: boolean
  thread_count: number
  analysis_count: number
}

function GmailPanel() {
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Read ?gmail= param on mount to show toast
  const [toast, setToast] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    const gmailParam = params.get('gmail')
    if (gmailParam === 'connected') return 'Gmail connected successfully.'
    if (gmailParam === 'denied') return 'Gmail connection was denied.'
    if (gmailParam === 'error') return 'Gmail connection failed - check OAuth credentials.'
    return null
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gmailParam = params.get('gmail')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (gmailParam === 'error') setToast('Gmail connection failed — check OAuth credentials.')
    if (gmailParam) {
      // Clean the URL
      const url = new URL(window.location.href)
      url.searchParams.delete('gmail')
      window.history.replaceState({}, '', url.toString())
    }
    checkStatus()
  }, [])

  async function checkStatus() {
    setLoading(true)
    try {
      const res = await fetch('/api/gmail/status')
      setStatus(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    try {
      await fetch('/api/gmail/auth', { method: 'DELETE' })
      await checkStatus()
    } finally {
      setDisconnecting(false)
    }
  }

  const dot = status?.connected ? '●' : '○'
  const dotColor = status?.connected ? 'var(--green)' : 'var(--text-faint)'

  return (
    <Panel title="Gmail" description="Read-only access to your conversations with leads. Oaki Relations never sends email automatically.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {toast && (
          <div style={{
            padding: '10px 14px',
            background: toast.includes('successfully') ? 'var(--green-dim)' : 'rgba(224,92,92,0.08)',
            border: `1px solid ${toast.includes('successfully') ? 'rgba(76,175,134,0.3)' : 'rgba(224,92,92,0.2)'}`,
            borderRadius: 6,
            fontSize: 12,
            color: toast.includes('successfully') ? 'var(--green)' : 'var(--red)',
          }}>
            {toast}
          </div>
        )}

        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Gmail OAuth</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {!status ? 'Checking…' : !status.configured ? 'GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET not set' : status.connected ? `${status.thread_count} threads synced · ${status.analysis_count} analyzed` : 'Not connected'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {!loading && <span style={{ fontSize: 10, color: dotColor }}>{dot}</span>}
              <span style={{ fontSize: 12, color: dotColor, fontWeight: 500 }}>
                {loading ? '…' : status?.connected ? 'Connected' : 'Not connected'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <code style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>
              GOOGLE_OAUTH_CLIENT_ID
            </code>
            <code style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4 }}>
              GOOGLE_OAUTH_CLIENT_SECRET
            </code>
          </div>
        </div>

        {status && !status.configured && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            To enable Gmail sync, create an OAuth 2.0 client in Google Cloud Console, add{' '}
            <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>http://localhost:3000/api/gmail/callback</code>{' '}
            as an authorized redirect URI, then add the credentials to <code style={{ fontSize: 11, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>.env.local</code>.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {status?.configured && !status.connected && (
            <a
              href="/api/gmail/auth"
              style={{
                display: 'inline-block',
                padding: '7px 16px',
                background: 'var(--accent-dim)',
                color: 'var(--accent)',
                border: '1px solid rgba(200,169,110,0.3)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Connect Gmail →
            </a>
          )}
          {status?.connected && (
            <button
              onClick={disconnect}
              disabled={disconnecting}
              style={{ ...ghostBtn, fontSize: 12 }}
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
          <button onClick={checkStatus} disabled={loading} style={{ ...ghostBtn, fontSize: 12 }}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

function CampaignsPanel({ campaigns }: { campaigns: Campaign[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [local, setLocal] = useState<Campaign[]>(campaigns)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  function updateCampaign(id: string, patch: Partial<Campaign>) {
    setLocal((prev) => prev.map((c) => c.campaign_id === id ? { ...c, ...patch } : c))
    setSaved(null)
  }

  async function saveCampaign(id: string) {
    setSaving(id)
    // In mock mode there's no persist endpoint yet — simulate save
    await new Promise((r) => setTimeout(r, 400))
    setSaving(null)
    setSaved(id)
    setEditing(null)
    setTimeout(() => setSaved(null), 2000)
  }

  return (
    <Panel title="Campaigns" description="Configure each campaign's target, channels, cadence, and CTA. Changes take effect immediately in mock mode.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {local.map((campaign) => {
          const isEditing = editing === campaign.campaign_id
          const isSaving = saving === campaign.campaign_id
          const isSaved = saved === campaign.campaign_id

          return (
            <div key={campaign.campaign_id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Header */}
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', cursor: 'pointer' }}
                onClick={() => !isEditing && setEditing(isEditing ? null : campaign.campaign_id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{campaign.name}</span>
                  <StatusBadge status={campaign.status} />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{campaign.channels.join(' · ')} · {campaign.cadence}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isSaved && <span style={{ fontSize: 11, color: 'var(--green)' }}>Saved</span>}
                  {!isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing(campaign.campaign_id) }}
                      style={ghostBtn}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>

              {/* Edit form */}
              {isEditing && (
                <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Name">
                      <input value={campaign.name} onChange={(e) => updateCampaign(campaign.campaign_id, { name: e.target.value })} style={inputSt} />
                    </Field>
                    <Field label="Status">
                      <select value={campaign.status} onChange={(e) => updateCampaign(campaign.campaign_id, { status: e.target.value as Campaign['status'] })} style={inputSt}>
                        <option value="Active">Active</option>
                        <option value="Paused">Paused</option>
                        <option value="Archived">Archived</option>
                      </select>
                    </Field>
                  </div>

                  <Field label="Description">
                    <textarea value={campaign.description} onChange={(e) => updateCampaign(campaign.campaign_id, { description: e.target.value })} rows={2} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
                  </Field>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Target segment">
                      <input value={campaign.target_segment} onChange={(e) => updateCampaign(campaign.campaign_id, { target_segment: e.target.value })} style={inputSt} />
                    </Field>
                    <Field label="Location">
                      <input value={campaign.location ?? ''} onChange={(e) => updateCampaign(campaign.campaign_id, { location: e.target.value })} placeholder="e.g. New York, Miami" style={inputSt} />
                    </Field>
                    <Field label="CTA">
                      <input value={campaign.cta} onChange={(e) => updateCampaign(campaign.campaign_id, { cta: e.target.value })} style={inputSt} />
                    </Field>
                    <Field label="Cadence">
                      <select value={campaign.cadence} onChange={(e) => updateCampaign(campaign.campaign_id, { cadence: e.target.value as CampaignCadence })} style={inputSt}>
                        {CADENCES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  </div>

                  <Field label="Channels">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {CHANNELS.map((ch) => {
                        const active = campaign.channels.includes(ch)
                        return (
                          <button
                            key={ch}
                            type="button"
                            onClick={() => updateCampaign(campaign.campaign_id, {
                              channels: active
                                ? campaign.channels.filter((c) => c !== ch)
                                : [...campaign.channels, ch],
                            })}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 6,
                              fontSize: 12,
                              cursor: 'pointer',
                              border: `1px solid ${active ? 'rgba(200,169,110,0.4)' : 'var(--border)'}`,
                              background: active ? 'var(--accent-dim)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-faint)',
                              fontWeight: active ? 500 : 400,
                            }}
                          >
                            {ch}
                          </button>
                        )
                      })}
                    </div>
                  </Field>

                  <Field label="Pain point">
                    <input value={campaign.pain_point ?? ''} onChange={(e) => updateCampaign(campaign.campaign_id, { pain_point: e.target.value })} placeholder="What problem does this campaign address?" style={inputSt} />
                  </Field>

                  <Field label="Notes">
                    <textarea value={campaign.notes ?? ''} onChange={(e) => updateCampaign(campaign.campaign_id, { notes: e.target.value })} rows={2} style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5 }} />
                  </Field>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => saveCampaign(campaign.campaign_id)}
                      disabled={isSaving}
                      style={{ ...ghostBtn, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,169,110,0.3)', padding: '7px 16px' }}
                    >
                      {isSaving ? 'Saving…' : 'Save campaign'}
                    </button>
                    <button onClick={() => { setEditing(null); setLocal(campaigns) }} style={{ ...ghostBtn, padding: '7px 12px' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

// ─── App Preferences ─────────────────────────────────────────────────────────

function PreferencesPanel() {
  const [prefs, setPrefs] = useState({
    owner: 'Demian',
    default_stage: 'New Lead',
    contact_rule: 'Research-based only — contact when there is a real signal, not on schedule.',
  })
  const [saved, setSaved] = useState(false)

  function save() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Panel title="Preferences" description="App-level defaults and contact rules.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Default owner">
            <input value={prefs.owner} onChange={(e) => setPrefs((p) => ({ ...p, owner: e.target.value }))} style={inputSt} />
          </Field>
          <Field label="Default pipeline stage for new leads">
            <select value={prefs.default_stage} onChange={(e) => setPrefs((p) => ({ ...p, default_stage: e.target.value }))} style={inputSt}>
              {['New Lead', 'Contacted', 'Nurture'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Contact rule">
          <textarea
            value={prefs.contact_rule}
            onChange={(e) => setPrefs((p) => ({ ...p, contact_rule: e.target.value }))}
            rows={2}
            style={{ ...inputSt, resize: 'vertical', lineHeight: 1.5, color: 'var(--text-muted)' }}
          />
        </Field>

        <div style={{ paddingTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={save}
            style={{ ...ghostBtn, background: saved ? 'var(--green-dim)' : 'var(--surface-2)', color: saved ? 'var(--green)' : 'var(--text-muted)', padding: '7px 16px', border: '1px solid var(--border)' }}
          >
            {saved ? 'Saved' : 'Save preferences'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{description}</div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: Campaign['status'] }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
      background: status === 'Active' ? 'var(--green-dim)' : status === 'Paused' ? 'var(--yellow-dim)' : 'var(--surface-3)',
      color: status === 'Active' ? 'var(--green)' : status === 'Paused' ? 'var(--yellow)' : 'var(--text-faint)',
    }}>
      {status}
    </span>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '6px 10px',
  color: 'var(--text)',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

const ghostBtn: React.CSSProperties = {
  padding: '5px 10px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--text-faint)',
  cursor: 'pointer',
}
