// POST /api/companies/merge — collapse duplicate Company rows (2026-08-27).
// { keep_id, merge_ids: [] } → repoints Leads / Opportunities / Interactions
// from every merge_id onto keep_id (leads also get the kept company_name,
// which is denormalized onto them), then deletes the merged Company rows.
// The kept row's own fields are untouched.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCompanyById, mergeCompanies } from '@/lib/sheets'

const Body = z.object({
  keep_id: z.string().min(1, 'keep_id is required'),
  merge_ids: z.array(z.string().min(1)).min(1, 'merge_ids is required').max(20, 'Max 20 merge_ids per call'),
})

export async function POST(req: Request) {
  try {
    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = Body.safeParse(json)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path?.join('.')
      return NextResponse.json({ error: field ? `${field}: ${issue?.message}` : issue?.message ?? 'Invalid body' }, { status: 400 })
    }
    const { keep_id, merge_ids } = parsed.data
    if (merge_ids.includes(keep_id)) {
      return NextResponse.json({ error: 'merge_ids must not contain keep_id' }, { status: 400 })
    }

    const keep = await getCompanyById(keep_id)
    if (!keep) return NextResponse.json({ error: `keep_id ${keep_id} does not exist` }, { status: 404 })
    // Every merge_id must exist — a typo'd id silently merging nothing would
    // read as success.
    const missing: string[] = []
    for (const id of merge_ids) {
      if (!(await getCompanyById(id))) missing.push(id)
    }
    if (missing.length > 0) {
      return NextResponse.json({ error: `merge_ids not found: ${missing.join(', ')}` }, { status: 404 })
    }

    const result = await mergeCompanies(keep_id, merge_ids)
    return NextResponse.json({ merged_into: keep_id, ...result })
  } catch (err) {
    console.error('POST /api/companies/merge error:', err)
    return NextResponse.json({ error: 'Failed to merge companies' }, { status: 500 })
  }
}
