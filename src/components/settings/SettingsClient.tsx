'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { StatusBadge } from '@/components/ui/primitives'
import { Icon } from '@/components/ui/icons'

// ── Section nav ──────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'connections',   label: 'Connections',    count: 3 as number | null },
  { key: 'profile',       label: 'Profile',        count: null },
  { key: 'ai',            label: 'AI & voice',     count: null },
  { key: 'scoring',       label: 'Scoring',        count: null },
  { key: 'notifications', label: 'Notifications',  count: null },
  { key: 'data',          label: 'Data & export', count: null },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export default function SettingsClient() {
  const [section, setSection] = useState<SectionKey>('connections')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 32, alignItems: 'flex-start' }}>
      <aside className="col" style={{ gap: 2, position: 'sticky', top: 20 }}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={`settings-nav ${section === s.key ? 'active' : ''}`}
            onClick={() => setSection(s.key)}
          >
            <span>{s.label}</span>
            {s.count != null && (
              <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                {String(s.count).padStart(2, '0')}
              </span>
            )}
          </button>
        ))}
      </aside>

      <div className="col" style={{ gap: 18, minWidth: 0 }}>
        {section === 'connections'   && <ConnectionsSection />}
        {section === 'profile'       && <ProfileSection />}
        {section === 'ai'            && <AIVoiceSection />}
        {section === 'scoring'       && <ScoringSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'data'          && <DataSection />}
      </div>
    </div>
  )
}

// ── Connections (live) ───────────────────────────────────────────────────

type ConnStatus = 'checking' | 'connected' | 'error' | 'not_configured'

interface StatusResult {
  anthropic: { status: 'connected' | 'error' | 'not_configured'; key_preview: string; error?: string }
  google_sheets: {
    status: 'connected' | 'error' | 'not_configured'
    spreadsheet_id: string | null
    key_preview: string
    error?: string
  }
  mock_mode: boolean
}

interface GmailStatus {
  configured: boolean
  connected: boolean
  has_refresh_token: boolean
  thread_count: number
  analysis_count: number
}

const STATUS_META: Record<ConnStatus, { tone: 'ok' | 'warn' | 'risk' | 'info'; label: string }> = {
  checking:       { tone: 'info', label: 'Checking…' },
  connected:      { tone: 'ok',   label: 'Connected' },
  error:          { tone: 'risk', label: 'Error' },
  not_configured: { tone: 'info', label: 'Not connected' },
}

function ConnectionsSection() {
  const [status, setStatus] = useState<StatusResult | null>(null)
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [toast] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const g = new URLSearchParams(window.location.search).get('gmail')
    if (g === 'connected') return 'Gmail connected.'
    if (g === 'denied') return 'Gmail connection was denied.'
    if (g === 'error') return 'Gmail connection failed — check OAuth credentials.'
    return null
  })

  // First statement is an await, so every setState lands after the microtask
  // — no synchronous state writes when this runs inside the mount effect.
  async function fetchStatuses() {
    const [s, g] = await Promise.all([
      fetch('/api/settings/status').then((r) => r.json()).catch(() => null),
      fetch('/api/gmail/status').then((r) => r.json()).catch(() => null),
    ])
    setStatus(s)
    setGmail(g)
    setLoading(false)
  }

  useEffect(() => {
    // Strip the ?gmail= callback param so a refresh doesn't re-toast.
    const url = new URL(window.location.href)
    if (url.searchParams.has('gmail')) {
      url.searchParams.delete('gmail')
      window.history.replaceState({}, '', url.toString())
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch; setState only fires post-await
    fetchStatuses()
  }, [])

  function retest() {
    setLoading(true)
    fetchStatuses()
  }

  async function disconnectGmail() {
    setDisconnecting(true)
    try {
      await fetch('/api/gmail/auth', { method: 'DELETE' })
      await fetchStatuses()
    } finally {
      setDisconnecting(false)
    }
  }

  const claude: ConnStatus = loading ? 'checking' : status?.anthropic.status ?? 'not_configured'
  const sheets: ConnStatus = loading ? 'checking' : status?.google_sheets.status ?? 'not_configured'
  const gmailConn: ConnStatus = loading ? 'checking' : gmail?.connected ? 'connected' : 'not_configured'
  const connected = [claude, sheets, gmailConn].filter((s) => s === 'connected').length

  return (
    <>
      {toast && (
        <div
          className="card card-pad-sm"
          style={{ borderColor: 'var(--accent-line)', fontSize: 12, color: 'var(--ink-2)' }}
        >
          {toast}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div className="card-head-title">
            <span className="card-head-name">Connections</span>
            <span className="card-head-count">
              {connected} CONNECTED · {3 - connected} TO SET UP
            </span>
          </div>
          <button className="btn btn-sm" onClick={retest} disabled={loading}>
            {loading ? 'Checking…' : 'Re-test'}
          </button>
        </div>
        <div>
          <ConnectionRow
            name="Claude"
            detail={status?.anthropic.error ?? status?.anthropic.key_preview ?? 'Anthropic API · analysis + drafting'}
            status={claude}
          />
          <ConnectionRow
            name="Google Sheets"
            detail={
              status?.google_sheets.spreadsheet_id
                ? `Sheet ID ${status.google_sheets.spreadsheet_id}`
                : status?.google_sheets.error ?? 'Leads, companies, opportunities, interactions'
            }
            status={sheets}
            action={{ label: 'Schema check', href: '/settings/sheets' }}
          />
          <ConnectionRow
            name="Gmail"
            detail={
              gmail?.connected
                ? `${gmail.thread_count} threads synced · ${gmail.analysis_count} analyzed`
                : gmail?.configured
                  ? 'OAuth configured — not connected'
                  : 'OAuth credentials not set'
            }
            status={gmailConn}
            action={
              gmail?.connected
                ? { label: disconnecting ? 'Disconnecting…' : 'Disconnect', onClick: disconnectGmail }
                : gmail?.configured
                  ? { label: 'Connect', href: '/api/gmail/auth' }
                  : undefined
            }
            last
          />
        </div>
      </div>

      {status?.mock_mode && (
        <div className="card card-pad" style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-bg)' }}>
          <div className="warn" style={{ fontSize: 12.5, fontWeight: 500, marginBottom: 4 }}>
            Running in mock mode.
          </div>
          <div className="ink-2" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Google Sheets isn&apos;t connected — data lives in memory and resets on restart. Set{' '}
            <span className="mono">GOOGLE_SHEET_ID</span>, <span className="mono">GOOGLE_CLIENT_EMAIL</span>,
            and <span className="mono">GOOGLE_PRIVATE_KEY</span> to enable persistence.
          </div>
        </div>
      )}

      <div className="card card-pad-lg">
        <div className="row" style={{ gap: 10, marginBottom: 10 }}>
          <Icon name="sparkle" size={12} style={{ color: 'var(--accent)' }} />
          <span className="micro" style={{ color: 'var(--accent)' }}>Claude API</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          <span className="ink" style={{ fontSize: 13.5, fontWeight: 500 }}>API key — never shown.</span>
          <span className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: '62ch' }}>
            Read from the server environment. All analysis runs server-side — no drafts ever leave the studio
            without you pressing send.
          </span>
        </div>
      </div>
    </>
  )
}

