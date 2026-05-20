interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  onClick?: () => void
  hoverable?: boolean
}

export default function Card({ children, style, onClick, hoverable }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px',
        cursor: hoverable || onClick ? 'pointer' : 'default',
        transition: hoverable || onClick ? 'border-color 0.15s' : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (hoverable || onClick) {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-hover, #3a3a3a)'
        }
      }}
      onMouseLeave={(e) => {
        if (hoverable || onClick) {
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
        }
      }}
    >
      {children}
    </div>
  )
}
