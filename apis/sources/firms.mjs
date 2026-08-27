// NASA FIRMS — Fire Information for Resource Management System
// Detects active fires/thermal anomalies within ~3 hours of satellite pass.
// Scoped to Nepal's seven provinces. Nepal's forest fire season runs roughly
// March to May, when pre-monsoon dryness combines with agricultural burning
// and fires drive both the Kathmandu valley's spring air quality collapse and
// significant losses in community forests.

import '../utils/env.mjs';
import { PROVINCES } from '../utils/nepal.mjs';

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

// Parse FIRMS CSV response into structured data
function parseCSV(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = vals[i]?.trim(); });
    return obj;
  });
}

// Fetch fires in a bounding box
async function fetchFires(opts = {}) {
  const {
    west = -180, south = -90, east = 180, north = 90,
    days = 1,
    source = 'VIIRS_SNPP_NRT',
  } = opts;

  const key = process.env.FIRMS_MAP_KEY;
  if (!key) return { error: 'No FIRMS_MAP_KEY' };

  const url = `${FIRMS_BASE}/${key}/${source}/${west},${south},${east},${north}/${days}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Atlas/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    return parseCSV(text);
  } catch (e) {
    clearTimeout(timer);
    return { error: e.message };
  }
}

// Nepal's seven provinces — FIRMS wants west/south/east/north, the province
// table stores lamin/lomin/lamax/lomax, so translate once here.
const HOTSPOTS = Object.fromEntries(
  Object.entries(PROVINCES).map(([key, p]) => [
    key,
    { west: p.lomin, south: p.lamin, east: p.lomax, north: p.lamax, label: p.label },
  ])
);

// Analyze fire detections for potential military/strike activity
function analyzeFires(fires, regionLabel) {
  if (!Array.isArray(fires) || fires.length === 0) {
    return { region: regionLabel, totalDetections: 0, highConfidence: 0, highIntensity: [], summary: 'No detections' };
  }

  const highConf = fires.filter(f => f.confidence === 'h' || f.confidence === 'high');
  const nomConf = fires.filter(f => f.confidence === 'n' || f.confidence === 'nominal');

  // High intensity fires (FRP > 10 MW) — large forest fires or industrial blazes
  // rather than the small agricultural burns that dominate detection counts
  const highIntensity = fires
    .filter(f => parseFloat(f.frp) > 10)
    .map(f => ({
      lat: parseFloat(f.latitude),
      lon: parseFloat(f.longitude),
      brightness: parseFloat(f.bright_ti4),
      frp: parseFloat(f.frp),
      date: f.acq_date,
      time: f.acq_time,
      confidence: f.confidence,
      daynight: f.daynight,
    }))
    .sort((a, b) => b.frp - a.frp)
    .slice(0, 15);

  // Night detections matter most: crop-residue and pasture burning happens in
  // daylight, so a night signature usually means a fire nobody put out
  const nightFires = fires.filter(f => f.daynight === 'N');

  return {
    region: regionLabel,
    totalDetections: fires.length,
    highConfidence: highConf.length,
    nominalConfidence: nomConf.length,
    nightDetections: nightFires.length,
    highIntensity,
    avgFRP: fires.reduce((sum, f) => sum + (parseFloat(f.frp) || 0), 0) / fires.length,
  };
}

// Briefing
export async function briefing() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    return {
      source: 'NASA FIRMS',
      timestamp: new Date().toISOString(),
      status: 'no_key',
      message: 'Set FIRMS_MAP_KEY for satellite fire/strike detection. Free at https://firms.modaps.eosdis.nasa.gov/api/area/',
    };
  }

  // Fetch all hotspots in parallel
  const entries = Object.entries(HOTSPOTS);
  const rawResults = await Promise.all(
    entries.map(async ([key, box]) => {
      const fires = await fetchFires({ ...box, days: 2 });
      return { key, label: box.label, fires };
    })
  );

  const hotspots = rawResults.map(r => {
    if (r.fires?.error) return { region: r.label, error: r.fires.error };
    return analyzeFires(r.fires, r.label);
  });

  // Generate signals
  const signals = [];
  const totalDetections = hotspots.reduce((s, h) => s + (h.totalDetections || 0), 0);

  for (const h of hotspots) {
    if (h.highIntensity?.length > 5) {
      signals.push(`HIGH INTENSITY FIRES in ${h.region}: ${h.highIntensity.length} detections >10MW FRP`);
    }
    if (h.nightDetections > 20) {
      signals.push(`SUSTAINED NIGHT BURNING in ${h.region}: ${h.nightDetections} night detections — fires running unchecked overnight`);
    }
  }

  // Pre-monsoon is when Nepal's fire season peaks and smoke drives the
  // Kathmandu valley's worst air quality of the year.
  const month = new Date().getMonth() + 1;
  const fireSeason = month >= 3 && month <= 5;
  if (fireSeason && totalDetections > 200) {
    signals.push(`Fire season active — ${totalDetections} detections nationwide, expect degraded air quality across the valley`);
  }

  return {
    source: 'NASA FIRMS',
    timestamp: new Date().toISOString(),
    status: 'active',
    fireSeason,
    totalDetections,
    hotspots,
    signals,
  };
}

if (process.argv[1]?.endsWith('firms.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
