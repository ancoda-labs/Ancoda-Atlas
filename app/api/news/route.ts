import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { NewsResponse } from '@/lib/types';
import { errorMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

const NEWS_CACHE_TTL_MS = 4 * 60 * 1000;
const newsCache = new Map<string, { data?: NewsResponse; pending?: Promise<NewsResponse>; at: number }>();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    const window = searchParams.get('window') || '24h';
    const limit = Number(searchParams.get('limit')) || 30;
    const sourceCap = Number(searchParams.get('sourceCap')) || 10;

    const key = `${topic}|${window}|${limit}|${sourceCap}`;
    const hit = newsCache.get(key);

    if (hit && Date.now() - hit.at < NEWS_CACHE_TTL_MS && hit.data) {
      const response = NextResponse.json(hit.data);
      response.headers.set('X-Atlas-Cache', 'hit');
      return response;
    }

    if (hit?.pending) {
      try {
        const data = await hit.pending;
        return NextResponse.json(data);
      } catch {
        return NextResponse.json(
          { error: 'News aggregation failed', topic, items: [] },
          { status: 502 }
        );
      }
    }

    const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
    const pending = fetchTopicNews({ topic, window, limit, sourceCap });
    newsCache.set(key, { pending, at: 0 });

    const data = await pending;
    newsCache.set(key, { data, at: Date.now() });

    const response = NextResponse.json(data);
    response.headers.set('X-Atlas-Cache', 'miss');
    return response;
  } catch (err) {
    const { searchParams } = new URL(req.url);
    const topic = (searchParams.get('topic') || 'all').toLowerCase();
    newsCache.delete(`${topic}|${searchParams.get('window') || '24h'}|${searchParams.get('limit') || 30}|${searchParams.get('sourceCap') || 10}`);
    console.error('[Next.js News API] Failed:', errorMessage(err));
    return NextResponse.json(
      { error: 'News aggregation failed', topic: topic, items: [], count: 0 },
      { status: 502 }
    );
  }
}
