'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'

interface NavItem {
  href: string
  label: string
  // Extra path prefixes that should also light this item up (e.g. a lead
  // detail route belongs under Relationships).
  activeOn?: string[]
}

interface NavGroup {
  group: string | null
  items: NavItem[]
}

const NAV: NavGroup[] = [
  { group: null, items: [{ href: '/', label: 'Dashboard' }] },
  {
    group: 'People',
    items: [
      { href: '/relationships', label: 'Relationships', activeOn: ['/leads'] },
      { href: '/conversations', label: 'Conversations' },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { href: '/opportunities', label: 'Opportunities' },
      { href: '/campaigns', label: 'Campaigns' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { href: '/discoveries', label: 'Discoveries' },
      { href: '/research', label: 'Research' },
    ],
  },
  {
    group: 'Tools',
    items: [
      { href: '/import', label: 'Import' },
      { href: '/settings', label: 'Settings' },
    ],
  },
]

function matches(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

function isActive(item: NavItem, pathname: string): boolean {
  if (matches(item.href, pathname)) return true
  return (item.activeOn ?? []).some((p) => matches(p, pathname))
}

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
    <aside className="side">
      <div className="side-brand">
        <div className="side-mark">
          <span className="side-mark-accent">○</span> OAKI
        </div>
        <div className="side-sub">Relations</div>
      </div>
      <div className="side-rule" />

      <nav className="side-nav">
        {NAV.map((group, i) => (
          <div key={i} className="col" style={{ gap: 1 }}>
            {group.group && <div className="side-group-label">{group.group}</div>}
            {group.items.map((item) => {
              const active = isActive(item, pathname)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`side-item ${active ? 'active' : ''}`}
                >
                  <span className="side-item-dot">{active ? '●' : '○'}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="row" style={{ gap: 10 }}>
          <span className="side-foot-status-dot" />
          <div className="col" style={{ gap: 2, minWidth: 0 }}>
            <span className="side-foot-name">Demian Oki</span>
            <span className="micro" style={{ fontSize: 9, color: 'var(--ink-3)' }}>
              Buenos Aires · Founder
            </span>
          </div>
        </div>
        <button
          className="side-foot-logout"
          onClick={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </aside>
  )
}
