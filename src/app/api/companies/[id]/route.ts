import { NextResponse } from 'next/server'
import { getCompanyById } from '@/lib/sheets'

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
