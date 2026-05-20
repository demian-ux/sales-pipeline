// Single Anthropic client for the merged app.
// Server-only — never import from a client component.

import Anthropic from '@anthropic-ai/sdk'
import { env } from '@/lib/env'

export const ai = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

export const MODEL = env.ANTHROPIC_MODEL
export const ANTHROPIC_TIMEOUT_MS = env.ANTHROPIC_TIMEOUT_MS

// Helper that asserts Claude is configured before making a call.
// Throws an error with a stable message so route handlers can map it to a 503.
export function requireAnthropic(): void {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }
}
