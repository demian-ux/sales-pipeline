import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

// Shared SVG wrapper for the individual named-export icons below.
function IconBase({ size = 14, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconSearch = (p: IconProps) => (
  <IconBase {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </IconBase>
)

export const IconX = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </IconBase>
)

export const IconChevronDown = (p: IconProps) => (
  <IconBase {...p}>
    <path d="m6 9 6 6 6-6" />
  </IconBase>
)

export const IconArrowLeft = (p: IconProps) => (
  <IconBase {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </IconBase>
)

export const IconExternalLink = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </IconBase>
)

export const IconCopy = (p: IconProps) => (
  <IconBase {...p}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </IconBase>
)

export const IconCheck = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M20 6 9 17l-5-5" />
  </IconBase>
)

export const IconRefresh = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </IconBase>
)

export const IconLoader = ({ className, ...p }: IconProps) => (
  <IconBase {...p} className={`animate-spin ${className ?? ''}`}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </IconBase>
)

export const IconMapPin = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </IconBase>
)

export const IconCalendar = (p: IconProps) => (
  <IconBase {...p}>
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </IconBase>
)

export const IconBuilding = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
  </IconBase>
)

export const IconZap = (p: IconProps) => (
  <IconBase {...p}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </IconBase>
)

export const IconTrendingUp = (p: IconProps) => (
  <IconBase {...p}>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
  </IconBase>
)

export const IconArrowUpRight = (p: IconProps) => (
  <IconBase {...p}>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </IconBase>
)

// ── Name-map icon ────────────────────────────────────────────────────────
// The redesigned pages use <Icon name="…" />. Stroke 1.5, currentColor,
// 24×24 viewBox — matches the design handoff's icon set.

export type IconName =
  | 'plus' | 'x' | 'chevdown' | 'chevright' | 'chevleft' | 'arrow' | 'arrowup'
  | 'search' | 'more' | 'snooze' | 'check' | 'drag' | 'mail' | 'linkedin'
  | 'phone' | 'external' | 'filter' | 'sparkle' | 'copy' | 'edit' | 'calendar'
  | 'pause' | 'archive' | 'trash'

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevdown: <path d="m6 9 6 6 6-6" />,
  chevright: <path d="m9 6 6 6-6 6" />,
  chevleft: <path d="m15 6-6 6 6 6" />,
  arrow: <path d="M5 12h14M13 5l7 7-7 7" />,
  arrowup: <path d="M12 19V5M5 12l7-7 7 7" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  more: <><circle cx="5" cy="12" r=".7" /><circle cx="12" cy="12" r=".7" /><circle cx="19" cy="12" r=".7" /></>,
  snooze: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 3 5 5M19 5l-4-2" /></>,
  check: <path d="M5 12.5 10 17.5 19.5 8" />,
  drag: (
    <>
      <circle cx="9" cy="6" r=".8" /><circle cx="15" cy="6" r=".8" />
      <circle cx="9" cy="12" r=".8" /><circle cx="15" cy="12" r=".8" />
      <circle cx="9" cy="18" r=".8" /><circle cx="15" cy="18" r=".8" />
    </>
  ),
  mail: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 7 9 7 9-7" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></>,
  phone: <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  external: <path d="M14 4h6v6M20 4l-9 9M16 13v6H5V8h6" />,
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  sparkle: <path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M6.3 17.7l2.4-2.4M15.3 8.7l2.4-2.4" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="1.5" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  edit: <path d="M4 20h4l10-10-4-4L4 16v4ZM13 7l4 4" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  pause: <><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></>,
  archive: <><rect x="3" y="4" width="18" height="4" /><path d="M5 8v12h14V8M10 13h4" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7v13h12V7M10 11v6M14 11v6" />,
}

interface NameIconProps {
  name: IconName
  size?: number
  style?: React.CSSProperties
  className?: string
}

export function Icon({ name, size = 14, style, className }: NameIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
