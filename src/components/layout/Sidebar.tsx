'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

// Nav groups with cleaner ASCII-safe icons.
// Note: /strategic-map page file still exists but is hidden from nav per
// Phase 4 cleanup (the feature is deprioritized — see audit-summary.md).
const NAV_GROUPS = [
  {
    items: [
      { href: '/',              label: 'Dashboard',      icon: '·' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/relationships', label: 'Relationships',  icon: '·' },
      { href: '/conversations', label: 'Conversations',  icon: '·' },
    ],
  },
  {
    label: 'Pipeline',
    items: [
      { href: '/opportunities', label: 'Opportunities',  icon: '·' },
      { href: '/campaigns',     label: 'Campaigns',      icon: '·' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/discoveries',   label: 'Discoveries',    icon: '·' },
      { href: '/research',      label: 'Research',       icon: '·' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { href: '/import',        label: 'Import',         icon: '·' },
      { href: '/settings',      label: 'Settings',       icon: '·' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  return (
    <aside style={{
      width: 196,
      minHeight: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
    }}>

      {/* Brand */}
      <div style={{
        padding: '20px 16px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: 'var(--accent)',
          textTransform: 'uppercase',
        }}>
          Oaki
        </div>
        <div style={{
          fontSize: 10,
          color: 'var(--text-faint)',
          marginTop: 2,
          letterSpacing: '0.06em',
        }}>
          Relations
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi} style={{ marginBottom: gi < NAV_GROUPS.length - 1 ? 6 : 0 }}>
            {/* Group label */}
            {group.label && (
              <div style={{
                fontSize: 9,
                fontWeight: 600,
                color: 'var(--text-faint)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: '10px 8px 4px',
              }}>
                {group.label}
              </div>
            )}

            {/* Items */}
            {group.items.map((item) => {
              const active = pathname === item.href

              return (
                <Link key={item.href} href={item.href}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    marginBottom: 1,
                    fontSize: 12.5,
                    fontWeight: active ? 500 : 400,
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    background: active ? 'var(--surface-2)' : 'transparent',
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all 0.12s ease',
                    cursor: 'pointer',
                    // hover handled by CSS class below
                  }}
                  className="sidebar-item"
                  >
                    <span style={{
                      fontSize: 6,
                      color: active ? 'var(--accent)' : 'var(--text-faint)',
                      flexShrink: 0,
                      lineHeight: 1,
                    }}>
                      {active ? '●' : '○'}
                    </span>
                    {item.label}
                  </div>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-subtle)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          demian@oaki.studio
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          title="Log out"
          style={{
            fontSize: 10,
            color: 'var(--text-faint)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: loggingOut ? 'default' : 'pointer',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {loggingOut ? '…' : 'Log out'}
        </button>
      </div>
    </aside>
  )
}
