// Server-only. Do not import from client components.
//
// Phase 1 posture: every key is .optional() so missing env doesn't break boot.
// Each call site is responsible for checking what it needs. This preserves the
// existing per-route 503 pattern (e.g. "ANTHROPIC_API_KEY not configured")
// while giving us typed access to env values.
//
// Future phases can tighten individual keys to required as the merged app
// grows past mock-mode tolerance.

import { z } from 'zod'

const schema = z.object({
  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-6'),
  ANTHROPIC_CLASSIFIER_MODEL: z.string().optional(),
  ANTHROPIC_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),

  // Google Sheets (service account)
  GOOGLE_SHEET_ID: z.string().optional(),
  GOOGLE_CLIENT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),

  // Google OAuth (Gmail)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z
    .string()
    .url()
    .default('http://localhost:3000/api/gmail/callback'),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Discoveries ingestion
  INGEST_SECRET: z.string().min(16).optional(),

  // Prospecting
  TAVILY_API_KEY: z.string().optional(),
  TAVILY_BASE_URL: z.string().url().default('https://api.tavily.com'),
  TAVILY_SEARCH_DEPTH: z.enum(['basic', 'advanced']).default('basic'),
  TAVILY_MAX_RESULTS_PER_QUERY: z.coerce.number().int().positive().default(8),
  TAVILY_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  JINA_READER_BASE_URL: z.string().url().default('https://r.jina.ai'),
  JINA_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  ARTICLE_MAX_CHARS: z.coerce.number().int().positive().default(20_000),

  // App auth
  APP_PASSWORD: z.string().min(8).optional(),
  SESSION_SECRET: z.string().min(32).optional(),

  // Standard
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('[env] Invalid environment variables:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables — see logs for details')
}

export const env = parsed.data
export type Env = z.infer<typeof schema>
