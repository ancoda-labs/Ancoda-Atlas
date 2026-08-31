// Rasuwa–Bhotekoshi flood — content loading and live river-gauge telemetry.
//
// Two kinds of data, kept separate on purpose:
//
//   Reviewed content (content/bhotekoshi-flood/*.json) — helplines, bank
//   accounts, relief funds, in-kind demand, what happened. Changes only through
//   a reviewed edit, because disaster fundraising scams peak in the first days
//   and an auto-published donation link would lend Atlas's credibility to one.
//
//   Live telemetry (BIPAD Portal) — river levels against each gauge's own
//   warning and danger thresholds. Published automatically, always stamped
//   with the time the reading was actually taken.

import type {
  AffectedDistrictProps,
  FloodContent,
  FloodDamageContent,
  FloodGauge,
  FloodOrg,
  GaugeLevel,
  GeoCollection,
  RiverGauges,
  FloodReliefReceived,
  FloodReliefNeeded,
  SitrepContent,
} from '@/types';
import { errorMessage } from '@/types';
import { reconcile } from '@/lib/sitrep-merge';

// ─── Reviewed content ───────────────────────────────────────────────────────
//
// Imported, not read from disk at request time.
//
// Atlas is served from Cloudflare Workers, where there is no filesystem behind
// process.cwd(). Every readFileSync here returned nothing in production, which
// is not a crash — readJson simply answered null — so the pages rendered their
// empty states and the helpline page went out with no phone numbers on it.
// A static import is resolved at build time and travels inside the bundle, so
// it behaves the same on Workers as it does under `next dev`.
//
// The cost is that the set of files is now fixed at build time. Adding a relief
// fund means adding it to RELIEF_FUNDS below — dropping a JSON file into the
// directory no longer picks it up on its own.
import siteJson from '../../content/bhotekoshi-flood/site.json';
import whatHappenedJson from '../../content/bhotekoshi-flood/what-happened.json';
import alertsJson from '../../content/bhotekoshi-flood/alerts.json';
import floodPathJson from '../../content/bhotekoshi-flood/flood-path.json';
import helplinesJson from '../../content/bhotekoshi-flood/helplines.json';
import bankAccountsJson from '../../content/bhotekoshi-flood/bank-accounts.json';
import districtContactsJson from '../../content/bhotekoshi-flood/district-contacts.json';
import sitrepJson from '../../content/bhotekoshi-flood/sitrep.json';
import reliefReceivedJson from '../../content/bhotekoshi-flood/relief-received.json';
import reliefNeededJson from '../../content/bhotekoshi-flood/relief-needed.json';
import damageJson from '../../content/bhotekoshi-flood/damage.json';
import districtGeoJson from '../../public/data/flood-affected-districts.json';

import careNepalFund from '../../content/bhotekoshi-flood/relief-funds/care-nepal.json';
import directReliefFund from '../../content/bhotekoshi-flood/relief-funds/direct-relief.json';
import globalGivingFund from '../../content/bhotekoshi-flood/relief-funds/globalgiving-nepal-flood-relief.json';
import ifrcFund from '../../content/bhotekoshi-flood/relief-funds/ifrc.json';
import nrcsFund from '../../content/bhotekoshi-flood/relief-funds/nrcs.json';
import pmoFund from '../../content/bhotekoshi-flood/relief-funds/pmo-disaster-relief-fund.json';

const RELIEF_FUNDS: readonly unknown[] = [
  careNepalFund,
  directReliefFund,
  globalGivingFund,
  ifrcFund,
  nrcsFund,
  pmoFund,
];

/**
 * Read a bundled content file as the shape the page expects.
 *
 * The JSON modules arrive with their literal shape inferred by the compiler,
 * which is narrower and structurally unrelated to the reviewed-content types.
 * The types in @/types are the contract the components are written against, so
 * they win here — exactly as they did when this went through JSON.parse.
 */
function content<T>(json: unknown): T {
  return json as T;
}

const BIPAD_RIVER_URL = 'https://bipadportal.gov.np/api/v1/river-stations/?limit=500';
const BIPAD_TIMEOUT_MS = 20_000;

