import Link from 'next/link'
import { getCampaigns } from '@/lib/sheets'
import SettingsClient from '@/components/settings/SettingsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const campaigns = await getCampaigns()
  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          API connections, campaign configuration, and app preferences.
        </p>
      </div>

      <Link
        href="/settings/sheets"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          marginBottom: 24,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          textDecoration: 'none',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
            Sheet schema check
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            Verify the column headers in each Google Sheets tab match what the app expects.
          </div>
        </div>
        <span style={{ fontSize: 13, color: 'var(--accent)' }}>Open →</span>
      </Link>

      <SettingsClient campaigns={campaigns} />
    </div>
  )
}
