// Rasuwa–Bhotekoshi flood — content loading and live river-gauge telemetry.
//
// Two kinds of data, kept separate on purpose:
//
//   Reviewed content (content/bhotekoshi-flood/*.json) — helplines, bank
//   accounts, relief funds, what happened. Changes only through a reviewed
//   edit, because disaster fundraising scams peak in the first days and an
//   auto-published donation link would lend Atlas's credibility to one.
//
//   Live telemetry (BIPAD Portal) — river levels against each gauge's own
//   warning and danger thresholds. Published automatically, always stamped
//   with the time the reading was actually taken.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { FloodContent, FloodGauge, FloodOrg, GaugeLevel, RiverGauges } from './types';
import { errorMessage } from './types';

const CONTENT_DIR = join(process.cwd(), 'content', 'bhotekoshi-flood');

const BIPAD_RIVER_URL = 'https://bipadportal.gov.np/api/v1/river-stations/?limit=500';
const BIPAD_TIMEOUT_MS = 20_000;

// The gauges that sit on the flood's actual path, ordered upstream → downstream:
// Bhotekoshi from the Tibet border through Rasuwa, into the Trishuli, down to
// the Narayani at Devghat. Matched on the station title BIPAD publishes.
const CORRIDOR_STATIONS: Array<{ match: string; label: string; labelNe: string; district: string; districtNe: string }> = [
  { match: 'Bhotekoshi at Rasuwagadi',       label: 'Bhotekoshi at Rasuwagadhi', labelNe: 'भोटेकोशी, रसुवागढी',   district: 'Rasuwa',  districtNe: 'रसुवा' },
  { match: 'Bhote Koshi at Shyaprubesi',     label: 'Bhotekoshi at Syaphrubesi', labelNe: 'भोटेकोशी, स्याफ्रुबेंसी', district: 'Rasuwa',  districtNe: 'रसुवा' },
  { match: 'Langtang Khola at Shyaprubesi',  label: 'Langtang Khola',            labelNe: 'लाङटाङ खोला',          district: 'Rasuwa',  districtNe: 'रसुवा' },
  { match: 'Trishuli Khola at Dhunche',      label: 'Trishuli at Dhunche',       labelNe: 'त्रिशूली, धुन्चे',       district: 'Rasuwa',  districtNe: 'रसुवा' },
  { match: 'Trishuli at Betrawati',          label: 'Trishuli at Betrawati',     labelNe: 'त्रिशूली, बेत्रावती',     district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { match: 'Phalakhu Khola at Betrawati',    label: 'Phalakhu Khola',            labelNe: 'फलाँखु खोला',           district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { match: 'Tadi at Belkot',                 label: 'Tadi Khola at Belkot',      labelNe: 'तादी खोला, बेल्कोट',     district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { match: 'Trishuli River at Bhorle',       label: 'Trishuli at Bhorle',        labelNe: 'त्रिशूली, भोर्ले',        district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { match: 'Trishuli at Furke Khola',        label: 'Trishuli at Malekhu',       labelNe: 'त्रिशूली, मलेखु',        district: 'Dhading', districtNe: 'धादिङ' },
  { match: 'Trishuli River at Kali Khola',   label: 'Trishuli at Kali Khola',    labelNe: 'त्रिशूली, कालीखोला',     district: 'Dhading', districtNe: 'धादिङ' },
  { match: 'Ankhu Khola at Ankhu Bagar',     label: 'Ankhu Khola',               labelNe: 'आँखु खोला',            district: 'Dhading', districtNe: 'धादिङ' },
  { match: 'Budhi Gandaki at Aarughat',      label: 'Budhi Gandaki at Arughat',  labelNe: 'बूढीगण्डकी, आरुघाट',     district: 'Gorkha',  districtNe: 'गोरखा' },
  { match: 'Narayani at Devghat',            label: 'Narayani at Devghat',       labelNe: 'नारायणी, देवघाट',       district: 'Chitwan', districtNe: 'चितवन' },
  { match: 'Narayani River at Narayanghat',  label: 'Narayani at Narayanghat',   labelNe: 'नारायणी, नारायणघाट',    district: 'Chitwan', districtNe: 'चितवन' },
];

function readJson<T>(name: string): T | null {
  const path = join(CONTENT_DIR, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    console.error(`[Flood] Failed to parse ${name}:`, errorMessage(err));
    return null;
  }
}

export function loadFloodContent(): FloodContent {
  const fundsDir = join(CONTENT_DIR, 'relief-funds');
  let funds: FloodOrg[] = [];
  if (existsSync(fundsDir)) {
    funds = readdirSync(fundsDir)
      .filter(f => f.endsWith('.json'))
      .map((f): FloodOrg | null => {
        try {
          return JSON.parse(readFileSync(join(fundsDir, f), 'utf8')) as FloodOrg;
        } catch {
          return null;
        }
      })
      .filter((f): f is FloodOrg => f !== null)
      // Tier 3 is community-submitted. Nothing ships at tier 3 today, but the
      // gate exists so an unreviewed donation link can never reach the page.
      .filter(f => f.tier !== 3 || f.moderation === 'approved')
      .filter(f => f.status !== 'inactive')
      .sort((a, b) => (a.tier || 9) - (b.tier || 9));
  }

  return {
    site: readJson<FloodContent['site']>('site.json'),
    keyFigures: readJson<FloodContent['keyFigures']>('key-figures.json'),
    whatHappened: readJson<FloodContent['whatHappened']>('what-happened.json'),
    alerts: readJson<FloodContent['alerts']>('alerts.json'),
    floodPath: readJson<FloodContent['floodPath']>('flood-path.json'),
    helplines: readJson<FloodContent['helplines']>('helplines.json'),
    bankAccounts: readJson<FloodContent['bankAccounts']>('bank-accounts.json'),
    affectedDistricts: readJson<FloodContent['affectedDistricts']>('affected-districts.json'),
    funds,
  };
}

/** One station as BIPAD publishes it. Only the fields Atlas reads are listed. */
interface BipadStation {
  id: number;
  title?: string;
  waterLevel?: number | null;
  warningLevel?: number | null;
  dangerLevel?: number | null;
  waterLevelOn?: string | null;
  steady?: string | null;
  image?: string | null;
  point?: { coordinates?: [number, number] } | null;
}

// A reading older than this is shown as stale rather than as current. Most
// corridor gauges report every 10 minutes; some have been offline for years,
// and presenting a 2021 water level as "now" would be worse than showing none.
const STALE_AFTER_MINUTES = 180;

function classify(waterLevel: number | null, warning: number | null, danger: number | null): GaugeLevel {
  if (waterLevel == null) return 'unknown';
  if (danger != null && waterLevel >= danger) return 'danger';
  if (warning != null && waterLevel >= warning) return 'warning';
  if (warning == null && danger == null) return 'unknown';
  return 'normal';
}

export async function fetchCorridorGauges(): Promise<RiverGauges> {
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(BIPAD_RIVER_URL, {
      signal: AbortSignal.timeout(BIPAD_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring)' },
    });
    if (!res.ok) throw new Error(`BIPAD HTTP ${res.status}`);
    const data = await res.json();
    const payload = data as { results?: BipadStation[] };
    const results: BipadStation[] = Array.isArray(payload.results) ? payload.results : [];

    const gauges: FloodGauge[] = [];
    for (const spec of CORRIDOR_STATIONS) {
      const station = results.find(r => String(r.title ?? '').toLowerCase().includes(spec.match.toLowerCase()));
      if (!station) continue;

      const measuredAt: string | null = station.waterLevelOn || null;
      const ageMinutes = measuredAt
        ? Math.max(0, Math.round((Date.now() - new Date(measuredAt).getTime()) / 60000))
        : null;
      const stale = ageMinutes == null || ageMinutes > STALE_AFTER_MINUTES;

      let waterLevel: number | null = typeof station.waterLevel === 'number' ? station.waterLevel : null;
      const warningLevel: number | null = typeof station.warningLevel === 'number' ? station.warningLevel : null;
      const dangerLevel: number | null = typeof station.dangerLevel === 'number' ? station.dangerLevel : null;

      // BIPAD occasionally emits sensor spikes (one station reports 100008 m).
      // A reading far above the danger mark is instrument error, not a flood.
      const ceiling = (dangerLevel ?? warningLevel ?? 0) * 20;
      if (waterLevel != null && ceiling > 0 && waterLevel > ceiling) waterLevel = null;

      const level = stale ? 'unknown' : classify(waterLevel, warningLevel, dangerLevel);
      const percentOfDanger =
        waterLevel != null && dangerLevel && dangerLevel > 0
          ? Math.max(0, Math.min(140, Math.round((waterLevel / dangerLevel) * 100)))
          : waterLevel != null && warningLevel && warningLevel > 0
          ? Math.max(0, Math.min(140, Math.round((waterLevel / warningLevel) * 90)))
          : null;

      const coords = station.point?.coordinates;
      gauges.push({
        id: station.id,
        label: spec.label,
        labelNe: spec.labelNe,
        district: spec.district,
        districtNe: spec.districtNe,
        waterLevel,
        warningLevel,
        dangerLevel,
        level,
        trend: station.steady || null,
        measuredAt,
        ageMinutes,
        stale,
        percentOfDanger,
        lat: Array.isArray(coords) ? (coords[1] ?? null) : null,
        lon: Array.isArray(coords) ? (coords[0] ?? null) : null,
        photo: station.image ? `/api/flood/station-photo?id=${station.id}` : null,
      });
    }

    return { gauges, error: null, fetchedAt };
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Flood] BIPAD river gauges unavailable:', message);
    return { gauges: [], error: message, fetchedAt };
  }
}

// Station photos are static site pictures that change at most when DHM
// re-photographs a gauge, so the id → URL map is cached for an hour. Without
// this, rendering fourteen gauge photos meant fourteen full 500-station
// fetches from BIPAD.
const PHOTO_MAP_TTL_MS = 60 * 60 * 1000;
let photoMap: { at: number; urls: Map<number, string> } | null = null;
let photoMapPending: Promise<Map<number, string>> | null = null;

async function loadPhotoMap(): Promise<Map<number, string>> {
  const res = await fetch(BIPAD_RIVER_URL, {
    signal: AbortSignal.timeout(BIPAD_TIMEOUT_MS),
    headers: { Accept: 'application/json', 'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring)' },
  });
  if (!res.ok) throw new Error(`BIPAD HTTP ${res.status}`);
  const data = await res.json();
  const payload = data as { results?: BipadStation[] };
  const urls = new Map<number, string>();
  for (const station of payload.results ?? []) {
    if (station.id != null && station.image) urls.set(station.id, station.image);
  }
  photoMap = { at: Date.now(), urls };
  return urls;
}

/** Resolve one station's upstream photo URL, for the proxy route. */
export async function resolveStationPhotoUrl(stationId: number): Promise<string | null> {
  if (photoMap && Date.now() - photoMap.at < PHOTO_MAP_TTL_MS) {
    return photoMap.urls.get(stationId) || null;
  }
  try {
    // Collapse the thundering herd when a page renders every gauge photo at once.
    if (!photoMapPending) {
      photoMapPending = loadPhotoMap().finally(() => {
        photoMapPending = null;
      });
    }
    const urls = await photoMapPending;
    return urls.get(stationId) || null;
  } catch {
    // Fall back to a stale map rather than dropping every photo on one blip.
    return photoMap?.urls.get(stationId) || null;
  }
}
