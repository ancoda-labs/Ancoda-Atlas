import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cacheFor, noStore } from '@/lib/http-cache';
import { loadNewsBundle, loadTopicNews, NEWS_CACHE_TTL_S, topicCacheStamp } from '@/lib/news-topic-cache';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const window = searchParams.get('window') || '24h';

    if (searchParams.get('bundle') === '1') {
      const body = await loadNewsBundle(window);
      const response = NextResponse.json(body);
      response.headers.set('X-Atlas-Cache', 'bundle');
      return cacheFor(response, { edge: NEWS_CACHE_TTL_S });
    }

    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    const limit = Number(searchParams.get('limit')) || 30;
    const sourceCap = Number(searchParams.get('sourceCap')) || 10;

    const data = await loadTopicNews(topic, window, limit, sourceCap);
    const response = NextResponse.json(data);
    response.headers.set('X-Atlas-Cache', topicCacheStamp(topic, window, limit, sourceCap) ? 'hit' : 'miss');
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
