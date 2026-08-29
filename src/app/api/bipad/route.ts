import { NextResponse } from 'next/server';
import { cacheFor, noStore } from '@/lib/http-cache';
import { safeFetch } from '@/apis/utils/fetch.mjs';
import type { BipadPayload, BipadRiverStation, BipadRainStation, BipadAlert, BipadIncident, BipadEarthquake } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

const BIPAD_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache
const BIPAD_CACHE_TTL_S = BIPAD_CACHE_TTL_MS / 1000;

let cache: { data: BipadPayload; at: number } | null = null;
let pending: Promise<BipadPayload> | null = null;

async function fetchBipadData(): Promise<BipadPayload> {
  const urls = {
    riverStations: 'https://bipadportal.gov.np/api/v1/river-stations/?limit=200',
    rainStations: 'https://bipadportal.gov.np/api/v1/rain-stations/?limit=200',
    alerts: 'https://bipadportal.gov.np/api/v1/alert/?ordering=-created_on&limit=50',
    incidents: 'https://bipadportal.gov.np/api/v1/incident/?ordering=-incident_on&limit=100',
    earthquakes: 'https://bipadportal.gov.np/api/v1/earthquake/?ordering=-event_on&limit=50',
  };

  const headers = {
    Accept: 'application/json',
    'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)',
  };

  const keys = Object.keys(urls) as Array<keyof typeof urls>;
  const promises = keys.map(key =>
    safeFetch(urls[key], { headers, timeout: 20000, retries: 1 })
  );

  const results = await Promise.all(promises);

  const data: Partial<BipadPayload> = {};
  keys.forEach((key, index) => {
    const rawResult = results[index];
    const result = rawResult as { error?: string; results?: unknown[] } & Record<string, unknown>;
    if (result && !result.error) {
      const list = Array.isArray(result.results) ? result.results : (Array.isArray(result) ? result : []);
      if (key === 'riverStations') data.riverStations = list as BipadRiverStation[];
      else if (key === 'rainStations') data.rainStations = list as BipadRainStation[];
      else if (key === 'alerts') data.alerts = list as BipadAlert[];
      else if (key === 'incidents') data.incidents = list as BipadIncident[];
      else if (key === 'earthquakes') data.earthquakes = list as BipadEarthquake[];
    } else {
      console.warn(`[BIPAD Route] Failed to fetch ${key}:`, result?.error || 'Unknown error');
      if (key === 'riverStations') data.riverStations = [];
      else if (key === 'rainStations') data.rainStations = [];
      else if (key === 'alerts') data.alerts = [];
      else if (key === 'incidents') data.incidents = [];
      else if (key === 'earthquakes') data.earthquakes = [];
    }
  });

  return data as BipadPayload;
}

export async function GET() {
  if (cache && Date.now() - cache.at < BIPAD_CACHE_TTL_MS) {
    const res = NextResponse.json(cache.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return cacheFor(res, { edge: BIPAD_CACHE_TTL_S });
  }

  if (!pending) {
    pending = fetchBipadData()
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
    return cacheFor(res, { edge: BIPAD_CACHE_TTL_S });
  } catch (err: unknown) {
    const message = errorMessage(err);
    console.error('[BIPAD API Proxy] Failed:', message);
    return noStore(NextResponse.json({ error: 'Failed to fetch BIPAD data' }, { status: 502 }));
  }
}
