interface BadgeProps {
  label: string
  variant?: 'default' | 'accent' | 'green' | 'yellow' | 'red' | 'blue' | 'muted'
}

const variantStyles: Record<string, React.CSSProperties> = {
  default: { background: 'var(--surface-3)', color: 'var(--text-muted)' },
  accent:  { background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,169,110,0.15)' },
  green:   { background: 'var(--green-dim)', color: 'var(--green)' },
  yellow:  { background: 'var(--yellow-dim)', color: 'var(--yellow)' },
  red:     { background: 'var(--red-dim)', color: 'var(--red)' },
  blue:    { background: 'var(--blue-dim)', color: 'var(--blue)' },
  muted:   { background: 'transparent', color: 'var(--text-faint)', border: '1px solid var(--border)' },
}

export default function Badge({ label, variant = 'default' }: BadgeProps) {
  return (
    <span className="badge" style={variantStyles[variant]}>
      {label}
    </span>
  )
}
