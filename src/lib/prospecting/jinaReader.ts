// Article text extraction via Jina Reader. Paywall-tolerant: if the result
// looks like a login/paywall wall, throws with a clear error code so the UI
// can surface "try another URL" rather than send a thin payload to Claude.

import { env } from '@/lib/env'
import { assertSafePublicHttpUrl } from './safeUrl'
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from '@/lib/discoveries/googleNewsResolver'

const MIN_ARTICLE_CHARS = 500

const PAYWALL_HINTS = [
  'subscribe to continue',
  'sign in to continue',
  'log in to continue',
  'create an account',
  'paywall',
  'enable javascript',
  'access denied',
]

export class ArticleFetchError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'ArticleFetchError'
  }
}

export async function fetchArticleTextWithJina(rawUrl: string): Promise<string> {
  // Defense-in-depth: ingest + the Discovery page both pre-resolve Google News
  // URLs, but if any other path lands here with one, Jina would return HTTP
  // 451. Resolve transparently so this function is robust regardless of caller.
  let inputUrl = rawUrl
  if (isGoogleNewsUrl(rawUrl)) {
    try {
      inputUrl = await resolveGoogleNewsUrl(rawUrl)
    } catch (err) {
      throw new ArticleFetchError(
        `Could not resolve Google News redirect URL: ${err instanceof Error ? err.message : String(err)}`,
        'GNEWS_RESOLVE_FAILED',
      )
    }
  }

  const parsed = assertSafePublicHttpUrl(inputUrl)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.JINA_TIMEOUT_MS)

  const readerUrl = `${env.JINA_READER_BASE_URL}/${encodeURIComponent(parsed.toString())}`

  try {
    const response = await fetch(readerUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/plain' },
    })

    if (!response.ok) {
      throw new ArticleFetchError(
        `Jina Reader failed: HTTP ${response.status}`,
        'JINA_FETCH_FAILED',
      )
    }

    const cleaned = cleanArticleText(await response.text())

    if (cleaned.length < MIN_ARTICLE_CHARS) {
      throw new ArticleFetchError(
        'Article text was too short or unreadable',
        'ARTICLE_UNREADABLE',
      )
    }

    const lower = cleaned.toLowerCase()
    const hasPaywallHint = PAYWALL_HINTS.some((hint) => lower.includes(hint))
    if (hasPaywallHint && cleaned.length < 1500) {
      throw new ArticleFetchError(
        'Article appears to be behind a paywall or login',
        'ARTICLE_PAYWALL_OR_BLOCKED',
      )
    }

    return truncateArticleText(cleaned)
  } catch (err) {
    if (err instanceof ArticleFetchError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ArticleFetchError('Jina Reader timed out', 'JINA_TIMEOUT')
    }
    throw new ArticleFetchError(
      `Unexpected error reading article: ${err instanceof Error ? err.message : String(err)}`,
      'JINA_UNKNOWN_ERROR',
    )
  } finally {
    clearTimeout(timer)
  }
}

function cleanArticleText(text: string): string {
  return text.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

function truncateArticleText(text: string): string {
  if (text.length <= env.ARTICLE_MAX_CHARS) return text
  return text.slice(0, env.ARTICLE_MAX_CHARS).trim()
}
