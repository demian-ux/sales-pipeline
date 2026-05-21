// Dashboard card registry. Single source of truth for card metadata —
// titles shown in the "+ Add card" picker and used by edit mode. The
// Component is bound in DashboardClient (which knows which props each card
// needs).

import type { DashboardCardId } from '@/lib/types'

export interface CardMeta {
  id: DashboardCardId
  title: string
  description: string
  removable: boolean
}

export const CARD_REGISTRY: Record<DashboardCardId, CardMeta> = {
  today: {
    id: 'today',
    title: 'Today',
    description: 'Auto signals + manual tasks ranked by due date.',
    removable: false,    // Today is permanent
  },
  opportunities: {
    id: 'opportunities',
    title: 'Strategic opportunities',
    description: 'Open opportunities ranked by urgency and confidence.',
    removable: true,
  },
  attention: {
    id: 'attention',
    title: 'Attention',
    description: 'Slower-rolling relationship risks and follow-ups.',
    removable: true,
  },
  conversations: {
    id: 'conversations',
    title: 'Conversations waiting',
    description: 'Gmail threads awaiting your reply.',
    removable: true,
  },
  discoveries: {
    id: 'discoveries',
    title: 'High-importance discoveries',
    description: 'Strong-signal market discoveries not yet promoted.',
    removable: true,
  },
  candidates: {
    id: 'candidates',
    title: 'High-importance candidates',
    description: 'Prospecting firm candidates with high fit scores.',
    removable: true,
  },
}

export const ALL_CARD_IDS: DashboardCardId[] = [
  'today',
  'opportunities',
  'attention',
  'conversations',
  'discoveries',
  'candidates',
]
