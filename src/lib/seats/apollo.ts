// Apollo REST client for the seats worker. Server-side API key auth
// (`x-api-key` header) — the MCP OAuth flow can't run in a headless cron.
//
// Endpoints used:
//   POST /v1/mixed_people/search  — people search by org domain + titles. Free
//                                   (no credits); returns candidates WITHOUT
//                                   revealed emails.
//   POST /v1/people/match         — reveal one person's work email. 1 credit.
//   POST /v1/emailer... waterfall — Apollo's async email waterfall. Plan- and
//                                   rollout-dependent; the path is overridable
//                                   via APOLLO_WATERFALL_PATH because Apollo
//                                   has shipped it under different routes.
//
// Every paid call is the caller's responsibility to ledger BEFORE invoking.

import { env } from '@/lib/env'

const BASE = 'https://api.apollo.io/api'

export interface ApolloPerson {
  id: string
  name: string | null
  title: string | null
  email: string | null
  email_status: string | null      // 'verified' | 'unverified' | ...
  linkedin_url: string | null
  seniority: string | null
  organization_name: string | null
}

export function isApolloConfigured(): boolean {
  return !!env.APOLLO_API_KEY
}

async function apolloFetch(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!env.APOLLO_API_KEY) throw new Error('APOLLO_API_KEY not configured')
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      'x-api-key': env.APOLLO_API_KEY,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Apollo ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as Record<string, unknown>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toPerson(p: any): ApolloPerson {
  return {
    id: String(p?.id ?? ''),
    name: p?.name ?? null,
    title: p?.title ?? null,
    email: p?.email && p.email !== 'email_not_unlocked@domain.com' ? p.email : null,
    email_status: p?.email_status ?? null,
    linkedin_url: p?.linkedin_url ?? null,
    seniority: p?.seniority ?? null,
    organization_name: p?.organization?.name ?? p?.organization_name ?? null,
  }
}

/** Free people search by company domain + title keywords. No credits spent. */
export async function searchPeople(domain: string, titles: string[]): Promise<ApolloPerson[]> {
  const data = await apolloFetch('/v1/mixed_people/search', {
    q_organization_domains_list: [domain],
    person_titles: titles,
    page: 1,
    per_page: 10,
  })
  const people = [...((data.people as any[]) ?? []), ...((data.contacts as any[]) ?? [])]
  return people.map(toPerson).filter((p) => p.id)
}

/** Paid reveal (1 credit) of the chosen candidate's work email. */
export async function matchPerson(personId: string): Promise<ApolloPerson | null> {
  const data = await apolloFetch('/v1/people/match', {
    id: personId,
    reveal_personal_emails: false,
  })
  return data.person ? toPerson(data.person) : null
}

// ── Async email waterfall ────────────────────────────────────────────────────
// Apollo's waterfall enrichment is async: the request returns an id, the
// result lands minutes later and is fetched by id. Path is env-overridable
// because it varies by plan/rollout; the worker treats any failure here as
// `seat_failed:no_email` (never guesses an address).

export interface WaterfallResult {
  status: 'pending' | 'verified' | 'failed'
  email?: string
}

export async function requestWaterfall(personId: string): Promise<string> {
  const path = env.APOLLO_WATERFALL_PATH ?? '/v1/people/waterfall'
  const data = await apolloFetch(path, { id: personId })
  const requestId = (data.request_id ?? data.id ?? (data.waterfall_request as any)?.id) as string | undefined
  if (!requestId) throw new Error(`Apollo waterfall: no request id in response ${JSON.stringify(data).slice(0, 200)}`)
  return String(requestId)
}

export async function pollWaterfall(requestId: string): Promise<WaterfallResult> {
  const path = env.APOLLO_WATERFALL_PATH ?? '/v1/people/waterfall'
  const data = await apolloFetch(`${path}/status`, { request_id: requestId })
  const status = String(data.status ?? 'pending').toLowerCase()
  const person = data.person ? toPerson(data.person) : null
  if (person?.email && person.email_status === 'verified') {
    return { status: 'verified', email: person.email }
  }
  if (['failed', 'error', 'not_found', 'completed', 'complete'].includes(status)) {
    // Completed without a verified email = failed for our purposes.
    return person?.email && person.email_status === 'verified'
      ? { status: 'verified', email: person.email }
      : { status: 'failed' }
  }
  return { status: 'pending' }
}
