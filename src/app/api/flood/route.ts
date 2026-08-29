import { NextResponse } from 'next/server';
import { loadFloodContent, fetchCorridorGauges } from '@/lib/flood';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FloodDeskPayload } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// River gauges report roughly every 10 minutes, so a 2-minute cache keeps the
// panel current without hammering BIPAD on every dashboard open.
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;
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
    // The corridor tally and NDRRMA's rescued-persons totals ride along so the
    // overview can put live government figures beside the reviewed toll. The
    // rescue register itself does not: it is two thousand names, and the page
    // that searches them fetches it on its own route.
    corridor: store.corridor,
    rescueSummary: store.rescue?.summary ?? null,
    rescueFetchedAt: store.rescue?.fetchedAt ?? null,
    portal: store.portal,
    dailyBulletin: store.dailyBulletin,
    advisories: store.advisories,
    govEfforts: store.govEfforts,
    portalContacts: store.portalContacts,
    popups: store.popups,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return cacheFor(res, { edge: CACHE_TTL_S });
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
    return cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Flood API] Failed:', message);
    // The reviewed content is bundled, so serve it even if BIPAD is down.
    // Not cached: this response has no gauges in it, and the next reader should
    // get a fresh attempt rather than inherit this one's bad minute.
    return noStore(NextResponse.json(
      { ...loadFloodContent(), river: { gauges: [], error: message, fetchedAt: new Date().toISOString() }, generatedAt: new Date().toISOString() },
      { status: 200 }
    ));
  }
}
