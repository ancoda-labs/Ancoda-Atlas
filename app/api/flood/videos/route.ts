import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import type { VideoFeed } from '@/lib/types';
import { errorMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Broadcast coverage from the Nepali channels.
//
// Building this list costs one page fetch per channel plus an oEmbed call per
// video, so it is cached hard. Nothing is stored: the response carries video
// ids and the metadata YouTube publishes, and the page embeds the official
// player.

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { data: VideoFeed; at: number } | null = null;
let pending: Promise<VideoFeed> | null = null;

export async function GET() {
  const store = getFloodStore();
  if (store.videos?.videos.length && store.videos?.live?.length) {
    const res = NextResponse.json(store.videos);
    res.headers.set('X-Atlas-Cache', 'cron');
    return res;
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS && cache.data.live?.length) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return res;
  }

  if (!pending) {
    pending = (async () => {
      const { getFloodVideos } = await import('@/apis/sources/youtube.mjs');
      return getFloodVideos({ limit: 24 });
    })()
      .then(data => {
        if (data.videos.length) cache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }

  try {
    return NextResponse.json(await pending);
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Videos API] Failed:', message);
    return NextResponse.json(
      { videos: [], searchEnabled: false, error: message, fetchedAt: new Date().toISOString() } satisfies VideoFeed,
      { status: 200 },
    );
  }
}
