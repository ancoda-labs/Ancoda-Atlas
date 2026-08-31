import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { gzipSync } from 'zlib';
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
 * The register, gzipped once per refresh.
 *
 * Eight thousand rows is four megabytes of JSON and compresses to about a
 * third of one — names and place names repeat heavily. That ratio is the
 * difference between this page working and not working on a phone on a Nepali
 * mobile network, which is what most people reading it are on.
 *
 * Compressing four megabytes costs real CPU, so the result is held against the
 * refresh it came from and reused until the next cycle replaces it.
 */
let gzipped: { key: string; body: Buffer } | null = null;

function encodedJson(req: NextRequest, data: OpmcmPersonRegister): NextResponse {
  const json = JSON.stringify(data);
  if (!(req.headers.get('accept-encoding') || '').toLowerCase().includes('gzip')) {
    return new NextResponse(json, { headers: { 'Content-Type': 'application/json' } });
  }
  // `fetchedAt` changes on every refresh, so it identifies this exact register.
  const key = `${data.fetchedAt}:${data.fetched}`;
  if (gzipped?.key !== key) gzipped = { key, body: gzipSync(Buffer.from(json, 'utf8')) };
  return new NextResponse(new Uint8Array(gzipped.body), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip',
      Vary: 'Accept-Encoding',
    },
  });
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

export async function GET(req: NextRequest) {
  const store = getFloodStore();
  if (store.opmcmPersons) {
    const res = encodedJson(req, store.opmcmPersons);
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
    const res = encodedJson(req, data);
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
