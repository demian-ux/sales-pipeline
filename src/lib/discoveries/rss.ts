// Thin wrapper around `rss-parser` that bounds fetch time and normalizes the
// item shape we feed into the ingestion pipeline.

import Parser from 'rss-parser'

export interface RawArticleFromRSS {
  title: string
  link: string
  content: string
  pubDate: string | null
  sourceName: string
}

const parser = new Parser({
  customFields: {
    item: [
      ['content:encoded', 'contentEncoded'],
      ['description', 'description'],
    ],
  },
})

const FETCH_TIMEOUT_MS = 10_000

// Throws on HTTP errors, timeouts, and parse failures so the caller can
// distinguish a dead feed from a genuinely empty one. (Previously this
// swallowed every error and returned [] — failed feeds were invisible.)
export async function fetchRSSFeed(
  url: string,
  sourceName: string,
): Promise<RawArticleFromRSS[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // A browser-like UA, not a custom bot string: The Real Deal's WAF
        // (and others) 403 unknown agents while serving the same feed to
        // browsers — both TRD feeds were dead for weeks on the old
        // 'OakiDiscoveries/1.0' UA (verified 2026-08-25: 403 vs 200 by UA only).
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const text = await response.text()
    const feed = await parser.parseString(text)

    return (feed.items ?? []).map((item) => ({
      title: item.title ?? '',
      link: item.link ?? '',
      content: stripHtml(
        (item as unknown as Record<string, string>).contentEncoded ??
        item.content ??
        item.contentSnippet ??
        (item as unknown as Record<string, string>).description ??
        item.summary ??
        '',
      ),
      pubDate: item.pubDate ?? item.isoDate ?? null,
      sourceName,
    }))
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`timeout after ${FETCH_TIMEOUT_MS / 1000}s`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
