'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IconLoader, IconCheck, IconX } from '@/components/ui/icons'

interface LeadOption {
  id: string
  name: string
  company_name: string
  title?: string
}

interface PromoteButtonProps {
  discoveryId: string
  alreadyPromotedOpportunityId?: string | null
}

export default function PromoteButton({ discoveryId, alreadyPromotedOpportunityId }: PromoteButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || leads.length > 0) return
    setLoadingLeads(true)
    fetch('/api/leads')
      .then((r) => r.json())
      .then((data) => {
        const list: LeadOption[] = (data.leads ?? []).map((l: { lead_id: string; full_name: string; company_name: string; title?: string }) => ({
          id: l.lead_id,
          name: l.full_name,
          company_name: l.company_name,
          title: l.title,
        }))
        setLeads(list)
      })
      .catch(() => setError('Could not load leads'))
      .finally(() => setLoadingLeads(false))
  }, [open, leads.length])

  async function promote() {
    if (!selectedId) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/discoveries/${discoveryId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: selectedId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Promote failed (${res.status})`)
      // Redirect to the lead's detail page so user can enrich the new Opportunity
      router.push(`/leads/${selectedId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Promote failed')
      setSubmitting(false)
    }
  }

  const filtered = search.trim()
    ? leads.filter((l) => {
        const q = search.toLowerCase()
        return l.name.toLowerCase().includes(q) || l.company_name.toLowerCase().includes(q)
      })
    : leads

  if (alreadyPromotedOpportunityId) {
    return (
      <div style={{
        border: '1px solid rgba(76,175,134,0.3)',
        background: 'var(--green-dim)',
        borderRadius: 'var(--r-md)',
        padding: 14,
        fontSize: 12,
        color: 'var(--green)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <IconCheck size={14} />
        Already promoted to an Opportunity.
      </div>
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: 'var(--r-md)',
          background: 'var(--accent)',
          color: '#000',
          border: '1px solid var(--accent)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Promote to Opportunity
      </button>
    )
  }

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      background: 'var(--surface)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <h3 style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--text-faint)',
          margin: 0,
        }}>
          Promote — attach a Lead
        </h3>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close"
          style={{ background: 'transparent', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 2 }}
        >
          <IconX size={12} />
        </button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads…"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '6px 10px',
            fontSize: 12,
            color: 'var(--text)',
            outline: 'none',
          }}
        />

        {loadingLeads ? (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconLoader size={11} /> Loading leads…
          </div>
        ) : (
          <div style={{
            maxHeight: 240,
            overflowY: 'auto',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--text-faint)' }}>
                {leads.length === 0 ? 'No leads found.' : 'No matches.'}
              </div>
            ) : (
              filtered.map((l) => {
                const isSelected = selectedId === l.id
                return (
                  <button
                    key={l.id}
                    onClick={() => setSelectedId(l.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      background: isSelected ? 'var(--surface-2)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {l.title ? `${l.title} · ` : ''}{l.company_name}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>
        )}

        <button
          onClick={promote}
          disabled={!selectedId || submitting}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--r-sm)',
            background: selectedId ? 'var(--accent)' : 'var(--surface-2)',
            color: selectedId ? '#000' : 'var(--text-faint)',
            border: '1px solid',
            borderColor: selectedId ? 'var(--accent)' : 'var(--border)',
            fontSize: 12,
            fontWeight: 600,
            cursor: selectedId && !submitting ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {submitting && <IconLoader size={12} />}
          {submitting ? 'Promoting…' : 'Create Opportunity'}
        </button>
      </div>
    </div>
  )
}
