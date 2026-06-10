import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCompanyById, updateCompany } from '@/lib/sheets'
import type { Company } from '@/lib/types'
import { cleanName } from '@/lib/vocab'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const company = await getCompanyById(id)
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }
    return NextResponse.json({ company })
  } catch (err) {
    console.error('GET /api/companies/[id] error:', err)
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 })
  }
}

const PatchBody = z.object({
  company_name: z.string().min(1).optional(),
  website: z.string().optional(),
  linkedin_company_url: z.string().optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  company_size: z.string().optional(),
  notes: z.string().optional(),
}).strict()

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const company = await getCompanyById(id)
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    let json: unknown
    try {
      json = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const parsed = PatchBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 })
    }
    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    ) as Partial<Company>
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }
    if (updates.company_name) updates.company_name = cleanName(updates.company_name)
    updates.updated_at = new Date().toISOString()

    const ok = await updateCompany(id, updates)
    if (!ok) return NextResponse.json({ error: 'Company not found in sheet' }, { status: 404 })

    // Company name is denormalized onto Lead rows — keep them in sync.
    let leads_renamed = 0
    if (updates.company_name && updates.company_name !== company.company_name) {
      const { getLeads, bulkUpdateLeads } = await import('@/lib/sheets')
      const leads = (await getLeads()).filter((l) => l.company_id === id)
      if (leads.length > 0) {
        const res = await bulkUpdateLeads(leads.map((l) => l.lead_id), { company_name: updates.company_name })
        leads_renamed = res.updated.length
      }
    }

    const updated = await getCompanyById(id)
    return NextResponse.json({ company: updated, leads_renamed })
  } catch (err) {
    console.error('PATCH /api/companies/[id] error:', err)
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 })
  }
}
