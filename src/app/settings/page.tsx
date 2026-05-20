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
      <SettingsClient campaigns={campaigns} />
    </div>
  )
}
