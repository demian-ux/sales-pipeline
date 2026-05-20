export type ConversationState =
  | 'waiting_for_us'
  | 'waiting_for_them'
  | 'active'
  | 'cooling'
  | 'dormant'

export type ConversationIntent =
  | 'high'
  | 'discovery_opportunity'
  | 'proposal_risk'
  | 'medium'
  | 'low'
  | 'none'

export type ConversationTone = 'warm' | 'neutral' | 'cold' | 'urgent'
export type ConversationMomentum = 'accelerating' | 'steady' | 'decelerating' | 'stalled'

export interface ParsedMessage {
  message_id: string
  from: string
  to: string[]
  subject: string
  body: string
  date: string
  direction: 'inbound' | 'outbound'
}

export interface ParsedThread {
  thread_id: string
  lead_id: string
  company_id: string
  subject: string
  snippet: string
  message_count: number
  last_message_at: string
  last_message_from: 'us' | 'them'
  participants: string[]
  messages: ParsedMessage[]
  inferred_state: ConversationState
}

export interface ConversationAnalysis {
  analysis_id: string
  thread_id: string
  lead_id: string
  state: ConversationState
  intent: ConversationIntent
  tone: ConversationTone
  momentum: ConversationMomentum
  urgency_signals: string[]
  objections: string[]
  relationship_signals: string[]
  summary: string
  recommended_response: string
  response_deadline?: string
  analyzed_at: string
}
