// SSRF guard for user-supplied URLs (the Prospecting URL form).
// Refuses URLs that point at localhost or private networks before we make a
// fetch on the server's behalf.

import ipaddr from 'ipaddr.js'

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0'])

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeUrlError'
  }
}

function isPrivateIp(hostname: string): boolean {
  try {
    const addr = ipaddr.parse(hostname)
    const range = addr.range()
    return ['private', 'loopback', 'linkLocal', 'uniqueLocal', 'unspecified'].includes(range)
  } catch {
    return false
  }
}

export function assertSafePublicHttpUrl(rawUrl: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new UnsafeUrlError('URL is not valid')
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsafeUrlError('URL must use http or https')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith('.local') || isPrivateIp(hostname)) {
    throw new UnsafeUrlError('URL cannot point to a private network')
  }

  return parsed
}
