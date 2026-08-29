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
  sweeper.ensureStarted();
  const data = sweeper.currentData;
  if (!data) {
    return noStore(
      NextResponse.json({ meta: { sourcesOk: 0, sourcesQueried: 0, totalDurationMs: 0 } }),
    );
  }
  // `sweeping` rides on the meta rather than the snapshot, so a page can say
  // "updating now" instead of reporting the last sweep as overdue while the
  // next one is still running.
  const withState = { ...data, meta: { ...data.meta, sweeping: sweeper.sweepInProgress } };
  return cacheFor(NextResponse.json(withState), { edge: CACHE_TTL_S });
}
