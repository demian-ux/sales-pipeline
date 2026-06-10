import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeadById, getInsightsForLead, saveAIInsight } from '@/lib/sheets'
import type { AIInsight } from '@/lib/types'

// GET /api/leads/[id]/analysis — stored analyses (newest first).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    const insights = await getInsightsForLead(id)
    insights.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return NextResponse.json({ analyses: insights })
  } catch (err) {
    console.error('GET /api/leads/[id]/analysis error:', err)
    return NextResponse.json({ error: 'Failed to fetch analysis' }, { status: 500 })
  }
}

const PostBody = z.object({
  // `assessment` is the external-agent name; `summary` the internal one.
  assessment: z.string().optional(),
  summary: z.string().optional(),
  why_now: z.string().min(1, 'why_now is required'),
  discovery_questions: z.array(z.string()).optional(),
  recommended_next_action: z.string().optional(),
  intent_level: z.enum(['high', 'medium', 'low']).optional(),
  risk_level: z.enum(['high', 'medium', 'low']).optional(),
  objections: z.array(z.string()).optional(),
  opportunities: z.array(z.string()).optional(),
  confidence: z.coerce.number().min(0).max(100).optional(),
  generated_at: z.string().optional(),
}).refine((b) => !!(b.assessment ?? b.summary), { message: 'assessment (or summary) is required' })

// POST /api/leads/[id]/analysis — persist an externally generated analysis so
// the lead page renders it like a native "Analyze — why now?" result.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const lead = await getLeadById(id)
    if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = PostBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const body = parsed.data

    const insight: AIInsight = {
      insight_id: `ins_${randomUUID()}`,
      lead_id: id,
      company_id: lead.company_id,
      summary: (body.assessment ?? body.summary)!,
      why_now: body.why_now,
      intent_level: body.intent_level ?? 'medium',
      recommended_next_action: body.recommended_next_action ?? '',
      discovery_questions: body.discovery_questions ?? [],
      objections: body.objections ?? [],
      opportunities: body.opportunities ?? [],
      risk_level: body.risk_level ?? 'low',
      confidence: body.confidence ?? 50,
      created_at: body.generated_at ?? new Date().toISOString(),
    }
    await saveAIInsight(insight)
    return NextResponse.json({ analysis: insight }, { status: 201 })
  } catch (err) {
    console.error('POST /api/leads/[id]/analysis error:', err)
    return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
  }
}
