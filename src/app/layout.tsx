import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'Oaki Relations',
  description: 'Relationship intelligence for Oaki Studio',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', minHeight: '100vh' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
