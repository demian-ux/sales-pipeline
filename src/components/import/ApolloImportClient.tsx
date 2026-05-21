'use client'

import { useState, useRef, useCallback } from 'react'
import type { Campaign, ApolloImportRow } from '@/lib/types'

// ── Apollo column auto-mapping ─────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ApolloImportRow> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'email': 'email',
  'email address': 'email',
  'title': 'title',
  'job title': 'title',
  'company': 'company_name',
  'company name': 'company_name',
  'organization': 'company_name',
  'website': 'website',
  'company website': 'website',
  'linkedin url': 'linkedin_url',
  'person linkedin url': 'linkedin_url',
  'company linkedin url': 'linkedin_company_url',
  'city': 'location',
  'industry': 'industry',
  '# employees': 'company_size',
  'employees': 'company_size',
  'number of employees': 'company_size',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile phone': 'phone',
}

const DISPLAY_FIELDS: { key: keyof ApolloImportRow; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'title', label: 'Title' },
  { key: 'company_name', label: 'Company' },
  { key: 'website', label: 'Website' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'linkedin_company_url', label: 'Co. LinkedIn' },
  { key: 'location', label: 'Location' },
  { key: 'industry', label: 'Industry' },
  { key: 'company_size', label: 'Size' },
]

// ── CSV parser ─────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  function parseLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

function mapRows(headers: string[], rows: string[][], fieldMap: Record<string, keyof ApolloImportRow>): ApolloImportRow[] {
  return rows
    .map((row) => {
      const mapped: Partial<ApolloImportRow> = {}
      headers.forEach((h, i) => {
        // fieldMap is keyed by the original header (set via autoMap[header]
        // and the select dropdowns). Looking up by `h.toLowerCase().trim()`
        // here used to always miss → every row became empty → 0 valid rows.
        const field = fieldMap[h]
        if (field) (mapped as Record<string, string>)[field] = row[i] ?? ''
      })
      return mapped as ApolloImportRow
    })
    .filter((r) => r.first_name || r.last_name || r.email)
}

// ── Types ──────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'review' | 'importing' | 'done'

interface Props {
  campaigns: Campaign[]
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ApolloImportClient({ campaigns }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [fieldMap, setFieldMap] = useState<Record<string, keyof ApolloImportRow>>({})
  const [previewRows, setPreviewRows] = useState<ApolloImportRow[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [campaignId, setCampaignId] = useState<string>('')
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [result, setResult] = useState<{ created_leads: number; created_companies: number; skipped_duplicates: number; errors: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Step 1: Upload ─────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) { setError('Could not parse CSV — check the file format.'); return }
      setHeaders(h)
      setRawRows(r)
      // Auto-map
      const autoMap: Record<string, keyof ApolloImportRow> = {}
      h.forEach((header) => {
        const mapped = COLUMN_MAP[header.toLowerCase().trim()]
        if (mapped) autoMap[header] = mapped
      })
      setFieldMap(autoMap)
      setError(null)
      setStep('mapping')
    }
    reader.readAsText(file)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── Step 2: Mapping ────────────────────────────────────────────────────

  const mappedRows = mapRows(headers, rawRows, fieldMap)

  const handlePreview = async () => {
    if (mappedRows.length === 0) { setError('No valid rows to preview.'); return }
    setPreviewing(true)
    setError(null)
    try {
      const res = await fetch('/api/import/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mappedRows, dry_run: true }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Preview failed'); return }
      const annotated: ApolloImportRow[] = data.rows
      setPreviewRows(annotated)
      const toSelect = new Set(
        annotated
          .map((_, i) => i)
          .filter((i) => annotated[i].action !== 'duplicate')
      )
      setSelectedIds(toSelect)
      setStep('review')
    } finally {
      setPreviewing(false)
    }
  }

  // ── Step 3: Review → Import ────────────────────────────────────────────

