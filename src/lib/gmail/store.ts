// Supabase-backed persistence for Gmail threads + thread analyses.
// Replaces sessionCache storage, which was wiped on every restart/redeploy
// and was per-instance on Vercel (sync and analyze could hit different
// instances). Falls back to sessionCache only when Supabase isn't configured
// (mock/dev mode).

import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase'
import { sessionCache } from '@/lib/sheets/cache'
import type { ParsedThread, ConversationAnalysis, ConversationState } from './types'

type ThreadRow = {
  thread_id: string
  lead_id: string
  company_id: string
  subject: string | null
  snippet: string | null
  message_count: number | null
  last_message_at: string | null
  last_message_from: string | null
  participants: string[] | null
  messages: unknown
  inferred_state: string | null
}

function toIsoOrNull(value: string): string | null {
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function rowToThread(row: ThreadRow): ParsedThread {
  return {
    thread_id: row.thread_id,
    lead_id: row.lead_id,
    company_id: row.company_id,
    subject: row.subject ?? '(no subject)',
    snippet: row.snippet ?? '',
    message_count: row.message_count ?? 0,
    last_message_at: row.last_message_at ?? '',
    last_message_from: row.last_message_from === 'us' ? 'us' : 'them',
    participants: row.participants ?? [],
    messages: (row.messages as ParsedThread['messages']) ?? [],
    inferred_state: (row.inferred_state ?? 'dormant') as ConversationState,
  }
}

function threadToRow(t: ParsedThread) {
  return {
    thread_id: t.thread_id,
    lead_id: t.lead_id,
    company_id: t.company_id,
    subject: t.subject,
    snippet: t.snippet,
    message_count: t.message_count,
    last_message_at: toIsoOrNull(t.last_message_at),
    last_message_from: t.last_message_from,
    participants: t.participants,
    messages: t.messages,
    inferred_state: t.inferred_state,
    synced_at: new Date().toISOString(),
  }
}

export async function saveThreadsForLead(leadId: string, threads: ParsedThread[]): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    sessionCache.threads[leadId] = threads
    return
  }
  if (threads.length === 0) return
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('threads')
    .upsert(threads.map(threadToRow), { onConflict: 'thread_id' })
  if (error) throw new Error(`Failed to save threads: ${error.message}`)
}

export async function getAllThreads(): Promise<ParsedThread[]> {
  if (!isSupabaseAdminConfigured()) {
    return Object.values(sessionCache.threads).flat()
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .order('last_message_at', { ascending: false })
  if (error) {
    console.error('getAllThreads error:', error.message)
    return []
  }
  return (data as ThreadRow[]).map(rowToThread)
}

export async function getThreadsForLead(leadId: string): Promise<ParsedThread[]> {
  if (!isSupabaseAdminConfigured()) {
    return sessionCache.threads[leadId] ?? []
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('lead_id', leadId)
    .order('last_message_at', { ascending: false })
  if (error) {
    console.error('getThreadsForLead error:', error.message)
    return []
  }
  return (data as ThreadRow[]).map(rowToThread)
}

export async function getThread(threadId: string): Promise<ParsedThread | null> {
  if (!isSupabaseAdminConfigured()) {
    return Object.values(sessionCache.threads).flat().find((t) => t.thread_id === threadId) ?? null
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('thread_id', threadId)
    .maybeSingle()
  if (error || !data) return null
  return rowToThread(data as ThreadRow)
}

export async function saveAnalysis(analysis: ConversationAnalysis): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    sessionCache.analyses[analysis.thread_id] = analysis
    return
  }
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('thread_analyses').insert({
    analysis_id: analysis.analysis_id,
    thread_id: analysis.thread_id,
    lead_id: analysis.lead_id,
    state: analysis.state,
    intent: analysis.intent,
    tone: analysis.tone,
    momentum: analysis.momentum,
    urgency_signals: analysis.urgency_signals,
    objections: analysis.objections,
    relationship_signals: analysis.relationship_signals,
    summary: analysis.summary,
    recommended_response: analysis.recommended_response,
    response_deadline: analysis.response_deadline ?? null,
    analyzed_at: analysis.analyzed_at,
  })
  if (error) throw new Error(`Failed to save analysis: ${error.message}`)
}

type AnalysisRow = {
  analysis_id: string
  thread_id: string
  lead_id: string
  state: string | null
  intent: string | null
  tone: string | null
  momentum: string | null
  urgency_signals: string[] | null
  objections: string[] | null
  relationship_signals: string[] | null
  summary: string | null
  recommended_response: string | null
  response_deadline: string | null
  analyzed_at: string
}

function rowToAnalysis(row: AnalysisRow): ConversationAnalysis {
  return {
    analysis_id: row.analysis_id,
    thread_id: row.thread_id,
    lead_id: row.lead_id,
    state: (row.state ?? 'dormant') as ConversationAnalysis['state'],
    intent: (row.intent ?? 'none') as ConversationAnalysis['intent'],
    tone: (row.tone ?? 'neutral') as ConversationAnalysis['tone'],
    momentum: (row.momentum ?? 'steady') as ConversationAnalysis['momentum'],
    urgency_signals: row.urgency_signals ?? [],
    objections: row.objections ?? [],
    relationship_signals: row.relationship_signals ?? [],
    summary: row.summary ?? '',
    recommended_response: row.recommended_response ?? '',
    response_deadline: row.response_deadline ?? undefined,
    analyzed_at: row.analyzed_at,
  }
}

// Latest analysis per thread, keyed by thread_id.
export async function getLatestAnalysesByThread(): Promise<Record<string, ConversationAnalysis>> {
  if (!isSupabaseAdminConfigured()) {
    return sessionCache.analyses
  }
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('thread_analyses')
    .select('*')
    .order('analyzed_at', { ascending: false })
  if (error) {
    console.error('getLatestAnalysesByThread error:', error.message)
    return {}
  }
  const byThread: Record<string, ConversationAnalysis> = {}
  for (const row of data as AnalysisRow[]) {
    if (!byThread[row.thread_id]) byThread[row.thread_id] = rowToAnalysis(row)
  }
  return byThread
}

export async function getGmailStoreCounts(): Promise<{ threads: number; analyses: number }> {
  if (!isSupabaseAdminConfigured()) {
    return {
      threads: Object.values(sessionCache.threads).reduce((sum, t) => sum + t.length, 0),
      analyses: Object.keys(sessionCache.analyses).length,
    }
  }
  const supabase = getSupabaseAdmin()
  const [threadsRes, analysesRes] = await Promise.all([
    supabase.from('threads').select('thread_id', { count: 'exact', head: true }),
    supabase.from('thread_analyses').select('analysis_id', { count: 'exact', head: true }),
  ])
  return { threads: threadsRes.count ?? 0, analyses: analysesRes.count ?? 0 }
}
