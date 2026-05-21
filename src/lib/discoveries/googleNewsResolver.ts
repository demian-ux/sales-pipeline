// Google News RSS feeds wrap publisher URLs behind an encoded redirect like
// https://news.google.com/rss/articles/CBMi... — Jina Reader gets HTTP 451
// from these because Google blocks scrapers at the redirect endpoint.
//
// To get the underlying publisher URL we replicate the protocol Google News's
// own JavaScript uses (the same one their batchexecute RPC follows):
//
//   1. GET the article page with a browser User-Agent → parse out two
//      attributes on the inline <c-wiz> element:
//        data-n-a-sg  — a signature token
//        data-n-a-ts  — a timestamp
//   2. POST those + the article ID to /_/DotsSplashUi/data/batchexecute
//      with rpcids=Fbv4je. The response is a Google RPC blob; the second
//      line is JSON that contains the decoded publisher URL.
//
// Reference implementation (Python): https://github.com/SSujitX/google-news-url-decoder
//
// We keep this isolated so the protocol can be swapped if Google changes it
// without touching anything else.

const GOOGLE_NEWS_HOST_RX = /(^|\.)news\.google\.[a-z.]+$/i
const ARTICLE_ID_RX       = /\/rss\/articles\/([A-Za-z0-9_-]+)/
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export class GoogleNewsResolveError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message)
    this.name = 'GoogleNewsResolveError'
  }
}

export function isGoogleNewsUrl(url: string): boolean {
  try {
    return GOOGLE_NEWS_HOST_RX.test(new URL(url).host)
  } catch {
    return false
  }
}

/**
 * Resolves a Google News redirect URL to the underlying publisher URL.
 * Throws GoogleNewsResolveError on any failure — callers decide whether to
 * fall back to the original URL or surface the error.
 *
 * Non-Google-News URLs are returned unchanged.
 */
export async function resolveGoogleNewsUrl(
  url: string,
  timeoutMs = 10_000,
): Promise<string> {
  if (!isGoogleNewsUrl(url)) return url

  const articleId = extractArticleId(url)
  if (!articleId) {
    throw new GoogleNewsResolveError(
      `Could not extract article ID from URL: ${url}`,
      'GNEWS_NO_ARTICLE_ID',
    )
  }

  const { signature, timestamp } = await fetchSignature(articleId, timeoutMs)
  return await decodeViaBatchExecute(articleId, signature, timestamp, timeoutMs)
}

function extractArticleId(url: string): string | null {
  const match = url.match(ARTICLE_ID_RX)
  return match?.[1] ?? null
}

async function fetchSignature(
  articleId: string,
  timeoutMs: number,
): Promise<{ signature: string; timestamp: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`https://news.google.com/rss/articles/${articleId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!res.ok) {
      throw new GoogleNewsResolveError(
        `Signature fetch returned HTTP ${res.status}`,
        'GNEWS_SIGNATURE_HTTP',
      )
    }

    const html = await res.text()
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    if (!sg || !ts) {
      throw new GoogleNewsResolveError(
        'Could not extract signature/timestamp from article page — Google likely changed the format',
        'GNEWS_SIGNATURE_PARSE',
      )
    }
    return { signature: sg, timestamp: ts }
  } catch (err) {
    if (err instanceof GoogleNewsResolveError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GoogleNewsResolveError('Signature fetch timed out', 'GNEWS_SIGNATURE_TIMEOUT')
    }
    throw new GoogleNewsResolveError(
      `Signature fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      'GNEWS_SIGNATURE_FAILED',
    )
  } finally {
    clearTimeout(timer)
  }
}

async function decodeViaBatchExecute(
  articleId: string,
  signature: string,
  timestamp: string,
  timeoutMs: number,
): Promise<string> {
  // Mirror the exact payload shape Google News's own JS sends. The outer array
  // structure is the RPC envelope; the inner JSON-encoded string is the
  // `garturlreq` (get-article-URL request).
  const inner = JSON.stringify([
    'garturlreq',
    [
      ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
      'X',
      'X',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ])
  const fReq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]])

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(
      'https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&source-path=%2F&hl=en-US&gl=US',
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': BROWSER_UA,
        },
        body: 'f.req=' + encodeURIComponent(fReq),
      },
    )

    if (!res.ok) {
      throw new GoogleNewsResolveError(
        `batchexecute returned HTTP ${res.status}`,
        'GNEWS_DECODE_HTTP',
      )
    }

    const text = await res.text()
    // Response format: `)]}'\n\n<line-count>\n<json-payload>\n...`
    // The second non-empty line is a JSON array we need to parse.
    const jsonLine = text.split('\n').find((line) => line.startsWith('[['))
    if (!jsonLine) {
      throw new GoogleNewsResolveError(
        'batchexecute response did not contain a JSON payload line',
        'GNEWS_DECODE_PARSE',
      )
    }
    const outer = JSON.parse(jsonLine) as unknown[][]
    // outer[0] = ['wrb.fr', 'Fbv4je', '<inner JSON string>', ...]
    const innerJson = outer[0]?.[2]
    if (typeof innerJson !== 'string') {
      throw new GoogleNewsResolveError(
        'batchexecute response missing inner payload',
        'GNEWS_DECODE_SHAPE',
      )
    }
    const innerArr = JSON.parse(innerJson) as unknown[]
    // innerArr looks like ['garturl', '<publisher URL>', ...]
    const decoded = innerArr[1]
    if (typeof decoded !== 'string' || !decoded.startsWith('http')) {
      throw new GoogleNewsResolveError(
        `batchexecute returned a non-URL value: ${String(decoded).slice(0, 60)}`,
        'GNEWS_DECODE_NOT_URL',
      )
    }
    return decoded
  } catch (err) {
    if (err instanceof GoogleNewsResolveError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GoogleNewsResolveError('batchexecute timed out', 'GNEWS_DECODE_TIMEOUT')
    }
    throw new GoogleNewsResolveError(
      `batchexecute failed: ${err instanceof Error ? err.message : String(err)}`,
      'GNEWS_DECODE_FAILED',
    )
  } finally {
    clearTimeout(timer)
  }
}
