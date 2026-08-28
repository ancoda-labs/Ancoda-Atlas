import { NextResponse } from 'next/server';
import { loadFloodContent, fetchCorridorGauges, reconcile } from '@/lib/flood';
import { getFloodStore } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { BulletinSitrep, FloodDeskPayload, SitrepContent } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// River gauges report roughly every 10 minutes, so a 2-minute cache keeps the
// panel current without hammering BIPAD on every dashboard open.
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;
let cache: { data: FloodDeskPayload; at: number } | null = null;
let pending: Promise<FloodDeskPayload> | null = null;

/**
 * The reviewed toll with the bulletin's current figures laid over it.
 *
 * The reviewed file is a floor, not a ceiling. It holds nine groups; the
 * bulletin publishes five of them and moves them every few hours, which is how
 * the page came to say 469 dead beside a compilation reading 579. So a live
 * group replaces the reviewed one of the same id, in place, and the four the
 * bulletin does not carry stay exactly as reviewed.
 *
 * The merged set is re-added afterwards rather than trusted: a live group whose
 * parts stop summing to its own stated total is reported to the page the same
 * way a bad hand edit is, because from the reader's side those are the same
 * problem.
 */
function mergeSitrep(reviewed: SitrepContent | null, live: BulletinSitrep | null): SitrepContent | null {
  if (!reviewed) return reviewed;
  if (!live || live.error || !live.breakdowns.length) return reviewed;

  const fresh = new Map(live.breakdowns.map(b => [b.id, b]));
  const seen = new Set<string>();
  const breakdowns = (reviewed.breakdowns ?? []).map(b => {
    const replacement = fresh.get(b.id);
    if (!replacement) return b;
    seen.add(b.id);
    return replacement;
  });
  // A group the bulletin has started publishing that the reviewed file never
  // held is still worth showing.
  for (const b of live.breakdowns) if (!seen.has(b.id)) breakdowns.push(b);

  const sources = [...(reviewed.sources ?? [])];
  if (!sources.some(s => s.url === live.source.url)) sources.push(live.source);

  return {
    ...reviewed,
    breakdowns,
    sources,
    as_of_label_en: live.asOfLabelEn || reviewed.as_of_label_en,
    as_of_label_ne: live.asOfLabelNe || reviewed.as_of_label_ne,
    discrepancies: reconcile(breakdowns),
  };
}

async function build(): Promise<FloodDeskPayload> {
  const content = loadFloodContent();
  // Gauges come from the ten-minute refresh; the direct fetch is the cold-start
  // path only, for the first request after a deploy.
  const store = getFloodStore();
  const river = store.river ?? (await fetchCorridorGauges());
  // Same cold-start path as the gauges: on the first request after a deploy the
  // ten-minute cycle may not have run yet, and the toll is the last thing that
  // should be a cycle behind. A failed read here simply leaves the reviewed
  // figures standing.
  const liveSitrep =
    store.sitrep ??
    (await import('@/apis/sources/bulletin-sitrep.mjs')
      .then(m => m.getBulletinSitrep())
      .catch(() => null));
  return {
    ...content,
    river,
    sitrep: mergeSitrep(content.sitrep, liveSitrep),
    bulletinRescue: store.bulletinRescue,
    portal: store.portal,
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
