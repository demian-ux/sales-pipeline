import type { PipelineStage, RelationshipTemperature, UrgencyLevel } from './types'

export function stageVariant(stage: PipelineStage): 'green' | 'accent' | 'yellow' | 'red' | 'blue' | 'muted' | 'default' {
  switch (stage) {
    case 'Won': return 'green'
    case 'Discovery':
    case 'Proposal Sent':
    case 'Negotiation': return 'accent'
    case 'Replied': return 'blue'
    case 'Contacted': return 'yellow'
    case 'Lost': return 'red'
    case 'Dormant': return 'muted'
    default: return 'default'
  }
}

export function tempVariant(temp: RelationshipTemperature): 'green' | 'yellow' | 'accent' | 'muted' {
  switch (temp) {
    case 'Hot': return 'green'
    case 'Warm': return 'yellow'
    case 'Cool': return 'accent'
    case 'Cold': return 'muted'
  }
}

export function urgencyVariant(urgency: UrgencyLevel): 'red' | 'yellow' | 'muted' {
  switch (urgency) {
    case 'High': return 'red'
    case 'Medium': return 'yellow'
    case 'Low': return 'muted'
  }
}

export function relativeDate(dateStr?: string): string {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

export function dueDateStatus(dateStr?: string): 'overdue' | 'today' | 'soon' | 'upcoming' | 'none' {
  if (!dateStr) return 'none'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'today'
  if (diffDays <= 3) return 'soon'
  return 'upcoming'
}

export function scoreColor(score?: number): string {
  if (!score) return 'var(--text-faint)'
  if (score >= 8) return 'var(--green)'
  if (score >= 6) return 'var(--yellow)'
  return 'var(--red)'
}
