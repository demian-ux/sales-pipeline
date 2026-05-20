// Robust JSON extraction from Claude responses.
//
// Replaces the bare regex pattern (`text.match(/\{[\s\S]*\}/)`) that was duplicated
// across every Claude call. The regex is still used to find a candidate, but the
// result is passed through `jsonrepair` first to fix common LLM JSON mistakes
// (trailing commas, single quotes, unquoted keys, mismatched braces).
//
// Pass a Zod schema to also validate the shape — recommended once schemas exist.

import { jsonrepair } from 'jsonrepair'
import type { ZodType } from 'zod'

export class ClaudeParseError extends Error {
  constructor(message: string, public readonly rawText: string) {
    super(message)
    this.name = 'ClaudeParseError'
  }
}

export function parseJson<T>(text: string, schema?: ZodType<T>): T {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new ClaudeParseError('Claude returned empty text', text)
  }

  // Pull out the first {...} block to ignore any preamble or trailing prose.
  const match = trimmed.match(/\{[\s\S]*\}/)
  const candidate = match ? match[0] : trimmed

  let repaired: string
  try {
    repaired = jsonrepair(candidate)
  } catch (err) {
    throw new ClaudeParseError(
      `jsonrepair could not fix Claude output: ${err instanceof Error ? err.message : String(err)}`,
      text,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(repaired)
  } catch (err) {
    throw new ClaudeParseError(
      `JSON.parse failed after repair: ${err instanceof Error ? err.message : String(err)}`,
      text,
    )
  }

  if (!schema) return parsed as T

  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new ClaudeParseError(
      `Claude output failed schema validation: ${result.error.message}`,
      text,
    )
  }
  return result.data
}

// Convenience helper: pull the text content out of an Anthropic Messages response.
// Handles tool-use responses by ignoring non-text blocks.
export function extractText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}
