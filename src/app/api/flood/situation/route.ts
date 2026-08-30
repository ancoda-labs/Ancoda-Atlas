import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import { loadFloodContent } from '@/lib/flood';
import { mergeSitrep } from '@/lib/sitrep-merge';
import { cacheFor, noStore } from '@/lib/http-cache';
import type {
  BipadAlert,
  CorridorIncidents,
  FloodOfficialFeed,
  HelpRequest,
  PersonMapPoint,
  PortalActivity,
  SitrepContent,
} from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// The corridor's incident and alert picture, from BIPAD.
//
// Note what this is not: it is not the national death toll. BIPAD's incident
// register is filled in over hours and days, and an unfilled loss record is
// stored as zeros — so the totals here describe what has been entered, and
// carry the count of incidents still awaiting figures alongside them. The
// corridor death toll is the reviewed sitrep with a live bulletin overlay when
// that scrape's district split adds up — BIPAD is not that number.

const CACHE_TTL_MS = 3 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;

interface SituationPayload {
  corridor: CorridorIncidents;
  alerts: BipadAlert[];
  helpRequests: FloodOfficialFeed<HelpRequest> | null;
  /** Where the portal's missing-and-found reports are being filed from. */
  personPoints: FloodOfficialFeed<PersonMapPoint> | null;
  /** The portal's newest filings — help asked for, and help offered. */
  latest: PortalActivity | null;
  /** Reviewed sitrep with the live bulletin overlay when that scrape succeeded. */
  sitrep: SitrepContent | null;
  generatedAt: string;
}

let cache: { data: SituationPayload; at: number } | null = null;
let pending: Promise<SituationPayload> | null = null;

async function build(since: string): Promise<SituationPayload> {
  const { getCorridorIncidents, getAlerts } = await import('@/apis/sources/bipad.mjs');
  const { getHelpRequestsMap, getPersonMapPoints, getLatestActivity } = await import(
    '@/apis/sources/rescue-portal.mjs'
  );
  const [corridor, alerts, helpFeed, pointFeed, latest] = await Promise.all([
    getCorridorIncidents({ since }),
    getAlerts({ limit: 40 }).catch(() => []),
    getHelpRequestsMap({ limit: 200 }).catch(() => null),
    getPersonMapPoints({ limit: 200 }).catch(() => null),
    getLatestActivity({ limit: 6 }).catch(() => null),
  ]);
  const helpRequests = helpFeed
    ? { items: helpFeed.requests, error: helpFeed.error, source: helpFeed.source, fetchedAt: helpFeed.fetchedAt }
    : null;
  const personPoints = pointFeed
    ? { items: pointFeed.points, error: pointFeed.error, source: pointFeed.source, fetchedAt: pointFeed.fetchedAt }
    : null;
  const sitrep = mergeSitrep(loadFloodContent().sitrep, getFloodStore().sitrep);
  return { corridor, alerts, helpRequests, personPoints, latest, sitrep, generatedAt: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  const { EVENT_START } = await import('@/apis/utils/flood-scope.mjs');
  const since = req.nextUrl.searchParams.get('since') || EVENT_START;

  // The refresher covers the default window; an explicit `since` still fetches.
  const store = getFloodStore();
  const sitrep = mergeSitrep(loadFloodContent().sitrep, store.sitrep);
  if (store.corridor && since === EVENT_START) {
    const res = NextResponse.json({
      corridor: store.corridor,
      alerts: store.alerts,
      helpRequests: store.helpRequests,
      personPoints: store.personPoints,
      latest: store.latestActivity,
      sitrep,
      generatedAt: store.lastRunAt || new Date().toISOString(),
    });
    res.headers.set('X-Atlas-Cache', 'cron');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  if (!pending) {
    pending = build(since)
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
    return data.corridor.error ? noStore(res) : cacheFor(res, { edge: CACHE_TTL_S });
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Situation API] Failed:', message);
    return noStore(NextResponse.json(
      {
        corridor: {
          incidents: [],
          totals: null,
          error: message,
          source: { label: 'BIPAD Portal', url: 'https://bipadportal.gov.np/' },
          fetchedAt: new Date().toISOString(),
        },
        alerts: [],
        helpRequests: null,
        personPoints: null,
        latest: null,
        sitrep: mergeSitrep(loadFloodContent().sitrep, getFloodStore().sitrep),
        generatedAt: new Date().toISOString(),
      },
      { status: 200 },
    ));
  }
}
