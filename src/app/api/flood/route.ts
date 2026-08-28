import { NextResponse } from 'next/server';
import { loadFloodContent, fetchCorridorGauges } from '@/lib/flood';
import { getFloodStore } from '@/lib/flood-cron';
import type { FloodDeskPayload } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// River gauges report roughly every 10 minutes, so a 2-minute cache keeps the
// panel current without hammering BIPAD on every dashboard open.
const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { data: FloodDeskPayload; at: number } | null = null;
let pending: Promise<FloodDeskPayload> | null = null;

async function build(): Promise<FloodDeskPayload> {
  const content = loadFloodContent();
  // Gauges come from the ten-minute refresh; the direct fetch is the cold-start
  // path only, for the first request after a deploy.
  const store = getFloodStore();
  const river = store.river ?? (await fetchCorridorGauges());
  return {
    ...content,
    river,
    bulletinRescue: store.bulletinRescue,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return res;
  }

  // Collapse concurrent misses onto one upstream fan-out.
  if (!pending) {
    pending = build()
      .then(data => {
        cache = { data, at: Date.now() };
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }

  try {
    const data = await pending;
    const res = NextResponse.json(data);
    res.headers.set('X-Atlas-Cache', 'miss');
    return res;
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Flood API] Failed:', message);
    // The reviewed content is on local disk, so serve it even if BIPAD is down.
    return NextResponse.json(
      { ...loadFloodContent(), river: { gauges: [], error: message, fetchedAt: new Date().toISOString() }, generatedAt: new Date().toISOString() },
      { status: 200 }
    );
  }
}
