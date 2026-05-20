import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function ImportLanding() {
  return (
    <div style={{ padding: '28px 32px', maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-faint)',
            marginBottom: 4,
          }}
        >
          Import
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Bring in leads and prospects
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.6 }}>
          Two flows. Apollo CSV adds people you already know about. Prospecting discovers new firms from a news article.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card
          href="/import/apollo"
          title="Apollo CSV"
          subtitle="Bulk import"
          description="Drop an Apollo export. Auto-maps columns, detects duplicates, then creates leads and companies in your Sheet."
          tag="Leads + Companies"
        />
        <Card
          href="/import/prospecting"
          title="Prospecting"
          subtitle="Article → firms"
          description="Paste a news article URL. Claude extracts the project, Tavily finds candidate firms in the same country, and you decide which ones to keep."
          tag="Candidate Firms"
        />
      </div>
    </div>
  )
}

function Card({
  href,
  title,
  subtitle,
  description,
  tag,
}: {
  href: string
  title: string
  subtitle: string
  description: string
  tag: string
}) {
  return (
    <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>
      <div
        className="card-clickable"
        style={{
          padding: '20px 22px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          height: '100%',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--accent)',
              marginBottom: 4,
            }}
          >
            {subtitle}
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {title}
          </h2>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          {description}
        </p>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 'var(--r-xs)',
              border: '1px solid var(--border)',
              color: 'var(--text-faint)',
            }}
          >
            {tag}
          </span>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>Open →</span>
        </div>
      </div>
    </Link>
  )
}