  const toggleRow = (i: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIds.size === previewRows.filter((r) => r.action !== 'duplicate').length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(previewRows.map((_, i) => i).filter((i) => previewRows[i].action !== 'duplicate')))
    }
  }

  const handleImport = async () => {
    const toImport = previewRows.filter((_, i) => selectedIds.has(i))
    if (toImport.length === 0) { setError('No rows selected.'); return }
    setStep('importing')
    setError(null)
    try {
      const res = await fetch('/api/import/apollo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: toImport, campaign_id: campaignId || undefined, dry_run: false }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Import failed'); setStep('review'); return }
      setResult(data.summary)
      setStep('done')
    } catch {
      setError('Network error during import')
      setStep('review')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  const dupCount = previewRows.filter((r) => r.action === 'duplicate').length
  const newCount = previewRows.filter((r) => r.action === 'create').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
          Import
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Apollo CSV Import</h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          Enrichment and stakeholder discovery only. Apollo data supplements — it does not overwrite existing relationship intelligence.
        </p>
      </div>

      {/* Step indicator */}
      <StepBar step={step} />

      {error && (
        <div style={{ background: 'rgba(224,92,92,0.08)', border: '1px solid rgba(224,92,92,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--red)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* ── Step: Upload ── */}
      {step === 'upload' && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: '48px 32px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface)' }}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          />
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>⬆</div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Drop Apollo CSV here</div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>or click to browse · .csv only</div>
          <div style={{ marginTop: 20, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Expected columns: First Name · Last Name · Email · Title · Company · Website · LinkedIn URL · Industry · # Employees
          </div>
        </div>
      )}

      {/* ── Step: Mapping ── */}
      {step === 'mapping' && (
        <div>
          <SectionLabel>Column mapping</SectionLabel>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            {headers.length} columns detected · {rawRows.length} rows · Auto-mapped {Object.keys(fieldMap).length} fields
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
            {headers.map((h) => (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>→</span>
                <select
                  value={fieldMap[h] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value as keyof ApolloImportRow | ''
                    setFieldMap((prev) => {
                      const next = { ...prev }
                      if (val) next[h] = val
                      else delete next[h]
                      return next
                    })
                  }}
                  style={{ fontSize: 11, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '3px 6px', color: fieldMap[h] ? 'var(--text)' : 'var(--text-faint)' }}
                >
                  <option value="">— skip —</option>
                  {DISPLAY_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <SectionLabel>Preview (first 3 rows)</SectionLabel>
          <div style={{ overflowX: 'auto', marginBottom: 24 }}>
            <PreviewTable rows={mappedRows.slice(0, 3)} />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => setStep('upload')} style={btnStyle('secondary')}>Back</button>
            <button onClick={handlePreview} disabled={previewing || mappedRows.length === 0} style={btnStyle('primary')}>
              {previewing ? 'Checking duplicates…' : `Check ${mappedRows.length} rows →`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Review ── */}
      {step === 'review' && (
        <div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <Stat label="New" value={newCount} color="var(--green)" />
            <Stat label="Duplicates" value={dupCount} color="var(--text-faint)" />
            <Stat label="Selected" value={selectedIds.size} color="var(--accent)" />
          </div>

          {/* Campaign selector */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-faint)' }}>Assign to campaign:</label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                style={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', color: 'var(--text)' }}
              >
                <option value="">— none —</option>
                {campaigns.filter((c) => c.status === 'Active').map((c) => (
                  <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>
                ))}
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
              Skip duplicates
            </label>
          </div>

          {/* Row table */}
          <div style={{ overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', width: 32 }}>
                    <input type="checkbox" onChange={toggleAll} checked={selectedIds.size > 0 && selectedIds.size === newCount} />
                  </th>
                  {['Name', 'Title', 'Company', 'Email', 'LinkedIn', 'Status'].map((h) => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => {
                  const isDup = row.action === 'duplicate'
                  const isSelected = selectedIds.has(i)
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border-subtle)', opacity: isDup ? 0.5 : 1, background: isSelected && !isDup ? 'rgba(200,169,110,0.04)' : 'transparent', cursor: isDup ? 'default' : 'pointer' }}
                      onClick={() => !isDup && toggleRow(i)}
                    >
                      <td style={{ padding: '7px 10px' }}>
                        <input type="checkbox" checked={isSelected} disabled={isDup} onChange={() => toggleRow(i)} onClick={(e) => e.stopPropagation()} />
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{row.first_name} {row.last_name}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{row.title || '—'}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-muted)' }}>{row.company_name}</td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-faint)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.email || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>
                        {row.linkedin_url ? (
                          <a href={row.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: 'var(--accent)' }} onClick={(e) => e.stopPropagation()}>↗ Profile</a>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {isDup ? (
                          <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 4 }} title={row.duplicate_reason}>Duplicate</span>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--green)', background: 'rgba(80,180,120,0.1)', padding: '2px 7px', borderRadius: 4 }}>New</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep('mapping')} style={btnStyle('secondary')}>Back</button>
            <button onClick={handleImport} disabled={selectedIds.size === 0} style={btnStyle('primary')}>
              Import {selectedIds.size} lead{selectedIds.size !== 1 ? 's' : ''} →
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ── */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Importing leads and companies…</div>
        </div>
      )}

      {/* ── Step: Done ── */}
      {step === 'done' && result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(80,180,120,0.07)', border: '1px solid rgba(80,180,120,0.25)', borderRadius: 10, padding: '24px 28px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', marginBottom: 16 }}>Import complete</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--green)', lineHeight: 1 }}>{result.created_leads}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>leads created</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--accent)', lineHeight: 1 }}>{result.created_companies}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>companies created</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-faint)', lineHeight: 1 }}>{result.skipped_duplicates}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>skipped (duplicates)</div>
              </div>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div style={{ background: 'rgba(224,92,92,0.06)', border: '1px solid rgba(224,92,92,0.2)', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>Errors ({result.errors.length})</div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>· {e}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <a href="/relationships" style={{ ...btnStyle('primary') as React.CSSProperties, textDecoration: 'none', display: 'inline-block' }}>
              View relationships →
            </a>
            <button onClick={() => { setStep('upload'); setPreviewRows([]); setHeaders([]); setRawRows([]); setResult(null) }} style={btnStyle('secondary')}>
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'mapping', label: 'Mapping' },
    { id: 'review', label: 'Review' },
    { id: 'importing', label: 'Importing' },
    { id: 'done', label: 'Done' },
  ]
  const activeIdx = steps.findIndex((s) => s.id === step)

  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 28, alignItems: 'center' }}>
      {steps.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600,
              background: i < activeIdx ? 'var(--green)' : i === activeIdx ? 'var(--accent)' : 'var(--surface-2)',
              color: i <= activeIdx ? 'white' : 'var(--text-faint)',
              border: `1px solid ${i < activeIdx ? 'transparent' : i === activeIdx ? 'var(--accent)' : 'var(--border)'}`,
            }}>
              {i < activeIdx ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 11, color: i === activeIdx ? 'var(--text)' : 'var(--text-faint)' }}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 24, height: 1, background: 'var(--border)', margin: '0 8px' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
      {children}
    </h2>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 16px', minWidth: 80, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

function PreviewTable({ rows }: { rows: ApolloImportRow[] }) {
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '12px 0' }}>No valid rows found after mapping.</div>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          {DISPLAY_FIELDS.filter((f) => rows.some((r) => r[f.key])).map((f) => (
            <th key={f.key} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {f.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {DISPLAY_FIELDS.filter((f) => rows.some((r) => r[f.key])).map((f) => (
              <td key={f.key} style={{ padding: '7px 10px', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row[f.key] || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function btnStyle(variant: 'primary' | 'secondary') {
  const base: React.CSSProperties = {
    padding: '8px 18px',
    fontSize: 12,
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
    border: '1px solid',
  }
  if (variant === 'primary') {
    return { ...base, background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
  }
  return { ...base, background: 'transparent', color: 'var(--text-muted)', borderColor: 'var(--border)' }
}
