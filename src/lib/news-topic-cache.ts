import { proxyUrlFor } from '@/lib/news-media';
import type { NewsBundleResponse, NewsItem, NewsResponse } from '@/types';

/**
 * In-process news cache shared by /api/news and the flood cron.
 *
 * A human hit used to fan out ~15 RSS feeds per topic, eight topics on the
 * dashboard, 9–12s on a cold isolate. The sweeper and the flood cycle warm
 * this cache so a phone on Ncell pays for JSON, not for RSS.
 */

const NEWS_CACHE_TTL_MS = 4 * 60 * 1000;

const cache = new Map<string, { data?: NewsResponse; pending?: Promise<NewsResponse>; at: number }>();

/** Matches the dashboard panels so a bundle fill is enough for every rail. */
export const BUNDLE_TOPICS: Array<{ topic: string; limit: number; sourceCap: number }> = [
  { topic: 'all', limit: 48, sourceCap: 12 },
  { topic: 'earthquake', limit: 24, sourceCap: 8 },
  { topic: 'flood', limit: 28, sourceCap: 8 },
  { topic: 'weather', limit: 28, sourceCap: 8 },
  { topic: 'wildfire', limit: 24, sourceCap: 8 },
  { topic: 'airquality', limit: 24, sourceCap: 8 },
  { topic: 'climate', limit: 24, sourceCap: 8 },
  { topic: 'relief', limit: 28, sourceCap: 8 },
];

export const NEWS_CACHE_TTL_S = NEWS_CACHE_TTL_MS / 1000;

function withSignedImages(data: NewsResponse): NewsResponse {
  const items: NewsItem[] = (data.items || []).map(item => ({
    ...item,
    imageProxy: proxyUrlFor(item.image),
  }));
  return { ...data, items };
}

export async function loadTopicNews(
  topic: string,
  window: string,
  limit: number,
  sourceCap: number,
): Promise<NewsResponse> {
  const key = `${topic}|${window}|${limit}|${sourceCap}`;
  const hit = cache.get(key);

  if (hit && Date.now() - hit.at < NEWS_CACHE_TTL_MS && hit.data) {
    return hit.data;
  }

  if (hit?.pending) {
    return hit.pending;
  }

  const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
  const pending = fetchTopicNews({ topic, window, limit, sourceCap }).then(withSignedImages);
  cache.set(key, { pending, at: 0 });
  try {
    const data = await pending;
    cache.set(key, { data, at: Date.now() });
    return data;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
}

export function topicCacheStamp(topic: string, window: string, limit: number, sourceCap: number): number {
  return cache.get(`${topic}|${window}|${limit}|${sourceCap}`)?.at ?? 0;
}

export async function loadNewsBundle(window: string): Promise<NewsBundleResponse> {
  const entries = await Promise.all(
    BUNDLE_TOPICS.map(async spec => {
      const data = await loadTopicNews(spec.topic, window, spec.limit, spec.sourceCap);
      return [spec.topic, data] as const;
    }),
  );
  return {
    window,
    timestamp: new Date().toISOString(),
    topics: Object.fromEntries(entries),
  };
}

/** Fill the cache off the request path. Failures are logged, never thrown. */
export async function warmNewsBundle(window = '24h'): Promise<void> {
  try {
    await loadNewsBundle(window);
  } catch (err) {
    console.warn('[News cache] Warm failed:', err instanceof Error ? err.message : err);
  }
}
