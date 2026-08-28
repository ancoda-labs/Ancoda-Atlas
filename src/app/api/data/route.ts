import { NextResponse } from 'next/server';
import { cacheFor, noStore } from '@/lib/http-cache';
import { sweeper } from '@/lib/sweeper';

export const dynamic = 'force-dynamic';

// The synthesized hazard snapshot the landing dashboard renders.
//
// The sweeper refreshes it on an interval, so a minute at the edge costs the
// reader nothing in freshness. The empty shape below is what gets served on a
// runtime where the sweeper cannot run at all — never cache that, or a
// deployment that later gains a data source keeps serving zeros.

const CACHE_TTL_S = 60;

export async function GET() {
  const data = sweeper.currentData;
  if (!data) {
    return noStore(
      NextResponse.json({ meta: { sourcesOk: 0, sourcesQueried: 0, totalDurationMs: 0 } }),
    );
  }
  return cacheFor(NextResponse.json(data), { edge: CACHE_TTL_S });
}
