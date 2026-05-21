import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import DiscoveryScoreBadge from '@/components/discoveries/DiscoveryScoreBadge'
import StatusUpdater from '@/components/discoveries/StatusUpdater'
import GenerateOutreach from '@/components/discoveries/GenerateOutreach'
import { IconArrowLeft, IconExternalLink, IconCheck } from '@/components/ui/icons'
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from '@/lib/discoveries/googleNewsResolver'
import type { Discovery, DiscoverySector } from '@/lib/types'

export const dynamic = 'force-dynamic'

const SECTOR_LABELS: Record<DiscoverySector, string> = {
  hospitality: 'Hospitality',
  luxury_residential: 'Luxury Residential',
  mixed_use: 'Mixed-Use',
  airports: 'Airports',
  office: 'Office',
  transport: 'Transport',
  cultural: 'Cultural',
  retail: 'Retail',
  other: 'Other',
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  architecture_firm:     'Architecture Firm',
  real_estate_developer: 'Developer',
  interior_designer:     'Interior Designer',
  urban_planner:         'Urban Planner',
}

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  service: 'Service',
  tender:  'Tender / RFP',
  trend:   'Strategic Trend',
}

export default async function DiscoveryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Gracefully handle the pre-provisioning case
  if (!isSupabaseAdminConfigured()) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: 720 }}>
        <Link href="/discoveries" style={{ fontSize: 12, color: 'var(--text-faint)', display: 'block', marginBottom: 16 }}>
          ← Discoveries
        </Link>
        <div style={{
          padding: 20,
          background: 'var(--accent-dim)',
          border: '1px solid rgba(200,169,110,0.3)',
          borderRadius: 'var(--r-md)',
        }}>
          <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 6 }}>Supabase not provisioned.</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Discovery detail pages need Supabase. Set the env vars and run <code>supabase/schema.sql</code>, then return here.
          </div>
        </div>
      </div>
    )
  }

  const { data, error } = await getSupabaseAdmin()
    .from('discoveries')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  const d = data as Discovery & { promoted_to_opportunity_id?: string | null }

  // Self-heal Google News redirect URLs left over from older ingest runs.
  // Jina Reader returns HTTP 451 on news.google.com URLs, so the find-firms
  // flow dead-ends without this. We resolve once on first view, persist back,
  // and every subsequent view uses the cached publisher URL. Failures are
  // silent — the find-firms UI will surface them clearly if Jina later fails.
  if (isGoogleNewsUrl(d.source_url)) {
    try {
      const resolved = await resolveGoogleNewsUrl(d.source_url)
      if (resolved !== d.source_url) {
        const { error: updateErr } = await getSupabaseAdmin()
          .from('discoveries')
          .update({ source_url: resolved })
          .eq('id', d.id)
        // Unique-constraint violation = another discovery already has this
        // resolved URL (same article surfaced via two GNews queries). Use the
        // resolved URL in-memory for this render anyway so find-firms works.
        if (updateErr && updateErr.code !== '23505') {
          console.warn(`[discovery/${d.id}] persist resolved URL failed: ${updateErr.message}`)
        }
        d.source_url = resolved
      }
    } catch (err) {
      console.warn(`[discovery/${d.id}] Google News resolve failed: ${err instanceof Error ? err.message : err}`)
    }
  }

  const location = [d.city, d.country].filter(Boolean).join(', ')
  const pubDate = d.date_published ? format(new Date(d.date_published), 'dd MMM yyyy') : null

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Link href="/discoveries" style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12, color: 'var(--text-faint)',
        textDecoration: 'none', alignSelf: 'flex-start',
      }}>
        <IconArrowLeft size={12} /> Discoveries
      </Link>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <DiscoveryScoreBadge score={d.discovery_score} size="lg" />
          <h1 style={{ flex: 1, fontSize: 22, fontWeight: 600, lineHeight: 1.3, margin: 0 }}>
            {d.title}
          </h1>
        </div>

        {/* Source meta */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
          fontSize: 12, color: 'var(--text-muted)',
          paddingLeft: 52,
        }}>
          <a
            href={d.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}
          >
            {d.source}
            <IconExternalLink size={11} style={{ opacity: 0.5 }} />
          </a>
          {pubDate && <span>{pubDate}</span>}
          {location && <span>{location}</span>}
          {d.region && d.region !== d.city && <span style={{ color: 'var(--text-faint)' }}>{d.region}</span>}
        </div>

        {/* Classification badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 52 }}>
          {d.sector && <Tag>{SECTOR_LABELS[d.sector as DiscoverySector] ?? d.sector}</Tag>}
          {(d.opportunity_type ?? []).map((t) => (
            <Tag key={t} tone="blue">{OPPORTUNITY_TYPE_LABELS[t] ?? t}</Tag>
          ))}
          {(d.target_client_types ?? []).map((ct) => (
            <Tag key={ct}>{CLIENT_TYPE_LABELS[ct] ?? ct}</Tag>
          ))}
        </div>
      </div>

      {/* Firms finder — hands off to the import/prospecting page (same proven
          pipeline as the standalone Import flow). The page reads ?url= and
          ?discoveryId= from the query string, auto-runs the analysis, and
          shows a "Promote N to Opportunity" button that posts back to
          /api/discoveries/[id]/promote-firms so the resulting Opportunities
          get attached to this Discovery. */}
      <Section title="Firms — promote to Opportunity">
        <FindFirmsLink
          discoveryId={d.id}
          sourceUrl={d.source_url}
          alreadyPromotedOpportunityId={d.promoted_to_opportunity_id}
        />
      </Section>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
        {/* Left — analysis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {d.why_it_matters && (
            <Section title="Why it matters">
              <p style={bodyText}>{d.why_it_matters}</p>
            </Section>
          )}

          {d.brief_summary && (
            <Section title="Summary">
              <p style={{ ...bodyText, color: 'var(--text-muted)' }}>{d.brief_summary}</p>
            </Section>
          )}

          <Section title="Deep analysis">
            {d.deep_analysis ? (
              <div style={{ ...bodyText, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>
                {d.deep_analysis}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                Not available for this article.
              </p>
            )}
          </Section>

          {d.suggested_action && (
            <Section title="Suggested action">
              <div style={{
                background: 'var(--accent-dim)',
                border: '1px solid rgba(200,169,110,0.25)',
                borderRadius: 'var(--r-md)',
                padding: '12px 16px',
              }}>
                <p style={{ ...bodyText, color: 'var(--text)', margin: 0 }}>{d.suggested_action}</p>
              </div>
            </Section>
          )}

          {d.tags && d.tags.length > 0 && (
            <Section title="Tags">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.tags.map((tag) => (
                  <span key={tag} style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 'var(--r-xs)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-faint)',
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          <GenerateOutreach discoveryId={d.id} />
        </div>

        {/* Right — metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Score breakdown */}
          <Panel title="Score breakdown">
            <ScoreBar label="Opportunity Clarity" value={d.score_opportunity_clarity} weight={35} />
            <ScoreBar label="Investment Size"     value={d.score_investment_size}     weight={20} />
            <ScoreBar label="Timing"              value={d.score_timing}              weight={15} />
            <ScoreBar label="Key Actors"          value={d.score_actors}              weight={10} />
            <ScoreBar label="Sector Growth"       value={d.score_sector_growth}       weight={10} />
            <ScoreBar label="Region Strategic"    value={d.score_region_strategic}    weight={10} />
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <MetaRow label="Urgency"    value={d.urgency_score    != null ? String(d.urgency_score)    : '—'} />
              <MetaRow label="Confidence" value={d.confidence_score != null ? String(d.confidence_score) : '—'} />
            </div>
          </Panel>

          {/* Project details */}
          {(d.investment_size || d.timeline || d.project_type || d.developer || d.architect || d.government_body) && (
            <Panel title="Project details">
              {d.investment_size && <MetaRow label="Investment" value={d.investment_size} />}
              {d.timeline        && <MetaRow label="Timeline"   value={d.timeline} />}
              {d.project_type    && <MetaRow label="Type"       value={d.project_type} />}
              {d.developer       && <MetaRow label="Developer"  value={d.developer} />}
              {d.architect       && <MetaRow label="Architect"  value={d.architect} />}
              {d.government_body && <MetaRow label="Government" value={d.government_body} />}
            </Panel>
          )}

          {/* Key actors */}
          {d.main_actors && d.main_actors.length > 0 && (
            <Panel title="Key actors">
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.main_actors.map((actor) => (
                  <li key={actor} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ color: 'var(--text-faint)' }}>—</span>
                    {actor}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <StatusUpdater discoveryId={d.id} currentStatus={d.status} />
        </div>
      </div>
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.7,
  color: 'var(--text)',
  margin: 0,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'var(--text-faint)',
        margin: 0,
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

// Hands off to /import/prospecting with the article URL pre-filled. That page
// auto-runs the pipeline and (because ?discoveryId is present) shows a
// Promote-to-Opportunity action that attaches the resulting Opportunities back
// to this Discovery. Keeping this as a server component (plain Link, no client
// JS) since the actual interactive work lives on the destination page.
function FindFirmsLink({
  discoveryId,
  sourceUrl,
  alreadyPromotedOpportunityId,
}: {
  discoveryId: string
  sourceUrl: string
  alreadyPromotedOpportunityId?: string | null
}) {
  const href = `/import/prospecting?url=${encodeURIComponent(sourceUrl)}&discoveryId=${encodeURIComponent(discoveryId)}`
  return (
    <div style={{
      padding: 16,
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      {alreadyPromotedOpportunityId && (
        <div style={{ fontSize: 12, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <IconCheck size={12} /> Already promoted from this Discovery. You can find more firms to attach.
        </div>
      )}
      <Link
        href={href}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px 18px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--accent)',
          background: 'var(--accent)',
          color: '#000',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        Find candidate firms →
      </Link>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0, lineHeight: 1.6 }}>
        Opens the Prospecting flow with this article&apos;s URL pre-loaded. Runs Jina → Claude → Tavily →
        Claude (≈30–60 s). Pick the keepers and click &ldquo;Promote to Opportunity&rdquo; — each becomes a
        Company in your Sheet plus a Company-level Opportunity attached to this Discovery. Apollo
        imports of contacts at those companies will auto-attach.
      </p>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      background: 'var(--surface)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-2)',
      }}>
        <h3 style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-faint)',
          margin: 0,
        }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function Tag({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'blue' }) {
  const styles = {
    default: { color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)' },
    blue:    { color: 'var(--blue)', background: 'var(--blue-dim)', border: '1px solid rgba(92,142,212,0.2)' },
  }
  return (
    <span style={{
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 'var(--r-xs)',
      ...styles[tone],
    }}>
      {children}
    </span>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>{label}</span>
      <span style={{
        color: 'var(--text)',
        textAlign: 'right',
        fontFamily: 'SF Mono, ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </span>
    </div>
  )
}

function ScoreBar({ label, value, weight }: { label: string; value: number | null; weight: number }) {
  const pct = value ?? 0
  const color =
    pct >= 70 ? 'var(--green)' :
    pct >= 50 ? 'var(--yellow)' :
                'var(--red)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)' }}>
          {label}
          <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>({weight}%)</span>
        </span>
        <span style={{
          fontFamily: 'SF Mono, ui-monospace, monospace',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text)',
        }}>
          {value ?? '—'}
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          transition: 'width 0.25s ease',
        }} />
      </div>
    </div>
  )
}
