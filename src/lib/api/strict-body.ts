// Unknown-key rejection for hand-rolled PATCH bodies (2026-07-14).
//
// The Zod routes get this from `.strict()`. The routes that read `body.field`
// by hand had no equivalent: an unknown or non-writable key was simply not read,
// and the route answered 200. A 200 that silently drops a field is the worst
// possible answer — the caller records success, the value never lands, and the
// discrepancy surfaces days later as "why is this firm missing a category".
//
// Whitelist what a route writes and reject the rest, loudly.

/**
 * Returns a 400 Response if `body` carries keys outside `allowed`, else null.
 *
 *   const bad = rejectUnknownKeys(body, ['status', 'work_status'])
 *   if (bad) return bad
 */
export function rejectUnknownKeys(body: object, allowed: readonly string[]): Response | null {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k))
  if (unknown.length === 0) return null
  return Response.json(
    {
      error:
        `Unknown or non-writable field(s): ${unknown.join(', ')}. ` +
        `Writable: ${allowed.join(', ')}. Rejecting rather than silently dropping them.`,
    },
    { status: 400 },
  )
}
