import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { RescueRegister } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The NDRRMA rescued-persons register.
//
// Served whole rather than paginated: the page's whole purpose is that someone
// can search it for a name, and a search that only covers the first twenty rows
// is worse than no search.
//
// Normally this is just a read of whatever the ten-minute refresh last pulled.
// The direct fetch below is the cold-start path — the first request after a
// deploy, before the first cycle has landed.

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;
let cache: { data: RescueRegister; at: number } | null = null;
let pending: Promise<RescueRegister> | null = null;

export async function GET() {
  const store = getFloodStore();
  if (store.rescue) {
    // The OPMCM register is deliberately not folded in here: it is eight
    // thousand rows and has its own route, so this response stays small enough
    // to paint the search box quickly.
    const res = NextResponse.json(store.rescue);
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  if (!pending) {
    pending = (async () => {
      const { getRescueRegister } = await import('@/apis/sources/ndrrma.mjs');
      return getRescueRegister();
    })()
      .then(data => {
        // Only cache a register that actually arrived. Caching an empty result
        // for two minutes would keep a family staring at "not found" long after
        // the portal came back.
        if (!data.error) cache = { data, at: Date.now() };
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
    // Same rule the in-memory cache follows above: a register that did not
    // arrive is not something to keep serving.
    return data.error ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Rescue API] Failed:', message);
    return noStore(NextResponse.json(
      {
        persons: [],
        summary: null,
        locations: { rescued: [], stationed: [] },
        error: message,
        source: { label: 'NDRRMA rescue portal', url: 'https://ndrrma.gov.np/np/rescue' },
        fetchedAt: new Date().toISOString(),
      } satisfies RescueRegister,
      { status: 200 },
    ));
  }
}
