import type {
  AIInsight,
  ResearchFinding,
  Interaction,
  Lead,
  Opportunity,
  Company,
  MeetingPrepOutput,
  StakeholderPrioritizationOutput,
  WorkflowAction,
} from '../types'
import type { ParsedThread, ConversationAnalysis } from '../gmail/types'

export type SessionCache = {
  insights: AIInsight[]
  research: ResearchFinding[]
  interactions: Interaction[]
  opportunities: Opportunity[]
  opportunityUpdates: Record<string, Partial<Opportunity>>
  leads: Lead[]
  leadUpdates: Record<string, Partial<Lead>>
  companies: Company[]
  meetingPreps: Record<string, MeetingPrepOutput>
  stakeholderPrioritizations: Record<string, StakeholderPrioritizationOutput>
  workflowActions: WorkflowAction[]
  threads: Record<string, ParsedThread[]>
  analyses: Record<string, ConversationAnalysis>
}

declare global {
  // eslint-disable-next-line no-var
  var __oaki_session_cache: SessionCache | undefined
}

if (!global.__oaki_session_cache) {
  global.__oaki_session_cache = {
    insights: [],
    research: [],
    interactions: [],
    opportunities: [],
    opportunityUpdates: {},
    leads: [],
    leadUpdates: {},
    companies: [],
    meetingPreps: {},
    stakeholderPrioritizations: {},
    workflowActions: [],
    threads: {},
    analyses: {},
  }
}

// Backfill guards for sessions created before new fields were added
const c = global.__oaki_session_cache
if (!c.leadUpdates) c.leadUpdates = {}
if (!c.meetingPreps) c.meetingPreps = {}
if (!c.opportunities) c.opportunities = []
if (!c.opportunityUpdates) c.opportunityUpdates = {}
if (!c.leads) c.leads = []
if (!c.companies) c.companies = []
if (!c.stakeholderPrioritizations) c.stakeholderPrioritizations = {}
if (!c.workflowActions) c.workflowActions = []
if (!c.threads) c.threads = {}
if (!c.analyses) c.analyses = {}

export const sessionCache: SessionCache = global.__oaki_session_cache
