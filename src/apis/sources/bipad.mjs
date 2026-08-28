// BIPAD Portal — the Government of Nepal disaster information platform.
//
// lib/flood.ts already reads BIPAD's river gauges. This module reads the rest
// of the open API: the incident register (much of it fed straight from Nepal
// Police reporting), the loss record attached to each incident, and the live
// DHM alerts. It is why Atlas does not scrape nepalpolice.gov.np — the police
// figures arrive here as structured data, already reconciled by the government.
//
// One rule runs through the whole module. BIPAD stores an unfilled loss record
// as a row of zeros, so "nobody died" and "nobody has typed the figures in yet"
// are the same bytes. During a live response the second is overwhelmingly more
// likely, and printing a confident 0 next to the word "deaths" on a page a
// grieving family might open is not a rounding error. Every aggregate here
// therefore reports how many incidents actually carried figures, and callers
// are expected to say so.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://bipadportal.gov.np/api/v1';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';
const TIMEOUT = 20_000;
const PAGE = 100;

/** BIPAD hazard ids. Flood and landslide are the pair this desk cares about. */
export const HAZARD = { FLOOD: 11, LANDSLIDE: 17, HEAVY_RAINFALL: 12, THUNDERBOLT: 23 };

/**
 * The Rasuwa–Bhotekoshi corridor, as a bounding box.
 *
 * BIPAD's own `district` filter is unreliable on the incident endpoint, so the
 * corridor is decided from each incident's coordinates instead: the Trishuli
 * catchment from the Tibet border down to the Narayani confluence.
 */
export const CORRIDOR_BBOX = { minLat: 27.4, maxLat: 28.6, minLon: 84.3, maxLon: 85.9 };

const TTL_MS = 3 * 60 * 1000;
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { value, at: Date.now() });
  return value;
}

async function getJson(path) {
  const data = await safeFetch(`${BASE}/${path}`, {
    timeout: TIMEOUT,
    retries: 1,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Page through a list endpoint.
 *
 * BIPAD reports `count` as 2^63-1 on every list — a sentinel, not a total — so
 * termination is decided by a short page or an absent `next`, never by count.
 */
async function collect(path, maxPages = 10) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const joiner = path.includes('?') ? '&' : '?';
    const data = await getJson(`${path}${joiner}limit=${PAGE}&offset=${page * PAGE}`);
    const results = Array.isArray(data?.results) ? data.results : [];
    out.push(...results);
    if (!data?.next || results.length < PAGE) break;
  }
  return out;
}

function coordsOf(node) {
  const c = node?.point?.coordinates;
  return Array.isArray(c) ? { lat: c[1] ?? null, lon: c[0] ?? null } : { lat: null, lon: null };
}

function inCorridor(lat, lon) {
  if (lat == null || lon == null) return false;
  return (
    lat >= CORRIDOR_BBOX.minLat && lat <= CORRIDOR_BBOX.maxLat &&
    lon >= CORRIDOR_BBOX.minLon && lon <= CORRIDOR_BBOX.maxLon
  );
}

/** The loss fields Atlas surfaces, mapped off BIPAD's much wider record. */
function normaliseLoss(raw) {
  if (!raw) return null;
  const n = key => (typeof raw[key] === 'number' ? raw[key] : 0);
  const loss = {
    id: raw.id,
    deaths: n('peopleDeathCount'),
    missing: n('peopleMissingCount'),
    injured: n('peopleInjuredCount'),
    affected: n('peopleAffectedCount'),
    familiesAffected: n('familyAffectedCount'),
    familiesEvacuated: n('familyEvacuatedCount'),
    familiesRelocated: n('familyRelocatedCount'),
    livestockLost: n('livestockDestroyedCount'),
    housesDestroyed: n('infrastructureDestroyedHouseCount'),
    housesAffected: n('infrastructureAffectedHouseCount'),
    roadsDestroyed: n('infrastructureDestroyedRoadCount'),
    bridgesDestroyed: n('infrastructureDestroyedBridgeCount'),
    electricityDestroyed: n('infrastructureDestroyedElectricityCount'),
    economicLoss: n('infrastructureEconomicLoss') + n('agricultureEconomicLoss'),
  };
  // The distinction the whole module turns on: has anyone filled this in?
  loss.reported = Object.entries(loss).some(([k, v]) => k !== 'id' && v > 0);
  return loss;
}

export async function getHazards() {
  return cached('hazards', async () => {
    const rows = await collect('hazard/', 3);
    return rows.map(h => ({
      id: h.id,
      title: h.titleEn || h.title,
      titleNe: h.titleNe || null,
      type: h.type || null,
      color: h.color || null,
      icon: h.icon || null,
    }));
  });
}

/** Incidents of one hazard since a date, newest first, corridor-filtered. */
export async function getIncidents({ hazard = HAZARD.FLOOD, since = '2026-08-25', corridorOnly = true } = {}) {
  return cached(`incidents:${hazard}:${since}:${corridorOnly}`, async () => {
    const rows = await collect(
      `incident/?hazard=${hazard}&incident_on__gt=${encodeURIComponent(since)}&ordering=-incident_on`,
      5,
    );
    return rows
      .map(r => {
        const { lat, lon } = coordsOf(r);
        return {
          id: r.id,
          title: r.title || null,
          titleNe: r.titleNe || null,
          incidentOn: r.incidentOn || null,
          reportedOn: r.reportedOn || null,
          streetAddress: r.streetAddress || null,
          hazard: r.hazard ?? null,
          lossId: r.loss ?? null,
          // `source` is BIPAD's provenance field: 'nepal_police', 'dhm', 'other'.
          source: r.source || null,
          verified: Boolean(r.verified),
          lat,
          lon,
        };
      })
      .filter(r => (corridorOnly ? inCorridor(r.lat, r.lon) : true));
  });
}

/** Fetch the loss records for a set of incidents, a few at a time. */
export async function getLosses(lossIds) {
  const ids = [...new Set(lossIds.filter(id => id != null))];
  const out = new Map();
  const CONCURRENCY = 6;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map(id => getJson(`loss/${id}/`)));
    settled.forEach((res, j) => {
      if (res.status === 'fulfilled') out.set(slice[j], normaliseLoss(res.value));
    });
  }
  return out;
}