// The gauges that sit on the flood's actual path, ordered upstream → downstream:
// Bhotekoshi from the Tibet border through Rasuwa, into the Trishuli, down to
// the Narayani at Devghat. Matched on the station title BIPAD publishes.
// `id` is BIPAD's river-station id, used for the DHM site-photo proxy.
const CORRIDOR_STATIONS: Array<{ id: number; match: string; label: string; labelNe: string; district: string; districtNe: string }> = [
  { id: 171, match: 'Bhotekoshi at Rasuwagadi',       label: 'Bhotekoshi at Rasuwagadhi', labelNe: 'भोटेकोशी, रसुवागढी',   district: 'Rasuwa',  districtNe: 'रसुवा' },
  { id: 74,  match: 'Bhote Koshi at Shyaprubesi',     label: 'Bhotekoshi at Syaphrubesi', labelNe: 'भोटेकोशी, स्याफ्रुबेंसी', district: 'Rasuwa',  districtNe: 'रसुवा' },
  { id: 49,  match: 'Langtang Khola at Shyaprubesi',  label: 'Langtang Khola',            labelNe: 'लाङटाङ खोला',          district: 'Rasuwa',  districtNe: 'रसुवा' },
  { id: 105, match: 'Trishuli Khola at Dhunche',      label: 'Trishuli at Dhunche',       labelNe: 'त्रिशूली, धुन्चे',       district: 'Rasuwa',  districtNe: 'रसुवा' },
  { id: 137, match: 'Trishuli at Betrawati',          label: 'Trishuli at Betrawati',     labelNe: 'त्रिशूली, बेत्रावती',     district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { id: 79,  match: 'Phalakhu Khola at Betrawati',    label: 'Phalakhu Khola',            labelNe: 'फलाँखु खोला',           district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { id: 135, match: 'Tadi at Belkot',                 label: 'Tadi Khola at Belkot',      labelNe: 'तादी खोला, बेल्कोट',     district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { id: 35,  match: 'Trishuli River at Bhorle',       label: 'Trishuli at Bhorle',        labelNe: 'त्रिशूली, भोर्ले',        district: 'Nuwakot', districtNe: 'नुवाकोट' },
  { id: 261, match: 'Trishuli at Furke Khola',        label: 'Trishuli at Malekhu',       labelNe: 'त्रिशूली, मलेखु',        district: 'Dhading', districtNe: 'धादिङ' },
  { id: 67,  match: 'Trishuli River at Kali Khola',   label: 'Trishuli at Kali Khola',    labelNe: 'त्रिशूली, कालीखोला',     district: 'Dhading', districtNe: 'धादिङ' },
  { id: 68,  match: 'Ankhu Khola at Ankhu Bagar',     label: 'Ankhu Khola',               labelNe: 'आँखु खोला',            district: 'Dhading', districtNe: 'धादिङ' },
  { id: 100, match: 'Budhi Gandaki at Aarughat',      label: 'Budhi Gandaki at Arughat',  labelNe: 'बूढीगण्डकी, आरुघाट',     district: 'Gorkha',  districtNe: 'गोरखा' },
  { id: 25,  match: 'Narayani at Devghat',            label: 'Narayani at Devghat',       labelNe: 'नारायणी, देवघाट',       district: 'Chitwan', districtNe: 'चितवन' },
  { id: 106, match: 'Narayani River at Narayanghat',  label: 'Narayani at Narayanghat',   labelNe: 'नारायणी, नारायणघाट',    district: 'Chitwan', districtNe: 'चितवन' },
];

// DHM station portraits and BIPAD coordinates, as BIPAD published them.
// Water levels are never taken from here — only the pin and the site photo,
// which change when DHM re-photographs a gauge, not with the flood. Needed
// because the live river-stations feed is often unreachable from the
// Cloudflare host that serves atlas.ancodalabs.com.
const CORRIDOR_STATION_SITES: Record<number, { lat: number; lon: number; image: string }> = {
  171: { lat: 28.271297, lon: 85.377649, image: 'http://daq.hydrology.gov.np/images/83784301e1756ec67166ba592bcaec51' },
  74:  { lat: 28.17065, lon: 85.342554, image: 'http://daq.hydrology.gov.np/images/765e2644b4ebca0d35110479c999a6f8' },
  49:  { lat: 28.16222222, lon: 85.34611111, image: 'http://daq.hydrology.gov.np/images/9656ba736c6d3c61c56673d3e4c3b23a' },
  105: { lat: 28.098163, lon: 85.318589, image: 'http://daq.hydrology.gov.np/images/0a4d86552fd0e57c5ab02555b4dc693f' },
  137: { lat: 27.97, lon: 85.18, image: 'http://daq.hydrology.gov.np/images/3f8da446cb4c467cefcb57072396ca1f' },
  79:  { lat: 27.974259, lon: 85.185829, image: 'http://daq.hydrology.gov.np/images/965582ba18e135375d97534971f0c506' },
  135: { lat: 27.860094, lon: 85.134943, image: 'http://daq.hydrology.gov.np/images/325da877378a7511354dba39e151ea7c' },
  35:  { lat: 27.82, lon: 84.45, image: 'http://daq.hydrology.gov.np/images/73368683a6f7de9fb9558110f86350e9' },
  261: { lat: 27.802439, lon: 84.844102, image: 'http://daq.hydrology.gov.np/images/6bc210f963f5e2e3c424a74842e92fda' },
  67:  { lat: 27.833, lon: 84.546, image: 'http://daq.hydrology.gov.np/images/364ef9a4cae0f2a57b48d88b42f579ff' },
  68:  { lat: 28.000431, lon: 84.889347, image: 'http://daq.hydrology.gov.np/images/cf987cac6d1fe65d4a886347f3e4e760' },
  100: { lat: 28.046, lon: 84.816, image: 'http://daq.hydrology.gov.np/images/a5d962039af199e304760d743ab51419' },
  25:  { lat: 27.71, lon: 84.43, image: 'http://daq.hydrology.gov.np/images/82f9703dad054cae6100809681272696' },
  106: { lat: 27.69971, lon: 84.41894, image: 'http://daq.hydrology.gov.np/images/074313bb1102dc050064f069fbf182c1' },
};

// ─── District lookup ────────────────────────────────────────────────────────
//
// A gauge's district used to be typed in beside its name in CORRIDOR_STATIONS.
// Five of the fourteen disagreed with the coordinates BIPAD publishes for the
// same station, and two were badly wrong — "Trishuli at Bhorle" was labelled
// Nuwakot while its coordinates sit in Chitwan, about 75 km away. Since the map
// plots by coordinate and the table printed the label, the two contradicted
// each other and the pin looked misplaced.
//
// So the district is now derived from the position. A hand-typed label can no
// longer disagree with where the pin lands, because there is only one source
// for both.

interface DistrictShape {
  nameEn: string;
  nameNe: string;
  rings: Array<Array<[number, number]>>;
}

let districtShapes: DistrictShape[] | null = null;

function loadDistrictShapes(): DistrictShape[] {
  if (districtShapes) return districtShapes;
  districtShapes = [];
  try {
    const geo = content<GeoCollection<AffectedDistrictProps>>(districtGeoJson);
    districtShapes = geo.features.map(f => ({
      nameEn: f.properties.name_en,
      nameNe: f.properties.name_ne,
      rings: f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat(),
    }));
  } catch (err) {
    console.warn('[Flood] District shapes unavailable:', errorMessage(err));
  }
  return districtShapes;
}

/** Ray casting. `ring` is [lon, lat] pairs, as GeoJSON stores them. */
function pointInRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The district a coordinate falls in, or null if it is outside every shape. */
function districtAt(lat: number | null, lon: number | null): { en: string; ne: string } | null {
  if (lat == null || lon == null) return null;
  for (const shape of loadDistrictShapes()) {
    for (const ring of shape.rings) {
      if (pointInRing(lon, lat, ring)) return { en: shape.nameEn, ne: shape.nameNe };
    }
  }
  return null;
}

export function loadFloodContent(): FloodContent {
  const funds = RELIEF_FUNDS.map(f => content<FloodOrg>(f))
    // Tier 3 is community-submitted. Nothing ships at tier 3 today, but the
    // gate exists so an unreviewed donation link can never reach the page.
    .filter(f => f.tier !== 3 || f.moderation === 'approved')
    .filter(f => f.status !== 'inactive')
    .sort((a, b) => (a.tier || 9) - (b.tier || 9));

  return {
    site: content<FloodContent['site']>(siteJson),
    whatHappened: content<FloodContent['whatHappened']>(whatHappenedJson),
    alerts: content<FloodContent['alerts']>(alertsJson),
    floodPath: content<FloodContent['floodPath']>(floodPathJson),
    helplines: content<FloodContent['helplines']>(helplinesJson),
    bankAccounts: content<FloodContent['bankAccounts']>(bankAccountsJson),
    districtContacts: content<FloodContent['districtContacts']>(districtContactsJson),
    sitrep: loadSitrep(),
    reliefReceived: loadReliefReceived(),
    reliefNeeded: content<FloodReliefNeeded>(reliefNeededJson),
    damage: content<FloodDamageContent>(damageJson),
    funds,
  };
}

/** Re-add every sitrep breakdown. Lives next to the live overlay so both share one check. */
export { reconcile } from '@/lib/sitrep-merge';

function loadSitrep(): SitrepContent {
  const sitrep = content<SitrepContent>(sitrepJson);
  return { ...sitrep, discrepancies: reconcile(sitrep.breakdowns) };
}

function loadReliefReceived(): FloodReliefReceived {
  const received = content<FloodReliefReceived>(reliefReceivedJson);
  return { ...received, discrepancies: reconcile(received.breakdowns) };
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

function photoPath(stationId: number, liveImage?: string | null): string | null {
  if (liveImage || CORRIDOR_STATION_SITES[stationId]) return `/api/flood/station-photo?id=${stationId}`;
  return null;
}

function buildGauge(
  spec: (typeof CORRIDOR_STATIONS)[number],
  station: BipadStation | undefined,
): FloodGauge {
  const site = CORRIDOR_STATION_SITES[spec.id];
  const coords = station?.point?.coordinates;
  let lat = site?.lat ?? null;
  let lon = site?.lon ?? null;
  if (Array.isArray(coords) && coords.length >= 2) {
    lon = coords[0];
    lat = coords[1];
  }
  const place = districtAt(lat, lon);

  const measuredAt: string | null = station?.waterLevelOn || null;
  const ageMinutes = measuredAt
    ? Math.max(0, Math.round((Date.now() - new Date(measuredAt).getTime()) / 60000))
    : null;
  const stale = !station || ageMinutes == null || ageMinutes > STALE_AFTER_MINUTES;

  let waterLevel: number | null = typeof station?.waterLevel === 'number' ? station.waterLevel : null;
  const warningLevel: number | null = typeof station?.warningLevel === 'number' ? station.warningLevel : null;
  const dangerLevel: number | null = typeof station?.dangerLevel === 'number' ? station.dangerLevel : null;

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

  return {
    id: station?.id ?? spec.id,
    label: spec.label,
    labelNe: spec.labelNe,
    district: place?.en ?? spec.district,
    districtNe: place?.ne ?? spec.districtNe,
    waterLevel,
    warningLevel,
    dangerLevel,
    level,
    trend: station?.steady || null,
    measuredAt,
    ageMinutes,
    stale,
    percentOfDanger,
    lat,
    lon,
    photo: photoPath(spec.id, station?.image),
  };
}

let gaugesPending: Promise<RiverGauges> | null = null;

export async function fetchCorridorGauges(): Promise<RiverGauges> {
  if (gaugesPending) return gaugesPending;
  gaugesPending = fetchCorridorGaugesOnce().finally(() => {
    gaugesPending = null;
  });
  return gaugesPending;
}

async function fetchCorridorGaugesOnce(): Promise<RiverGauges> {
  const fetchedAt = new Date().toISOString();
  const fallback = (): FloodGauge[] => CORRIDOR_STATIONS.map(spec => buildGauge(spec, undefined));
  try {
    const res = await fetch(BIPAD_RIVER_URL, {
      signal: AbortSignal.timeout(BIPAD_TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'AncodaAtlas/4.0 (Nepal hazard monitoring)' },
    });
    if (!res.ok) throw new Error(`BIPAD HTTP ${res.status}`);
    const data = await res.json();
    const payload = data as { results?: BipadStation[] };
    const results: BipadStation[] = Array.isArray(payload.results) ? payload.results : [];

    return {
      gauges: CORRIDOR_STATIONS.map(spec => {
        const station = results.find(r => String(r.title ?? '').toLowerCase().includes(spec.match.toLowerCase()));
        return buildGauge(spec, station);
      }),
      error: null,
      fetchedAt,
    };
  } catch (err) {
    const message = errorMessage(err);
    console.error('[Flood] BIPAD river gauges unavailable:', message);
    return { gauges: fallback(), error: message, fetchedAt };
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
  const bundled = CORRIDOR_STATION_SITES[stationId]?.image ?? null;
  // Corridor portraits are bundled so the map does not wait on BIPAD — the
  // Cloudflare host often cannot reach bipadportal.gov.np at all.
  if (bundled) return bundled;
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