interface ConnAction {
  label: string
  href?: string
  onClick?: () => void
}

function ConnectionRow({
  name,
  detail,
  status,
  action,
  last,
}: {
  name: string
  detail: string
  status: ConnStatus
  action?: ConnAction
  last?: boolean
}) {
  const meta = STATUS_META[status]
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '24px minmax(0, 1fr) auto auto',
        gap: 16,
        alignItems: 'center',
        padding: '14px 22px',
        borderBottom: last ? 'none' : '1px solid var(--line-subtle)',
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--r-xs)',
          background: 'var(--surface-2)',
          border: '1px solid var(--line)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--ink-2)',
          letterSpacing: '0.04em',
        }}
      >
        {name[0].toUpperCase()}
      </span>
      <div className="col" style={{ gap: 3, minWidth: 0 }}>
        <span className="ink truncate" style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
        <span className="ink-3 truncate" style={{ fontSize: 11.5 }}>{detail}</span>
      </div>
      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      {action ? (
        action.href ? (
          <a className="btn btn-xs" href={action.href}>
            {action.label} <Icon name="arrow" size={10} />
          </a>
        ) : (
          <button className="btn btn-xs" onClick={action.onClick}>
            {action.label}
          </button>
        )
      ) : (
        <span />
      )}
    </div>
  )
}

// ── Profile (static) ─────────────────────────────────────────────────────

function ProfileSection() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title">
          <span className="card-head-name">Profile</span>
        </div>
      </div>
      <div>
        <Setting label="Name" help="As it appears in email drafts and signatures.">
          <span className="ink" style={{ fontSize: 12.5 }}>Demian Oki</span>
        </Setting>
        <Setting label="Studio" help="Used in the from-name of outbound mail Claude drafts.">
          <span className="ink" style={{ fontSize: 12.5 }}>Oaki Studio · Buenos Aires</span>
        </Setting>
        <Setting label="Email" help="Source of truth for sender identity.">
          <span className="ink" style={{ fontSize: 12.5 }}>demian@oaki.studio</span>
        </Setting>
        <Setting label="Timezone" help="Affects 'today' rollover and due-date strings.">
          <span className="ink" style={{ fontSize: 12.5 }}>America/Argentina/Buenos_Aires (-03:00)</span>
        </Setting>
        <Setting label="Workday cutoff" help="Determines what counts as overdue.">
          <span className="ink" style={{ fontSize: 12.5 }}>18:00 local</span>
        </Setting>
      </div>
    </div>
  )
}

// ── AI & voice (static) ──────────────────────────────────────────────────

