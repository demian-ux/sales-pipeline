'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { IconLoader } from '@/components/ui/icons'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'

  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Login failed (${res.status})`)
        return
      }
      // Server has set the cookie; navigate to the post-login destination.
      router.push(next)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
      <label
        htmlFor="login-password"
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
        }}
      >
        Password
      </label>
      <input
        id="login-password"
        type="password"
        autoFocus
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)',
          padding: '10px 12px',
          fontSize: 14,
          color: 'var(--text)',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={loading || !password}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 14px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#000',
          fontSize: 13,
          fontWeight: 600,
          cursor: loading || !password ? 'default' : 'pointer',
          opacity: loading || !password ? 0.5 : 1,
        }}
      >
        {loading && <IconLoader size={12} />}
        {loading ? 'Checking…' : 'Continue'}
      </button>
      {error && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--red)',
            background: 'var(--red-dim)',
            border: '1px solid rgba(224,92,92,0.25)',
            borderRadius: 'var(--r-sm)',
            padding: '8px 10px',
          }}
        >
          {error}
        </div>
      )}
    </form>
  )
}

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: 32,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.14em',
            color: 'var(--accent)',
            textTransform: 'uppercase',
          }}
        >
          Oaki
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-faint)',
            marginTop: 2,
            letterSpacing: '0.06em',
          }}
        >
          Relations
        </div>
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
