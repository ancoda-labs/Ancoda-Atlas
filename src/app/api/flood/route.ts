import { NextResponse } from 'next/server';
import { loadFloodContent, fetchCorridorGauges } from '@/lib/flood';
import { getFloodStore, isFloodRefreshRunning } from '@/lib/flood-cron';
import { cacheFor, noStore } from '@/lib/http-cache';
import type { FloodDeskPayload } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// River gauges report roughly every 10 minutes, so a 2-minute cache keeps the
// panel current without hammering BIPAD on every dashboard open.
const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;

/**
 * How long a payload built before the first cycle landed may be reused.
 *
 * Not the full two minutes — that pinned the overview's live sections to empty
 * long after the figures had arrived. But not zero either: without any floor,
 * every request to a cold instance rebuilds, and each rebuild re-fetches the
 * river gauges because the store has none yet. Under a page polling every few
 * seconds that competes with the very cycle it is waiting for, and a cold start
 * measured 144 seconds instead of 44.
 *
 * Ten seconds is short enough that the figures appear as soon as they exist,
 * and long enough that a burst of readers cannot stampede the upstreams.
 */
const COLD_TTL_MS = 10 * 1000;
let cache: { data: FloodDeskPayload; at: number; warm: boolean } | null = null;
let pending: Promise<FloodDeskPayload> | null = null;

/** The cycle's live state, laid over a payload that may have been cached. */
function withLiveState(data: FloodDeskPayload): FloodDeskPayload {
  return { ...data, refreshing: isFloodRefreshRunning() };
}

async function build(): Promise<FloodDeskPayload> {
  const content = loadFloodContent();
  // Gauges come from the ten-minute refresh; the direct fetch is the cold-start
  // path only, for the first request after a deploy.
  const store = getFloodStore();
  // The direct fetch is the cold-start path only. It is skipped while a cycle
  // is in flight: reading the store now also starts that cycle, so without this
  // every request arriving during the first ~30 seconds fetched the gauges
  // again on its own and competed with the cycle it was waiting for. A cold
  // request simply has no gauges yet; the next poll has them.
  const river =
    store.river ?? (isFloodRefreshRunning() ? null : await fetchCorridorGauges());
  // Same cold-start as the gauges: the overview leads with BIPAD's incident
  // tiles, and those must not wait for the ten-minute cycle. Skipped while a
  // cycle is already fetching them.
  let corridor = store.corridor;
  if (!corridor && !isFloodRefreshRunning()) {
    try {
      const { getCorridorIncidents } = await import('@/apis/sources/bipad.mjs');
      corridor = await getCorridorIncidents();
    } catch {
      corridor = null;
    }
  }
  return {
    ...content,
    river: river ?? { gauges: [], error: null, fetchedAt: new Date().toISOString() },
    // The corridor tally and NDRRMA's rescued-persons totals ride along so the
    // overview can put live government figures beside the reviewed toll. The
    // rescue register itself does not: it is two thousand names, and the page
    // that searches them fetches it on its own route.
    corridor,
    rescueSummary: store.rescue?.summary ?? null,
    rescueFetchedAt: store.rescue?.fetchedAt ?? null,
    portal: store.portal,
    dailyBulletin: store.dailyBulletin,
    advisories: store.advisories,
    govEfforts: store.govEfforts,
    portalContacts: store.portalContacts,
    popups: store.popups,
    // The cycle's own timings, so every page can say how old its figures are
    // without asking a second route for it.
    refreshedAt: store.lastRunAt,
    nextRefreshAt: store.nextRunAt,
    refreshIntervalMinutes: store.intervalMinutes,
    refreshing: isFloodRefreshRunning(),
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  // A cold payload — one built before the first cycle finished — is held only
  // briefly, so the sections that read the store appear as soon as it warms.
  // The judgement is made on how the entry was BUILT, not on the store now:
  // reading the store here meant that once it warmed, a payload built while it
  // was cold was suddenly judged with the full two-minute window and served
  // with refreshedAt still null — the exact staleness this exists to prevent.
  if (cache && Date.now() - cache.at < (cache.warm ? CACHE_TTL_MS : COLD_TTL_MS)) {
    // Everything in a cached payload describes the last cycle and is still
    // true. Whether one is running right now is not — it is a fact about this
    // instant, and served from a two-minute cache it would be stale for most
    // of the cycle it is meant to report. The page uses it to explain why the
    // figures are older than the interval ("updating now" rather than a bare
    // eleven minutes), so it is answered fresh on every request.
    const res = NextResponse.json(withLiveState(cache.data));
    res.headers.set('X-Atlas-Cache', 'hit');
    // A response whose refreshing flag is only true for a moment must not be
    // held by a shared cache for two minutes.
    return isFloodRefreshRunning() ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  }

  // Collapse concurrent misses onto one upstream fan-out.
  if (!pending) {
    pending = build()
      .then(data => {
        // Only a payload built from a warmed store is worth keeping. On a cold
        // instance the first request arrives while the refresh cycle is still
        // running, so the build captures nulls — and caching that pinned the
        // overview's live band, the official feeds and the portal counters to
        // empty for two minutes after every deploy, long after the figures
        // themselves had landed. An unwarmed build is served once and rebuilt
        // on the next request instead.
        cache = { data, at: Date.now(), warm: Boolean(getFloodStore().lastRunAt) };
        return data;
      })
      .finally(() => {
        pending = null;
      });
  }

  try {
    const data = await pending;
    const warm = Boolean(getFloodStore().lastRunAt);
    const res = NextResponse.json(withLiveState(data));
    res.headers.set('X-Atlas-Cache', warm ? 'miss' : 'cold');
    // Not cached at the edge either, for the same reason.
    return warm ? cacheFor(res, { edge: CACHE_TTL_S }) : noStore(res);
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
