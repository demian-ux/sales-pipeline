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
        'User-Agent': 'OakiDiscoveries/1.0 (RSS reader)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    })

    if (!response.ok) {
      console.error(`[rss] HTTP ${response.status} for ${sourceName} (${url})`)
      return []
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
      console.error(`[rss] Timeout (>${FETCH_TIMEOUT_MS}ms) for ${sourceName} (${url})`)
    } else {
      console.error(`[rss] Failed to fetch ${sourceName} (${url}):`, err instanceof Error ? err.message : err)
    }
    return []
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
