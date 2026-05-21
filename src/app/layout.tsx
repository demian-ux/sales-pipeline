import type { Metadata } from 'next'
import { headers } from 'next/headers'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import SheetsStatusBanner from '@/components/layout/SheetsStatusBanner'

export const metadata: Metadata = {
  title: 'Oaki Relations',
  description: 'Relationship intelligence for Oaki Studio',
}

// Routes that render outside the app shell (no sidebar). Match by prefix.
const NO_SHELL_PREFIXES = ['/login']

function isNoShell(pathname: string): boolean {
  return NO_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers()
  const pathname = headerStore.get('x-pathname') ?? ''
  const showSidebar = !isNoShell(pathname)

  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        {showSidebar && <Sidebar />}
        <main style={{ flex: 1, overflow: 'auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          {showSidebar && <SheetsStatusBanner />}
          <div style={{ flex: 1, minHeight: 0 }}>
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
