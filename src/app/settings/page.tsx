import SettingsClient from '@/components/settings/SettingsClient'

export default function SettingsPage() {
  return (
    <div className="page" style={{ maxWidth: 1180 }}>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">Tools</div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Connections, preferences, scoring weights. Engineering-first.</div>
        </div>
      </div>
      <SettingsClient />
    </div>
  )
}
