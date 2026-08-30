import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cacheFor, noStore } from '@/lib/http-cache';
import { proxyUrlFor } from '@/lib/news-media';
import type { NewsBundleResponse, NewsItem, NewsResponse } from '@/types';
import { errorMessage } from '@/types';

/**
 * Attach a signed proxy path to every item that has a lead image.
 *
 * Done here rather than in the browser because signing needs a server secret.
 * Outlets that publish nothing usable simply get a null and the client falls
 * back to the text-only wire layout.
 */
function withSignedImages(data: NewsResponse): NewsResponse {
  const items: NewsItem[] = (data.items || []).map(item => ({
    ...item,
    imageProxy: proxyUrlFor(item.image),
  }));
  return { ...data, items };
}

export const dynamic = 'force-dynamic';

const NEWS_CACHE_TTL_MS = 4 * 60 * 1000;
const NEWS_CACHE_TTL_S = NEWS_CACHE_TTL_MS / 1000;
const newsCache = new Map<string, { data?: NewsResponse; pending?: Promise<NewsResponse>; at: number }>();

/** Matches the dashboard panels so a bundle fill is enough for every rail. */
const BUNDLE_TOPICS: Array<{ topic: string; limit: number; sourceCap: number }> = [
  { topic: 'all', limit: 48, sourceCap: 12 },
  { topic: 'earthquake', limit: 24, sourceCap: 8 },
  { topic: 'flood', limit: 28, sourceCap: 8 },
  { topic: 'weather', limit: 28, sourceCap: 8 },
  { topic: 'wildfire', limit: 24, sourceCap: 8 },
  { topic: 'airquality', limit: 24, sourceCap: 8 },
  { topic: 'climate', limit: 24, sourceCap: 8 },
  { topic: 'relief', limit: 28, sourceCap: 8 },
];

async function loadTopic(topic: string, window: string, limit: number, sourceCap: number): Promise<NewsResponse> {
  const key = `${topic}|${window}|${limit}|${sourceCap}`;
  const hit = newsCache.get(key);

  if (hit && Date.now() - hit.at < NEWS_CACHE_TTL_MS && hit.data) {
    return hit.data;
  }

  if (hit?.pending) {
    return hit.pending;
  }

  const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
  const pending = fetchTopicNews({ topic, window, limit, sourceCap });
  newsCache.set(key, { pending, at: 0 });
  try {
    const data = await pending;
    newsCache.set(key, { data, at: Date.now() });
    return data;
  } catch (err) {
    newsCache.delete(key);
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '24h';

    if (searchParams.get('bundle') === '1') {
      const entries = await Promise.all(
        BUNDLE_TOPICS.map(async spec => {
          const data = withSignedImages(await loadTopic(spec.topic, window, spec.limit, spec.sourceCap));
          return [spec.topic, data] as const;
        }),
      );
      const body: NewsBundleResponse = {
        window,
        timestamp: new Date().toISOString(),
        topics: Object.fromEntries(entries),
      };
      const response = NextResponse.json(body);
      response.headers.set('X-Atlas-Cache', 'bundle');
      return cacheFor(response, { edge: NEWS_CACHE_TTL_S });
    }

    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    const limit = Number(searchParams.get('limit')) || 30;
    const sourceCap = Number(searchParams.get('sourceCap')) || 10;

    const data = withSignedImages(await loadTopic(topic, window, limit, sourceCap));
    const response = NextResponse.json(data);
    response.headers.set('X-Atlas-Cache', newsCache.get(`${topic}|${window}|${limit}|${sourceCap}`)?.at ? 'hit' : 'miss');
    return cacheFor(response, { edge: NEWS_CACHE_TTL_S });
  } catch (err) {
    const { searchParams } = new URL(req.url);
    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    console.error('[Next.js News API] Failed:', errorMessage(err));
    return noStore(NextResponse.json(
      { error: 'News aggregation failed', topic, items: [], count: 0 },
      { status: 502 },
    ));
  }
}
