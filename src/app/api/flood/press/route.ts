import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FloodOfficialFeed, NdrrmaNotice } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// NDRRMA's own press notes, for the Coverage page.
//
// This is the government speaking in its own voice — kept apart from the
// newsroom reporting the rest of that page carries. Served from the ten-minute
// refresh, with a cold-start direct fetch for the first request after a deploy.

const CACHE_TTL_S = 300;

function empty(error: string): FloodOfficialFeed<NdrrmaNotice> {
  return {
    items: [],
    error,
    source: { label: 'NDRRMA press notes', url: 'https://ndrrma.gov.np/np' },
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const store = getFloodStore();
  if (store.pressReleases) {
    return cacheFor(NextResponse.json(store.pressReleases), { edge: CACHE_TTL_S });
  }

  try {
    const { getPressReleases } = await import('@/apis/sources/ndrrma-notices.mjs');
    const { proxyUrlFor } = await import('@/lib/news-media');
    const feed = await getPressReleases({ limit: 12 });
    const payload: FloodOfficialFeed<NdrrmaNotice> = {
      items: feed.items.map(n => ({
        id: n.id,
        title: n.title,
        titleNe: n.titleNe,
        summary: n.summary,
        summaryNe: n.summaryNe,
        date: n.date,
        imageProxy: proxyUrlFor(n.image),
      })),
      error: feed.error,
      source: feed.source,
      fetchedAt: feed.fetchedAt,
    };
    const res = NextResponse.json(payload);
    return payload.error && !payload.items.length ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Press API] Failed:', message);
    return noStore(NextResponse.json(empty(message), { status: 200 }));
  }
}
