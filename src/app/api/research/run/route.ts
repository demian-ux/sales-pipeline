// POST /api/research/run — trigger a Project Launches research run (the "Run
// research" button, API-first, 2026-08-25). Returns 202 { job_id, run_id };
// poll GET /api/jobs/[jobId]. If a run is already live, 409 with the existing
// job_id — never a second parallel run.
//
// Auth: middleware session/API-key gate, same as every /api/* route.

import { isSupabaseAdminConfigured } from '@/lib/supabase'
import { startBackgroundRun } from '@/lib/discoveries/run-manager'

export const maxDuration = 300

export async function POST() {
  if (!isSupabaseAdminConfigured()) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  return startBackgroundRun('project_launch', maxDuration)
}
