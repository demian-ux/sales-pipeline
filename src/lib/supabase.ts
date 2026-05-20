// Supabase clients (lazy). Safe to import anywhere — clients are only
// constructed on first use. If env vars are missing, the getter throws a
// clear error rather than crashing at module load time.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

let publicClient: SupabaseClient | null = null
let adminClient: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function isSupabaseAdminConfigured(): boolean {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
}

// Public client — anon key. Safe in browser; respects RLS.
export function getSupabase(): SupabaseClient {
  if (publicClient) return publicClient
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  publicClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  return publicClient
}

// Admin client — service role key. Server-only. Bypasses RLS.
// Use for ingestion, OAuth token storage, and any write that must succeed
// regardless of caller identity.
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Supabase admin not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    )
  }
  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return adminClient
}
