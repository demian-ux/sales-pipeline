// Shared lead-creation core. POST /api/leads, POST /api/leads/batch and
// POST /api/log-send all create leads — one validation schema + one code path
// so field aliases, dedup and company resolution can never drift apart.

import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getLeads, createLead, getCompanyById, findOrCreateCompanyByName } from '@/lib/sheets'
import type {
  Lead,
  LeadStatus,
  RelationshipTemperature,
  LinkedInConnectionStatus,
  LinkedInDMStatus,
  LinkedInWarmth,
} from '@/lib/types'
import { cleanName, PIPELINE_STAGES } from '@/lib/vocab'

const LEAD_STATUSES = ['Active', 'Inactive', 'Archived'] as const satisfies readonly LeadStatus[]
const TEMPERATURES = ['Hot', 'Warm', 'Cool', 'Cold'] as const satisfies readonly RelationshipTemperature[]
const LINKEDIN_CONNECTION_STATUSES = ['Not Connected', 'Connection Ready', 'Connection Sent', 'Connected', 'Unknown'] as const satisfies readonly LinkedInConnectionStatus[]
const LINKEDIN_DM_STATUSES = ['Not Started', 'DM Ready', 'DM Sent', 'Replied', 'Not Interested', 'Unknown'] as const satisfies readonly LinkedInDMStatus[]
const LINKEDIN_WARMTHS = ['Passive', 'Aware', 'Connected', 'Warm', 'Engaged', 'Active'] as const satisfies readonly LinkedInWarmth[]

const score = z.coerce.number().min(1, 'Scores must be between 1 and 10').max(10, 'Scores must be between 1 and 10').optional()

export const CreateLeadBody = z
  .object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    full_name: z.string().optional(),
    company_name: z.string().min(1, 'company_name is required').optional(),
    // Alias: API clients naturally send `company` — accept it as company_name.
    company: z.string().optional(),
    company_id: z.string().optional(),
    campaign_id: z.string().optional(),
    email: z.string().email('Invalid email').or(z.literal('')).optional(),
    linkedin_url: z.string().optional(),
    linkedin_connection_status: z.enum(LINKEDIN_CONNECTION_STATUSES).optional(),
    linkedin_dm_status: z.enum(LINKEDIN_DM_STATUSES).optional(),
    linkedin_warmth: z.enum(LINKEDIN_WARMTHS).optional(),
    last_linkedin_touch_date: z.string().optional(),
    linkedin_notes: z.string().optional(),
    title: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    source: z.string().optional(),
    pipeline_stage: z.enum(PIPELINE_STAGES).optional(),
    lead_status: z.enum(LEAD_STATUSES).optional(),
    business_fit_score: score,
    taste_score: score,
    relationship_score: score,
    opportunity_score: score,
    priority_score: score,
    relationship_temperature: z.enum(TEMPERATURES).optional(),
    next_action: z.string().optional(),
    next_followup_date: z.string().optional(),
    known_pain_points: z.string().optional(),
    preferred_communication_style: z.string().optional(),
    owner: z.string().optional(),
    notes: z.string().optional(),
    held_reason: z.string().optional(),
    held_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'held_until must be YYYY-MM-DD').or(z.literal('')).optional(),
  })
  .refine(
    (b) => !!b.full_name?.trim() || (!!b.first_name?.trim() && !!b.last_name?.trim()),
    { message: 'full_name (or first_name + last_name) is required' },
  )
  // A lead created directly in Held (e.g. a discovery parked before drafting so
  // the dedup sweep sees it as worked) must carry a reason.
  .refine(
    (b) => b.pipeline_stage !== 'Held' || !!b.held_reason?.trim(),
    { message: 'held_reason is required when creating a lead in the Held stage' },
  )

export type CreateLeadResult =
  | { ok: true; status: 201; lead: Lead }
  | { ok: false; status: number; error: string; duplicate_of?: string }

