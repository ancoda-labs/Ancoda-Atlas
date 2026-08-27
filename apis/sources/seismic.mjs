// USGS Earthquake Catalog — Nepal and the Main Himalayan Thrust
// Free, no key. Nepal sits on the collision boundary that produced the
// 2015 Gorkha earthquake, so this is the highest-consequence feed in the stack.

import { safeFetch, daysAgo } from '../utils/fetch.mjs';
import { SEISMIC_BBOX, PROVINCES, provinceOf, CITIES } from '../utils/nepal.mjs';

const BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

export async function getQuakes({ days = 30, minMagnitude = 2.5 } = {}) {
  const params = new URLSearchParams({
    format: 'geojson',
    starttime: daysAgo(days),
    minlatitude: String(SEISMIC_BBOX.lamin),
    maxlatitude: String(SEISMIC_BBOX.lamax),
    minlongitude: String(SEISMIC_BBOX.lomin),
    maxlongitude: String(SEISMIC_BBOX.lomax),
    minmagnitude: String(minMagnitude),
    orderby: 'time',
  });
  return safeFetch(`${BASE}?${params}`, { timeout: 20000 });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestCity(lat, lon) {
  let best = null;
  for (const c of Object.values(CITIES)) {
    const km = haversineKm(lat, lon, c.lat, c.lon);
    if (!best || km < best.km) best = { label: c.label, km: Math.round(km) };
  }
  return best;
}

function compactQuake(f) {
  const [lon, lat, depth] = f.geometry?.coordinates || [];
  const p = f.properties || {};
  return {
    id: f.id,
    mag: p.mag,
    place: p.place,
    time: p.time ? new Date(p.time).toISOString() : null,
    lat, lon,
    depthKm: depth,
    province: provinceOf(lat, lon),
    nearest: (typeof lat === 'number' && typeof lon === 'number') ? nearestCity(lat, lon) : null,
    felt: p.felt || 0,
    tsunami: Boolean(p.tsunami),
    url: p.url || null,
  };
}

export async function briefing() {
  const data = await getQuakes({ days: 30, minMagnitude: 2.5 });

  if (data?.error) {
    return { source: 'Seismic', timestamp: new Date().toISOString(), error: data.error };
  }

  const quakes = (data.features || []).map(compactQuake).filter(q => q.mag != null);
  const last24h = quakes.filter(q => q.time && Date.now() - new Date(q.time) < 86400000);
  const last7d = quakes.filter(q => q.time && Date.now() - new Date(q.time) < 7 * 86400000);

  const byProvince = {};
  for (const q of quakes) {
    if (!q.province) continue;
    byProvince[PROVINCES[q.province].label] = (byProvince[PROVINCES[q.province].label] || 0) + 1;
  }

  const strongest = [...quakes].sort((a, b) => b.mag - a.mag)[0] || null;
  const significant = quakes.filter(q => q.mag >= 4.5).slice(0, 15);

  // Shallow quakes do far more damage than deep ones at the same magnitude.
  const shallowStrong = quakes.filter(q => q.mag >= 4.0 && q.depthKm != null && q.depthKm < 35);

  const signals = [];
  if (strongest && strongest.mag >= 5.0) {
    signals.push(`M${strongest.mag} earthquake — ${strongest.place}`);
  }
  if (last24h.length >= 5) {
    signals.push(`${last24h.length} quakes in 24h — elevated seismic sequence`);
  }
  if (shallowStrong.length >= 3) {
    signals.push(`${shallowStrong.length} shallow M4+ events (<35km) — higher surface damage potential`);
  }
  if (last7d.some(q => q.mag >= 6.0)) {
    signals.push('M6+ event this week — expect aftershock sequence and infrastructure damage reports');
  }

  return {
    source: 'Seismic',
    timestamp: new Date().toISOString(),
    window: '30d',
    totalEvents: quakes.length,
    events24h: last24h.length,
    events7d: last7d.length,
    maxMagnitude: strongest?.mag ?? null,
    strongest,
    byProvince,
    significant,
    recent: quakes.slice(0, 25),
    signals,
  };
}

if (process.argv[1]?.endsWith('seismic.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
