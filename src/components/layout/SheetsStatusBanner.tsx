import { getSheetsStatus } from '@/lib/sheets/client'

// Renders a thin warning strip at the top of <main> when Google Sheets is
// degraded (recent runtime error) or in mock mode (no credentials). When
// Sheets is healthy the component returns null and renders nothing.
//
// Server component — reads module-level status set by lib/sheets/client.ts.

export default function SheetsStatusBanner() {
  const status = getSheetsStatus()
  if (status.mode === 'live') return null

  const isMock = status.mode === 'mock'
  const palette = isMock
    ? { bg: 'var(--blue-dim)',  fg: 'var(--blue)',   border: 'rgba(92,142,212,0.3)' }
    : { bg: 'var(--red-dim)',   fg: 'var(--red)',    border: 'rgba(224,92,92,0.3)' }

  const title = isMock
    ? 'Mock mode'
    : 'Google Sheets unavailable'

  const detail = isMock
    ? 'No Google service-account credentials configured — showing sample data. Set GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, and GOOGLE_PRIVATE_KEY in your environment.'
    : status.lastError
      ? `Reads are falling back to sample data and writes will fail until this clears. Most recent error: ${status.lastError}`
      : 'Reads are falling back to sample data and writes will fail until this clears.'

  return (
    <div
      style={{
        padding: '8px 16px',
        fontSize: 12,
        background: palette.bg,
        color: palette.fg,
        borderBottom: `1px solid ${palette.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ fontWeight: 600 }}>{title}</span>
      <span style={{ color: 'var(--text-muted)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {detail}
      </span>
    </div>
  )
}