// Validate + dedup + resolve company + insert. `json` is the raw request body
// for one lead. Returns a result object rather than a Response so batch/compound
// endpoints can aggregate per-item outcomes.
export async function createLeadFromJson(json: unknown): Promise<CreateLeadResult> {
  const parsed = CreateLeadBody.safeParse(json)
  if (!parsed.success) {
    // The most common API-client stumble: sending `name` instead of
    // `full_name`. Say exactly which field to use instead of the generic error.
    if (typeof json === 'object' && json !== null && 'name' in json) {
      return { ok: false, status: 400, error: 'Unknown field `name` — use `full_name` (or `first_name` + `last_name`)' }
    }
    const issue = parsed.error.issues[0]
    const field = issue?.path?.join('.')
    return { ok: false, status: 400, error: issue ? (field ? `${field}: ${issue.message}` : issue.message) : 'Invalid body' }
  }
  const body = parsed.data
  const first_name = cleanName(body.first_name)
  const last_name = cleanName(body.last_name)
  const company_name = cleanName(body.company_name || body.company)
  const full_name = cleanName(body.full_name) || cleanName(`${first_name} ${last_name}`)

  // Duplicate guard beyond exact email: normalized name + company too.
  // Pass force: true to create anyway.
  const force = (json as Record<string, unknown>)?.['force'] === true
  if (!force) {
    const existing = await getLeads()
    const emailNorm = (body.email ?? '').toLowerCase().trim()
    const dup = existing.find((l) =>
      (emailNorm && (l.email ?? '').toLowerCase().trim() === emailNorm) ||
      (full_name && company_name &&
        cleanName(l.full_name).toLowerCase() === full_name.toLowerCase() &&
        cleanName(l.company_name).toLowerCase() === company_name.toLowerCase()),
    )
    if (dup) {
      return {
        ok: false,
        status: 409,
        error: `Duplicate of existing lead ${dup.lead_id} (${dup.full_name} at ${dup.company_name}). Pass force: true to create anyway.`,
        duplicate_of: dup.lead_id,
      }
    }
  }

  const now = new Date().toISOString()
  const lead_id = `lead_${randomUUID()}`

  // Resolve the company FIRST, and make sure the row actually exists.
  //
  // This used to mint `comp_${uuid}` and write it onto the lead without ever
  // creating the Companies row, so the reference pointed at nothing — 114 of
  // 185 leads carried a dangling company_id by 14 Jul 2026. A lead whose
  // company doesn't resolve drops out of every company-joined view silently.
  //
  //   • explicit company_id → it must exist, or this is a 400. A caller
  //     inventing an id is exactly how the dangling refs got written.
  //   • company_name → find-or-create by name, reusing the existing row when
  //     the firm is already known rather than minting a second id for it.
  let company_id: string
  if (body.company_id) {
    const known = await getCompanyById(body.company_id)
    if (!known) {
      return {
        ok: false,
        status: 400,
        error: `company_id ${body.company_id} does not exist. Omit it and pass company_name to create the company, or reference a real one.`,
      }
    }
    company_id = known.company_id
  } else if (company_name) {
    const { company } = await findOrCreateCompanyByName(company_name, {
      website: body.website || undefined,
      location: body.location || undefined,
    })
    company_id = company.company_id
  } else {
    return { ok: false, status: 400, error: 'company_name is required (or pass an existing company_id)' }
  }

  const lead: Lead = {
    lead_id,
    company_id,
    campaign_id: body.campaign_id || undefined,
    first_name,
    last_name,
    full_name,
    email: body.email || undefined,
    linkedin_url: body.linkedin_url || undefined,
    linkedin_connection_status: body.linkedin_connection_status || (body.linkedin_url ? 'Not Connected' : undefined),
    linkedin_dm_status: body.linkedin_dm_status || (body.linkedin_url ? 'Not Started' : undefined),
    linkedin_warmth: body.linkedin_warmth || (body.linkedin_url ? 'Passive' : undefined),
    last_linkedin_touch_date: body.last_linkedin_touch_date || undefined,
    linkedin_notes: body.linkedin_notes || undefined,
    title: body.title || undefined,
    company_name,
    website: body.website || undefined,
    location: body.location || undefined,
    source: body.source || undefined,
    pipeline_stage: body.pipeline_stage || 'New Lead',
    lead_status: body.lead_status || 'Active',
    business_fit_score: body.business_fit_score ? Number(body.business_fit_score) : undefined,
    taste_score: body.taste_score ? Number(body.taste_score) : undefined,
    relationship_score: body.relationship_score ? Number(body.relationship_score) : undefined,
    opportunity_score: body.opportunity_score ? Number(body.opportunity_score) : undefined,
    priority_score: body.priority_score ? Number(body.priority_score) : undefined,
    relationship_temperature: body.relationship_temperature || undefined,
    next_action: body.next_action || undefined,
    next_followup_date: body.next_followup_date || undefined,
    known_pain_points: body.known_pain_points || undefined,
    preferred_communication_style: body.preferred_communication_style || undefined,
    owner: body.owner || undefined,
    notes: body.notes || undefined,
    held_reason: body.held_reason || undefined,
    held_until: body.held_until || undefined,
    created_at: now,
    updated_at: now,
  }

  await createLead(lead)
  return { ok: true, status: 201, lead }
}
