import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getFloodStore } from '@/lib/flood-cron';
import type { BipadAlert, CorridorIncidents } from '@/lib/types';
import { errorMessage } from '@/lib/types';

export const dynamic = 'force-dynamic';

// The corridor's incident and alert picture, from BIPAD.
//
// Note what this is not: it is not the national death toll. BIPAD's incident
// register is filled in over hours and days, and an unfilled loss record is
// stored as zeros — so the totals here describe what has been entered, and
// carry the count of incidents still awaiting figures alongside them. The
// authoritative toll lives in reviewed content, sourced to NDRRMA and Police.

const CACHE_TTL_MS = 3 * 60 * 1000;

interface SituationPayload {
  corridor: CorridorIncidents;
  alerts: BipadAlert[];
  generatedAt: string;
}

let cache: { data: SituationPayload; at: number } | null = null;
let pending: Promise<SituationPayload> | null = null;

async function build(since: string): Promise<SituationPayload> {
  const { getCorridorIncidents, getAlerts } = await import('@/apis/sources/bipad.mjs');
  const [corridor, alerts] = await Promise.all([
    getCorridorIncidents({ since }),
    getAlerts({ limit: 40 }).catch(() => []),
  ]);
  return { corridor, alerts, generatedAt: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since') || '2026-08-20';

  // The refresher covers the default window; an explicit `since` still fetches.
  const store = getFloodStore();
  if (store.corridor && since === '2026-08-20') {
    const res = NextResponse.json({
      corridor: store.corridor,
      alerts: store.alerts,
      generatedAt: store.lastRunAt || new Date().toISOString(),
    });
    res.headers.set('X-Atlas-Cache', 'cron');
    return res;
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return res;
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
    return res;
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Situation API] Failed:', message);
    return NextResponse.json(
      {
        corridor: {
          incidents: [],
          totals: null,
          error: message,
          source: { label: 'BIPAD Portal', url: 'https://bipadportal.gov.np/' },
          fetchedAt: new Date().toISOString(),
        },
        alerts: [],
        generatedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
