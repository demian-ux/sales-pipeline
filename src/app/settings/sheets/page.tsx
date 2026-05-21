import Link from 'next/link'
import { checkSheetSchemas, type SchemaCheckResult, type SchemaStatus } from '@/lib/sheets/schema'
import { USE_MOCK } from '@/lib/sheets/client'
import CopyHeadersButton from '@/components/settings/CopyHeadersButton'
import { IconArrowLeft } from '@/components/ui/icons'

export const dynamic = 'force-dynamic'

export default async function SheetsSetupPage() {
  if (USE_MOCK) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 900 }}>
        <Back />
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Sheet schema setup</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Google Sheets credentials are not configured, so there are no live tabs to check.
          Set <code>GOOGLE_SHEET_ID</code>, <code>GOOGLE_CLIENT_EMAIL</code>, and{' '}
          <code>GOOGLE_PRIVATE_KEY</code> in your environment, then return here.
        </p>
      </div>
    )
  }

  const results = await checkSheetSchemas()
  const issues = results.filter((r) => r.status.kind !== 'match').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1000 }}>
      <Back />
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Sheet schema setup</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Every entity tab in your Google Sheet should have a specific header row in row 1.
          If headers are missing, reordered, or renamed, writes will end up in the wrong columns
          and reads will surface as blank fields. This page checks each tab and shows you what to fix.
        </p>
      </div>

      <div
        style={{
          padding: '10px 14px',
          borderRadius: 'var(--r-md)',
          background: issues === 0 ? 'var(--green-dim)' : 'var(--accent-dim)',
          border: `1px solid ${issues === 0 ? 'rgba(76,175,134,0.3)' : 'rgba(200,169,110,0.3)'}`,
          fontSize: 12,
          color: issues === 0 ? 'var(--green)' : 'var(--accent)',
          marginBottom: 18,
        }}
      >
        {issues === 0
          ? `✓ All ${results.length} tabs match the canonical schema.`
          : `${issues} of ${results.length} tabs have schema issues. Details below.`}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {results.map((r) => (
          <TabRow key={r.tab} result={r} />
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 16, background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-md)' }}>
        <div style={{
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--text-faint)', marginBottom: 8,
        }}>How to apply canonical headers</div>
        <ol style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li>Click <strong>Copy headers</strong> for the tab you want to fix.</li>
          <li>In Google Sheets, open the matching tab and click cell <strong>A1</strong>.</li>
          <li>Paste — the headers spread across row 1 in the right order.</li>
          <li>
            <strong>Warning:</strong> if the tab already has data rows below, this overwrites the
            existing header row but does NOT re-order existing data — those rows will be misaligned
            and should be deleted and re-imported.
          </li>
        </ol>
      </div>
    </div>
  )
}

function Back() {
  return (
    <Link
      href="/settings"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none',
        marginBottom: 16,
      }}
    >
      <IconArrowLeft size={12} /> Settings
    </Link>
  )
}

function statusBadge(status: SchemaStatus) {
  const map: Record<SchemaStatus['kind'], { label: string; color: string; bg: string; border: string }> = {
    match:     { label: '✓ Match',         color: 'var(--green)',      bg: 'var(--green-dim)',  border: 'rgba(76,175,134,0.3)' },
    reordered: { label: '⚠ Reordered',     color: 'var(--accent)',     bg: 'var(--accent-dim)', border: 'rgba(200,169,110,0.3)' },
    partial:   { label: '⚠ Partial',       color: 'var(--accent)',     bg: 'var(--accent-dim)', border: 'rgba(200,169,110,0.3)' },
    empty:     { label: '○ Empty',         color: 'var(--text-faint)', bg: 'var(--surface-2)',  border: 'var(--border)' },
    missing:   { label: '✗ Missing',       color: 'var(--red)',        bg: 'var(--red-dim)',    border: 'rgba(224,92,92,0.3)' },
  }
  const s = map[status.kind]
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 'var(--r-xs)',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      fontWeight: 500, flexShrink: 0,
    }}>
      {s.label}
    </span>
  )
}

function TabRow({ result }: { result: SchemaCheckResult }) {
  const { tab, description, canonicalHeaders, status } = result
  return (
    <div
      style={{
        padding: '14px 18px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0, fontFamily: 'SF Mono, ui-monospace, monospace' }}>
              {tab}
            </h2>
            {statusBadge(status)}
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
        <CopyHeadersButton headers={canonicalHeaders} />
      </div>

      {status.kind === 'missing' && (
        <Detail tone="red">
          {status.error}
        </Detail>
      )}
      {status.kind === 'empty' && (
        <Detail tone="muted">
          Tab exists but has no header row. The first write will bootstrap canonical headers automatically.
        </Detail>
      )}
      {status.kind === 'reordered' && (
        <Detail tone="accent">
          Same headers, different order. Writes still land correctly thanks to header-aware mapping,
          but for consistency with other deployments consider applying the canonical order.
        </Detail>
      )}
      {status.kind === 'partial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {status.missing.length > 0 && (
            <Detail tone="accent">
              <strong>Missing in your sheet ({status.missing.length}):</strong> {status.missing.join(', ')}
            </Detail>
          )}
          {status.extra.length > 0 && (
            <Detail tone="muted">
              <strong>Extra columns ({status.extra.length}, ignored by app):</strong> {status.extra.join(', ')}
            </Detail>
          )}
        </div>
      )}
    </div>
  )
}

function Detail({ children, tone }: { children: React.ReactNode; tone: 'red' | 'accent' | 'muted' }) {
  const palette = {
    red:    { color: 'var(--red)',        bg: 'var(--red-dim)',    border: 'rgba(224,92,92,0.2)' },
    accent: { color: 'var(--accent)',     bg: 'var(--accent-dim)', border: 'rgba(200,169,110,0.2)' },
    muted:  { color: 'var(--text-muted)', bg: 'var(--surface-2)',  border: 'var(--border)' },
  }[tone]
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 'var(--r-sm)',
      fontSize: 11,
      color: palette.color,
      background: palette.bg,
      border: `1px solid ${palette.border}`,
      lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}