function AIVoiceSection() {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-head-title"><span className="card-head-name">Drafting</span></div>
        </div>
        <div>
          <Setting label="Voice samples" help="Claude reads recent sent mail to match your register.">
            <span className="ink" style={{ fontSize: 12.5 }}>Recent sent mail</span>
          </Setting>
          <Setting label="Register" help="Calibrate how warm or terse drafts read by default.">
            <div className="seg">
              <span className="seg-btn">Terse</span>
              <span className="seg-btn active">Calm</span>
              <span className="seg-btn">Warm</span>
            </div>
          </Setting>
          <Setting label="Sign-off" help="The exact string at the end of drafts.">
            <span className="ink mono" style={{ fontSize: 12.5 }}>— D.</span>
          </Setting>
          <Setting label="Auto-send" help="Off. Always off. Drafts never leave without you pressing send.">
            <span className="micro" style={{ color: 'var(--ink-2)' }}>OFF — PERMANENT</span>
          </Setting>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-head-title"><span className="card-head-name">Analysis</span></div>
        </div>
        <div>
          <Setting label="Cadence" help="How often Claude re-analyzes a lead without you asking.">
            <span className="ink" style={{ fontSize: 12.5 }}>Manual + on new signal</span>
          </Setting>
          <Setting label="Confidence floor" help="Drafts below this are flagged, not surfaced.">
            <span className="ink" style={{ fontSize: 12.5 }}>70%</span>
          </Setting>
        </div>
      </div>
    </>
  )
}

// ── Scoring (static) ─────────────────────────────────────────────────────

function ScoringSection() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title"><span className="card-head-name">Score weights</span></div>
        <span className="micro" style={{ color: 'var(--ink-3)' }}>SUM EQUALS 100</span>
      </div>
      <div>
        <Setting label="Taste fit" help="How aligned their work is with what Oaki does well.">
          <StaticSlider value={30} />
        </Setting>
        <Setting label="Business fit" help="Project type, budget, repeat potential.">
          <StaticSlider value={25} />
        </Setting>
        <Setting label="Relationship" help="Trust + cadence. Heavier for past clients.">
          <StaticSlider value={20} />
        </Setting>
        <Setting label="Opportunity strength" help="Quality and timeliness of the current signal.">
          <StaticSlider value={25} />
        </Setting>
      </div>
    </div>
  )
}

function StaticSlider({ value }: { value: number }) {
  return (
    <div className="row" style={{ gap: 12, minWidth: 240 }}>
      <div style={{ position: 'relative', width: 180, height: 4, background: 'var(--surface-3)', borderRadius: 2 }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${value}%`,
            background: 'var(--accent)',
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `calc(${value}% - 6px)`,
            top: -4,
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: '2px solid var(--bg)',
          }}
        />
      </div>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink)', minWidth: 28, textAlign: 'right' }}>
        {value}%
      </span>
    </div>
  )
}

// ── Notifications (static) ───────────────────────────────────────────────

function NotificationsSection() {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-head-title"><span className="card-head-name">Surface what, where</span></div>
      </div>
      <div>
        <Setting label="Overdue follow-ups" help="More than N days since last touch in Discovery+.">
          <NotifValue value="10 days" on />
        </Setting>
        <Setting label="Stalled proposals" help="No reply N days after sending a proposal.">
          <NotifValue value="14 days" on />
        </Setting>
        <Setting label="Dormant past clients" help="No contact in N days with a 'won' lead.">
          <NotifValue value="120 days" on />
        </Setting>
        <Setting label="High-importance discoveries" help="Surface on the dashboard when score is at or above the threshold.">
          <NotifValue value="≥ 78" on />
        </Setting>
        <Setting label="Daily digest email" help="One email each morning with today's queue.">
          <StaticToggle />
        </Setting>
      </div>
    </div>
  )
}

function NotifValue({ value, on }: { value: string; on?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <span className="mono" style={{ fontSize: 12.5, color: 'var(--ink)' }}>{value}</span>
      <StaticToggle on={on} />
    </span>
  )
}

function StaticToggle({ on }: { on?: boolean }) {
  return <span className={`toggle ${on ? 'on' : ''}`} />
}

// ── Data & export (static) ───────────────────────────────────────────────

function DataSection() {
  return (
    <div className="card card-pad-lg">
      <div className="col" style={{ gap: 6 }}>
        <span className="micro" style={{ color: 'var(--ink-3)' }}>Data</span>
        <span className="ink" style={{ fontSize: 14, fontWeight: 500 }}>
          Everything lives in Google Sheets and Supabase.
        </span>
        <span className="ink-2" style={{ fontSize: 12.5, lineHeight: 1.55, maxWidth: '62ch' }}>
          Leads, companies, opportunities, and interactions are editable directly in the master sheet.
          Discoveries and generated copy live in Supabase. Export and workspace-reset tooling is not wired
          up yet.
        </span>
      </div>
    </div>
  )
}

// ── Shared ───────────────────────────────────────────────────────────────

function Setting({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="col" style={{ gap: 0, minWidth: 0 }}>
        <span className="setting-key">{label}</span>
        {help && <span className="setting-help">{help}</span>}
      </div>
      <div>{children}</div>
    </div>
  )
}
