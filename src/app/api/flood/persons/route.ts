import { NextResponse } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { OpmcmPersonRegister, OpmcmPersonReport } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The OPMCM portal's open missing-and-found register, whole.
//
// Eight thousand names, served in one response and never paginated at this
// boundary. That is deliberate: the page's whole purpose is that a family can
// type a relative's name into it, and a search that only covers the rows the
// server felt like sending is worse than no search — it answers "not found"
// about someone who is on the list.
//
// It has its own route rather than riding on /api/flood/rescue because it is by
// far the largest thing on the desk. Keeping it separate means the NDRRMA
// register paints first and this fills in behind it, instead of both waiting.
//
// Served from the ten-minute refresh. The cold-start path below is the first
// request after a deploy, and it is a seventeen-page sweep of the portal, so it
// happens at most once.

const CACHE_TTL_MS = 3 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;
let pending: Promise<OpmcmPersonRegister> | null = null;

/**
 * The register, compressed on the way out — but not by us.
 *
 * Eight thousand rows is four megabytes of JSON and compresses to about a
 * third of one, and that ratio is the difference between this page working and
 * not working on a phone on a Nepali mobile network, which is what most people
 * reading it are on. It is not negotiable; who performs it is.
 *
 * This route used to gzip the body itself and hold the compressed buffer in
 * module scope. On the Workers deployment that was the worst place for it:
 * `gzipSync` over four megabytes is real CPU inside an invocation that has a
 * budget, it needs the JSON string and the output buffer resident at the same
 * time, and the cached buffer then stayed pinned for the isolate's whole life
 * alongside the register it was made from. Cloudflare already negotiates gzip
 * or brotli on the way out, so the reader gets the same compressed bytes and
 * the isolate holds none of it.
 */
function encodedJson(data: OpmcmPersonRegister): NextResponse {
  return NextResponse.json(data);
}

function empty(error: string): OpmcmPersonRegister {
  return {
    lost: [],
    found: [],
    other: [],
    total: null,
    fetched: 0,
    error,
    source: { label: 'OPMCM rescue portal — person reports', url: 'https://rescue.opmcm.gov.np/person-reports' },
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const store = getFloodStore();
  if (store.opmcmPersons) {
    const res = encodedJson(store.opmcmPersons);
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  // Collapse concurrent cold-start misses onto one sweep — seventeen requests
  // against the portal is not something to do once per reader.
  if (!pending) {
    pending = (async () => {
      const { getPersonRegister } = await import('@/apis/sources/rescue-portal.mjs');
      const { proxyUrlFor } = await import('@/lib/news-media');
      const register = await getPersonRegister();
      const withProxy = (list: typeof register.lost): OpmcmPersonReport[] =>
        list.map(({ image, ...rest }) => ({ ...rest, imageProxy: proxyUrlFor(image) }));
      return {
        lost: withProxy(register.lost),
        found: withProxy(register.found),
        other: withProxy(register.other),
        total: register.total,
        fetched: register.fetched,
        error: register.error,
        source: register.source,
        fetchedAt: register.fetchedAt,
      } satisfies OpmcmPersonRegister;
    })().finally(() => {
      pending = null;
    });
  }

  try {
    const data = await pending;
    const res = encodedJson(data);
    res.headers.set('X-Atlas-Cache', 'miss');
    // An empty register with an error is a failed sweep, not an empty list.
    // Caching that would keep a family staring at "not found" after the portal
    // came back.
    return data.error && !data.fetched ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Persons API] Failed:', message);
    return noStore(NextResponse.json(empty(message), { status: 200 }));
  }
}
