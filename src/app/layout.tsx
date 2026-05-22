import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import SheetsStatusBanner from '@/components/layout/SheetsStatusBanner'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

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
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        {showSidebar ? (
          <div className="app">
            <Sidebar />
            <main className="main">
              <SheetsStatusBanner />
              <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
            </main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