/** Live DHM alerts, newest first. */
export async function getAlerts({ limit = 40 } = {}) {
  return cached(`alerts:${limit}`, async () => {
    const data = await getJson(`alert/?limit=${limit}&ordering=-started_on`);
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows.map(a => {
      const { lat, lon } = coordsOf(a);
      return {
        id: a.id,
        title: a.title || null,
        titleNe: a.titleNe || null,
        description: a.description || null,
        source: a.source || null,
        startedOn: a.startedOn || null,
        expireOn: a.expireOn || null,
        referenceType: a.referenceType || null,
        public: Boolean(a.public),
        verified: Boolean(a.verified),
        lat,
        lon,
      };
    });
  });
}

/**
 * The corridor's incident picture: every flood and landslide incident logged
 * since `since`, with whatever loss figures have actually been entered.
 */
export async function getCorridorIncidents({ since = '2026-08-25' } = {}) {
  const fetchedAt = new Date().toISOString();
  try {
    const [floods, slides] = await Promise.all([
      getIncidents({ hazard: HAZARD.FLOOD, since }),
      getIncidents({ hazard: HAZARD.LANDSLIDE, since }),
    ]);
    const incidents = [...floods, ...slides].sort((a, b) =>
      String(b.incidentOn || '').localeCompare(String(a.incidentOn || '')),
    );

    const losses = await getLosses(incidents.map(i => i.lossId));
    for (const incident of incidents) {
      incident.loss = incident.lossId != null ? losses.get(incident.lossId) ?? null : null;
    }

    const withFigures = incidents.filter(i => i.loss?.reported);
    const sum = key => withFigures.reduce((acc, i) => acc + (i.loss?.[key] ?? 0), 0);

    return {
      incidents,
      totals: {
        // Explicitly the tally of what BIPAD holds, not the national toll. The
        // official toll lives in reviewed content and is sourced separately.
        incidentCount: incidents.length,
        incidentsWithFigures: withFigures.length,
        incidentsAwaitingFigures: incidents.length - withFigures.length,
        deaths: sum('deaths'),
        missing: sum('missing'),
        injured: sum('injured'),
        affected: sum('affected'),
        familiesEvacuated: sum('familiesEvacuated'),
        housesDestroyed: sum('housesDestroyed'),
        bridgesDestroyed: sum('bridgesDestroyed'),
        roadsDestroyed: sum('roadsDestroyed'),
        economicLoss: sum('economicLoss'),
      },
      error: null,
      source: { label: 'BIPAD Portal', url: 'https://bipadportal.gov.np/' },
      fetchedAt,
    };
  } catch (err) {
    console.error('[BIPAD] Corridor incidents unavailable:', err.message);
    return {
      incidents: [],
      totals: null,
      error: err.message,
      source: { label: 'BIPAD Portal', url: 'https://bipadportal.gov.np/' },
      fetchedAt,
    };
  }
}
