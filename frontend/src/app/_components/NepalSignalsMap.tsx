'use client';

import React, { useRef, useEffect, useState } from 'react';
import { provinceOf } from '@/lib/nepal-geo';
import type { GeoCollection, Geometry, BipadPayload, BipadRiverStation, BipadRainStation, BipadAlert, BipadIncident, BipadEarthquake, BipadRainAverage } from '@/types';
import { errorMessage } from '@/types';
import LoadingUI from '@/components/LoadingUI';

/** A province or district outline, flattened to rings for canvas drawing. */
type Ring = Array<[number, number]>;
type Polygon = Ring[];

interface MapFeature {
  id: number;
  name: string;
  provinceCode: number;
  polygons: Polygon[];
}

interface MapBounds {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

interface AliasRule {
  provinceCode: number;
  weight: number;
  regex: RegExp;
}

/**
 * The map is fed from two places: the sweep's geo-tagged stories (`url`/`date`)
 * and the news aggregator (`link`/`pubDate`). It accepts either and normalises
 * the two field pairs before plotting.
 */
export interface MapStory {
  title: string;
  source?: string;
  url?: string;
  link?: string;
  date?: string;
  pubDate?: string;
  lat?: number;
  lon?: number;
  region?: string;
}

/** A story after province resolution, ready to plot. */
interface MapSignal {
  id: string;
  title: string;
  link: string;
  source: string;
  pubDate: Date;
  provinceCode: number;
  provinceName: string;
  lon: number;
  lat: number;
  type: string;
  severity: string;
}

// --- Data structures and constants ---
const NML_PROVINCE_ALIASES: Record<number, string[]> = {
  1: ['koshi', 'province 1', 'province no 1', 'province no. 1', 'कोशी', 'प्रदेश १'],
  2: ['madhesh', 'madhes', 'province 2', 'province no 2', 'province no. 2', 'मधेश', 'प्रदेश २'],
  3: ['bagmati', 'province 3', 'province no 3', 'province no. 3', 'बागमती', 'प्रदेश ३'],
  4: ['gandaki', 'province 4', 'province no 4', 'province no. 4', 'गण्डकी', 'प्रदेश ४'],
  5: ['lumbini', 'province 5', 'province no 5', 'province no. 5', 'लुम्बिनी', 'प्रदेश ५'],
  6: ['karnali', 'province 6', 'province no 6', 'province no. 6', 'कर्णाली', 'प्रदेश ६'],
  7: ['sudurpashchim', 'sudurpaschim', 'province 7', 'province no 7', 'province no. 7', 'सुदूरपश्चिम', 'प्रदेश ७'],
};

const NML_DISTRICT_ALIASES_BY_PROVINCE: Record<number, string[]> = {
  1: ['bhojpur', 'dhankuta', 'ilam', 'illam', 'jhapa', 'khotang', 'morang', 'okhaldhunga', 'panchthar', 'sankhuwasabha', 'sankhuwasava', 'solukhumbu', 'sunsari', 'taplejung', 'terhathum', 'tehrathum', 'udayapur'],
  2: ['bara', 'dhanusha', 'dhanusa', 'mahottari', 'parsa', 'rautahat', 'saptari', 'sarlahi', 'siraha'],
  3: ['bhaktapur', 'chitwan', 'dhading', 'dolakha', 'kathmandu', 'kavrepalanchok', 'kavre', 'lalitpur', 'makwanpur', 'nuwakot', 'ramechhap', 'rasuwa', 'sindhuli', 'sindhupalchok', 'sindhupalchowk'],
  4: ['baglung', 'gorkha', 'kaski', 'lamjung', 'manang', 'mustang', 'myagdi', 'nawalpur', 'nawalparasi east', 'east nawalparasi', 'nawalparasi purba', 'parbat', 'syangja', 'tanahun'],
  5: ['arghakhanchi', 'banke', 'bardiya', 'bardia', 'dang', 'gulmi', 'kapilvastu', 'kapilbastu', 'palpa', 'parasi', 'nawalparasi west', 'west nawalparasi', 'nawalparasi paschim', 'pyuthan', 'rolpa', 'rupandehi', 'rukum east', 'east rukum', 'rukum purbi'],
  6: ['dailekh', 'dolpa', 'humla', 'jajarkot', 'jumla', 'kalikot', 'mugu', 'rukum west', 'west rukum', 'rukum paschim', 'salyan', 'surkhet'],
  7: ['achham', 'baitadi', 'bajhang', 'bajura', 'dadeldhura', 'darchula', 'doti', 'kailali', 'kanchanpur', 'mahendranagar'],
};

const NML_PROVINCE_NAME: Record<number, string> = { 1: 'Koshi', 2: 'Madhesh', 3: 'Bagmati', 4: 'Gandaki', 5: 'Lumbini', 6: 'Karnali', 7: 'Sudurpashchim' };
const NML_PROVINCE_NEAR_LABEL: Record<number, string> = { 1: 'Koshi', 2: 'Madhesh', 3: 'Kathmandu', 4: 'Gandaki', 5: 'Lumbini', 6: 'Karnali', 7: 'Sudurpashchim' };
const NML_PROVINCE_CENTERS: Record<number, [number, number]> = { 1: [87.28, 26.73], 2: [85.97, 26.83], 3: [85.33, 27.67], 4: [84.0, 28.23], 5: [82.95, 27.62], 6: [81.66, 28.63], 7: [80.67, 29.05] };

// apis/utils/nepal.mjs keys the provinces by name; the map draws them by code.
const NML_PROVINCE_KEY_TO_CODE: Record<string, number> = {
  koshi: 1, madhesh: 2, bagmati: 3, gandaki: 4, lumbini: 5, karnali: 6, sudurpashchim: 7,
};

// Stories arrive already geo-tagged by lib/synthesize.mjs, which resolves
// Devanagari district names the Latin alias table below cannot match. Trust
// those coordinates first and fall back to text inference only when a story
// carries none — otherwise every Nepali-language headline is dropped, which is
// most of the first-hand district reporting during a disaster.
function nmlProvinceFromCoords(lat: unknown, lon: unknown): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = provinceOf(Number(lat), Number(lon));
  return key ? (NML_PROVINCE_KEY_TO_CODE[key] ?? null) : null;
}

const NML_SIGNAL_TYPE_RULES = [
  { type: 'seismic', keywords: ['earthquake', 'quake', 'aftershock', 'tremor', 'seismic', 'epicentre', 'epicenter', 'magnitude', 'भूकम्प', 'पराकम्प'] },
  { type: 'flood', keywords: ['flood', 'inundat', 'washed away', 'swollen', 'embankment', 'waterlogg', 'बाढी', 'डुबान', 'कटान'] },
  { type: 'landslide', keywords: ['landslide', 'mudslide', 'rockfall', 'debris flow', 'avalanche', 'पहिरो', 'हिमपहिरो'] },
  { type: 'fire', keywords: ['wildfire', 'forest fire', 'bushfire', 'blaze', 'burning', 'आगलागी', 'डढेलो'] },
  { type: 'weather', keywords: ['monsoon', 'rainfall', 'heavy rain', 'downpour', 'cloudburst', 'storm', 'hailstorm', 'thunderstorm', 'lightning', 'cold wave', 'heat wave', 'snowfall', 'drought', 'वर्षा', 'मनसुन', 'असिना', 'चट्याङ', 'शीतलहर', 'खडेरी'] },
  { type: 'cryosphere', keywords: ['glacier', 'glacial lake', 'glof', 'snowmelt', 'icimod', 'हिमताल', 'हिमनदी'] },
  { type: 'airquality', keywords: ['air quality', 'aqi', 'air pollution', 'pm2.5', 'smog', 'haze', 'प्रदूषण', 'धुवाँ'] },
  { type: 'response', keywords: ['rescue', 'relief', 'evacuat', 'displaced', 'shelter', 'ndrrma', 'red cross', 'उद्धार', 'राहत', 'विस्थापित'] },
];

// Weighted toward realised impact — casualties and displacement — rather than
// toward forecasts, which are the ordinary state of a hazard feed.
const NML_HIGH_SEVERITY_TERMS = ['dead', 'death', 'killed', 'fatal', 'casualt', 'missing', 'injured', 'buried', 'swept away', 'collapse', 'destroyed', 'displaced', 'emergency', 'disaster', 'मृत्यु', 'बेपत्ता', 'घाइते', 'पुरिए', 'विपद्'];
const NML_ELEVATED_TERMS = ['warning', 'alert', 'evacuat', 'rescue', 'risk', 'threat', 'damage', 'stranded', 'blocked', 'closure', 'सतर्कता', 'चेतावनी', 'उद्धार', 'क्षति', 'अवरुद्ध'];
const NML_SEVERITY_COLORS = {
  high: { fill: '#ff4d5c', ring: 'rgba(255,77,92,0.22)' },
  elevated: { fill: '#ffb020', ring: 'rgba(255,176,32,0.2)' },
  monitoring: { fill: '#d8dc3b', ring: 'rgba(216,220,59,0.18)' },
};
const NML_TYPE_LABEL: Record<string, string> = { seismic: 'Seismic', flood: 'Flood', landslide: 'Landslide', fire: 'Wildfire', weather: 'Weather', cryosphere: 'Glacier', airquality: 'Air Quality', response: 'Response', hazard: 'Hazard' };

// --- Helpers ---
function nmlClamp(v: number, mn: number, mx: number) { return Math.max(mn, Math.min(mx, v)); }
function nmlNormText(v: string) { return v.toLowerCase(); }
function nmlExtractUrlPathText(v: string) { try { const u = new URL(v); return decodeURIComponent(u.pathname).replace(/[/_-]+/g, ' '); } catch { return v; } }
function nmlNormLoc(v: string) { return ` ${v.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').replace(/\s+/g, ' ').trim()} `; }
function nmlHash(v: string) { let h = 0; for (let i = 0; i < v.length; i++) { h = ((h << 5) - h + v.charCodeAt(i)) | 0; } return Math.abs(h); }
function nmlJitter(seed: string, amp: number) { const h = nmlHash(seed); return ((h % 10000) / 10000 * 2 - 1) * amp; }
function nmlEscRegex(v: string) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function nmlCompileAliasRegex(alias: string) {
  const n = nmlNormLoc(alias).trim();
  const tok = n.split(/\s+/).map(nmlEscRegex).join('\\s+');
  return new RegExp(`(?:^|\\s)${tok}(?=\\s|$)`, 'u');
}

function nmlBuildAliasRules(aliasesByProv: Record<number, string[]>, weight: number): AliasRule[] {
  const rules: AliasRule[] = [];
  for (const [codeStr, aliases] of Object.entries(aliasesByProv)) {
    const code = Number(codeStr);
    if (!Number.isFinite(code) || !Array.isArray(aliases)) continue;
    for (const alias of aliases) {
      const t = alias.trim(); if (!t) continue;
      rules.push({ provinceCode: code, weight, regex: nmlCompileAliasRegex(t) });
    }
  }
  return rules;
}

const NML_DISTRICT_RULES = nmlBuildAliasRules(NML_DISTRICT_ALIASES_BY_PROVINCE, 4);
const NML_PROVINCE_RULES = nmlBuildAliasRules(NML_PROVINCE_ALIASES, 2);

function nmlExtractPolygons(geometry: Geometry | undefined): Polygon[] {
  if (!geometry?.type) return [];
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) return geometry.coordinates;
  return [];
}

/** Boundary files vary in their property names, so read them defensively. */
interface BoundaryProps {
  PROVINCE?: number | string;
  PR_NAME?: string;
  NAME?: string;
}

function nmlGeoJsonToFeatures(
  geoJson: GeoCollection<BoundaryProps> | null,
  mode: 'province' | 'district',
): MapFeature[] {
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
  return features
    .map((entry, idx): MapFeature => {
      const props = entry.properties ?? {};
      const provCodeRaw = Number(props.PROVINCE);
      const provCode = Number.isFinite(provCodeRaw) && provCodeRaw > 0 ? provCodeRaw : idx + 1;
      const defName = mode === 'province' ? `Province ${provCode}` : `District ${idx + 1}`;
      const name = String(props.PR_NAME || props.NAME || defName);
      return { id: idx + 1, name, provinceCode: provCode, polygons: nmlExtractPolygons(entry.geometry) };
    })
    .filter(e => e.polygons.length > 0);
}

function nmlComputeBounds(features: MapFeature[]): MapBounds {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of features) for (const poly of f.polygons) for (const ring of poly) for (const pt of ring) {
    const [lon, lat] = pt;
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return { minLon: 80, maxLon: 89, minLat: 26.2, maxLat: 30.4 };
  return { minLon, maxLon, minLat, maxLat };
}

function nmlProjectPoint(pt: [number, number], bounds: MapBounds, width: number, height: number, pad = 12): [number, number] {
  const spanLon = Math.max(bounds.maxLon - bounds.minLon, 0.001);
  const spanLat = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const scale = Math.min((width - pad * 2) / spanLon, (height - pad * 2) / spanLat);
  const mapW = spanLon * scale, mapH = spanLat * scale;
  const xOff = (width - mapW) / 2 - bounds.minLon * scale;
  const yOff = (height - mapH) / 2 + bounds.maxLat * scale;
  const [lon, lat] = pt;
  return [lon * scale + xOff, yOff - lat * scale];
}

function nmlGetProvinceCode(f: MapFeature): number { return (f.provinceCode >= 1 && f.provinceCode <= 7) ? f.provinceCode : nmlClamp(f.id, 1, 7); }

function nmlInferProvinceCode(text: string): number | null {
  const norm = nmlNormLoc(text);
  const scoreByProv = new Map<number, number>();
  const firstHit = new Map<number, number>();
  const applyRules = (rules: AliasRule[]) => {
    for (const rule of rules) {
      const m = rule.regex.exec(norm);
      if (!m) continue;
      scoreByProv.set(rule.provinceCode, (scoreByProv.get(rule.provinceCode) || 0) + rule.weight);
      const cur = firstHit.get(rule.provinceCode);
      if (cur == null || m.index < cur) firstHit.set(rule.provinceCode, m.index);
    }
  };
  applyRules(NML_DISTRICT_RULES);
  applyRules(NML_PROVINCE_RULES);
  if (scoreByProv.size === 0) return null;
  let best = null, bestScore = -1, bestFirst = Infinity;
  for (const [code, score] of scoreByProv.entries()) {
    const fh = firstHit.get(code) ?? Infinity;
    if (score > bestScore || (score === bestScore && fh < bestFirst) || (score === bestScore && fh === bestFirst && (best == null || code < best))) {
      best = code; bestScore = score; bestFirst = fh;
    }
  }
  return best;
}

function nmlClassifyType(text: string) {
  for (const rule of NML_SIGNAL_TYPE_RULES) {
    if (rule.keywords.some(k => text.includes(k))) return rule.type;
  }
  // Everything reaching the map has already passed the hazard filter in
  // lib/synthesize.mjs, so an unmatched headline is still a hazard story.
  return 'hazard';
}

function nmlClassifySeverity(text: string, pubDate: Date) {
  let score = 1;
  if (NML_HIGH_SEVERITY_TERMS.some(k => text.includes(k))) score += 3;
  if (NML_ELEVATED_TERMS.some(k => text.includes(k))) score += 1;
  const ageH = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
  if (ageH <= 6) score += 1;
  if (score >= 4) return 'high';
  if (score >= 2) return 'elevated';
  return 'monitoring';
}

function nmlFormatAgo(date: Date) {
  const m = Math.round((Date.now() - date.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

interface MapHit {
  id: string;
  type: 'province' | 'river' | 'rain' | 'alert' | 'incident' | 'earthquake' | 'news';
  title: string;
  subtitle: string;
  details: string[];
  x: number;
  y: number;
  radius: number;
  link?: string;
  raw?: unknown;
}

interface NepalSignalsMapProps {
  stories: MapStory[];
  bipadData?: BipadPayload | null;
}

export default function NepalSignalsMap({ stories, bipadData }: NepalSignalsMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GeoJSON data
  const [geoData, setGeoData] = useState<{ provinces: MapFeature[]; districts: MapFeature[]; bounds: MapBounds } | null>(null);

  // Map Controls State
  const [showDistricts, setShowDistricts] = useState(true);
  const [showSignals, setShowSignals] = useState(true); // News Feed
  const [showRiver, setShowRiver] = useState(true);
  const [showRain, setShowRain] = useState(false); // Off by default to avoid crowding
  const [showAlerts, setShowAlerts] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showEarthquakes, setShowEarthquakes] = useState(true);

  const [selectedBipadItem, setSelectedBipadItem] = useState<MapHit | null>(null);
  const [hoveredItem, setHoveredItem] = useState<MapHit | null>(null);
  const [hoveredPos, setHoveredPos] = useState<{ x: number; y: number } | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Navigation state (pan/zoom)
  const zoomRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const mapHitsRef = useRef<MapHit[]>([]);

  // Processed signals
  const [signals, setSignals] = useState<MapSignal[]>([]);
  const [provinceScores, setProvinceScores] = useState<Map<number, number>>(new Map());

  // Load GeoJSON once
  useEffect(() => {
    async function loadData() {
      try {
        const [provRes, distRes] = await Promise.all([
          fetch('/data/nepal-provinces.geojson').then(r => r.json()),
          fetch('/data/nepal-districts.geojson').then(r => r.json()),
        ]);

        const provs = nmlGeoJsonToFeatures(provRes, 'province').map(f => {
          const code = nmlGetProvinceCode(f);
          return { ...f, provinceCode: code, name: NML_PROVINCE_NAME[code] || f.name };
        });
        const dists = nmlGeoJsonToFeatures(distRes, 'district');
        const bnds = nmlComputeBounds([...provs, ...dists]);

        setGeoData({ provinces: provs, districts: dists, bounds: bnds });
        setLoading(false);
      } catch (err) {
        setError(errorMessage(err) || 'Failed to load map data');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Update signals when stories change
  useEffect(() => {
    const mapped = stories.map(story => ({
      ...story,
      link: story.link || story.url || '',
      pubDate: story.pubDate
        ? new Date(story.pubDate)
        : story.date
        ? new Date(story.date)
        : new Date(),
    }));

    // Compute province scores
    const scores = new Map<number, number>();
    for (const story of mapped) {
      const lp = nmlExtractUrlPathText(story.link);
      const hay = nmlNormText(`${story.title} ${lp}`);
      const code = nmlProvinceFromCoords(story.lat, story.lon) ?? nmlInferProvinceCode(hay);
      if (!code) continue;
      scores.set(code, (scores.get(code) || 0) + 1);
    }
    setProvinceScores(scores);

    // Build signals list
    const dedupe = new Set<string>();
    const out: MapSignal[] = [];
    const sorted = [...mapped].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
    for (const item of sorted) {
      if (out.length >= 90) break;
      const key = `${item.link}::${item.title}`;
      if (dedupe.has(key)) continue; dedupe.add(key);
      const lp = nmlExtractUrlPathText(item.link);
      const text = nmlNormText(`${item.title} ${lp}`);
      const code = nmlProvinceFromCoords(item.lat, item.lon) ?? nmlInferProvinceCode(text);
      if (!code) continue;
      const center = NML_PROVINCE_CENTERS[code] || NML_PROVINCE_CENTERS[3];
      const lon = center[0] + nmlJitter(key, 0.22);
      const lat = center[1] + nmlJitter(`${key}:lat`, 0.17);
      out.push({
        id: key,
        title: item.title,
        link: item.link,
        source: item.source || '',
        pubDate: item.pubDate,
        provinceCode: code,
        provinceName: NML_PROVINCE_NAME[code] || 'Bagmati',
        lon,
        lat,
        type: nmlClassifyType(text),
        severity: nmlClassifySeverity(text, item.pubDate),
      });
    }
    setSignals(out);
  }, [stories]);

  // Handle canvas drawing on resize/nav state changes
  const draw = () => {
    if (!geoData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 320;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    mapHitsRef.current = [];

    // Projection helpers
    const project = (pt: [number, number]): [number, number] => {
      const [bx, by] = nmlProjectPoint(pt, geoData.bounds, width, height, 12);
      const cx = width / 2, cy = height / 2;
      return [(bx - cx) * zoomRef.current + cx + panXRef.current, (by - cy) * zoomRef.current + cy + panYRef.current];
    };

    const strokeOnly = (f: MapFeature) => {
      ctx.beginPath();
      for (const poly of f.polygons) for (const ring of poly) {
        ring.forEach((pt: [number, number], i: number) => {
          const [x, y] = project(pt);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
      }
      ctx.stroke();
    };

    const fillStroke = (f: MapFeature) => {
      ctx.beginPath();
      for (const poly of f.polygons) for (const ring of poly) {
        ring.forEach((pt: [number, number], i: number) => {
          const [x, y] = project(pt);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
      }
      ctx.fill('evenodd'); ctx.stroke();
    };

    const getCentroid = (f: MapFeature): [number, number] | null => {
      let sx = 0, sy = 0, cnt = 0;
      for (const poly of f.polygons) {
        const r = poly[0]; if (!r || !r.length) continue;
        for (const pt of r) {
          const [x, y] = project(pt); sx += x; sy += y; cnt++;
        }
      }
      return cnt === 0 ? null : [sx / cnt, sy / cnt];
    };

    const lightTheme = !document.body.classList.contains('dark-theme');

    // Draw background
    ctx.fillStyle = lightTheme ? '#edf3f1' : '#08111a';
    ctx.fillRect(0, 0, width, height);

    // Draw district boundaries
    if (showDistricts) {
      ctx.strokeStyle = lightTheme ? 'rgba(73,103,96,0.28)' : 'rgba(75,95,120,0.26)'; ctx.lineWidth = 0.8;
      for (const d of geoData.districts) strokeOnly(d);
    }

    // Draw provinces
    for (const prov of geoData.provinces) {
      const code = nmlGetProvinceCode(prov);
      const score = provinceScores.get(code) || 0;
      const alpha = nmlClamp(0.14 + score * 0.06, 0.14, 0.62);
      ctx.fillStyle = score > 0
        ? (lightTheme ? `rgba(43,139,157,${Math.min(0.38, alpha).toFixed(3)})` : `rgba(47,167,227,${alpha.toFixed(3)})`)
        : (lightTheme ? 'rgba(205,220,216,0.9)' : 'rgba(21,32,45,0.86)');
      ctx.strokeStyle = lightTheme ? 'rgba(70,104,98,0.72)' : 'rgba(145,167,196,0.68)'; ctx.lineWidth = 1.35;
      fillStroke(prov);
    }

    // Draw rain stations
    if (showRain && bipadData?.rainStations) {
      for (const station of bipadData.rainStations) {
        const coords = station.point?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [x, y] = project([coords[0], coords[1]]);
        
        const avg24 = station.averages?.find((a: BipadRainAverage) => a.interval === 24)?.value;
        const avg3 = station.averages?.find((a: BipadRainAverage) => a.interval === 3)?.value;
        const avg1 = station.averages?.find((a: BipadRainAverage) => a.interval === 1)?.value;
        
        let color = '#5856d6';
        let outline = 'rgba(88, 86, 214, 0.2)';
        if (avg24 != null) {
          if (avg24 >= 100) {
            color = '#ff3b30';
            outline = 'rgba(255, 59, 48, 0.3)';
          } else if (avg24 >= 50) {
            color = '#ffb020';
            outline = 'rgba(255, 176, 32, 0.3)';
          }
        }
        
        const r = 4.0;
        ctx.beginPath(); ctx.fillStyle = outline; ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        const details = [
          `24h Precipitation: ${avg24 != null ? avg24 + ' mm' : '0.0 mm'}`,
          `3h Precipitation: ${avg3 != null ? avg3 + ' mm' : '0.0 mm'}`,
          `1h Precipitation: ${avg1 != null ? avg1 + ' mm' : '0.0 mm'}`,
          `Status: ${station.status || 'BELOW WARNING LEVEL'}`,
          `Measured on: ${station.measuredOn ? new Date(station.measuredOn).toLocaleString() : 'N/A'}`
        ];

        mapHitsRef.current.push({
          id: `rain-${station.id}`,
          type: 'rain',
          title: station.title || 'Precipitation Telemetry',
          subtitle: 'Rainfall Telemetry Station',
          details,
          x,
          y,
          radius: r + 5,
          raw: station
        });
      }
    }

    // Draw river stations
    if (showRiver && bipadData?.riverStations) {
      for (const station of bipadData.riverStations) {
        const coords = station.point?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [x, y] = project([coords[0], coords[1]]);
        
        const wl = station.waterLevel;
        const warn = station.warningLevel;
        const danger = station.dangerLevel;
        
        let color = '#2096f3';
        let outline = 'rgba(32, 150, 243, 0.2)';
        let statusStr = 'Normal';
        if (wl != null) {
          if (danger != null && wl >= danger) {
            color = '#ff3b30';
            outline = 'rgba(255, 59, 48, 0.3)';
            statusStr = 'ABOVE DANGER LEVEL';
          } else if (warn != null && wl >= warn) {
            color = '#ff9500';
            outline = 'rgba(255, 149, 0, 0.3)';
            statusStr = 'ABOVE WARNING LEVEL';
          }
        }
        
        const r = 4.5;
        ctx.beginPath(); ctx.fillStyle = outline; ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        const details = [
          `Current level: ${wl != null ? wl + ' m' : 'N/A'}`,
          `Warning level: ${warn != null ? warn + ' m' : 'N/A'}`,
          `Danger level: ${danger != null ? danger + ' m' : 'N/A'}`,
          `Status: ${statusStr}`,
          `Last measured: ${station.waterLevelOn ? new Date(station.waterLevelOn).toLocaleString() : 'N/A'}`
        ];

        mapHitsRef.current.push({
          id: `river-${station.id}`,
          type: 'river',
          title: station.title || 'Hydrological Station',
          subtitle: `River Gauge • ${station.steady || 'steady'}`,
          details,
          x,
          y,
          radius: r + 5,
          raw: station
        });
      }
    }

    // Draw incidents
    if (showIncidents && bipadData?.incidents) {
      for (const incident of bipadData.incidents) {
        const coords = incident.point?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [x, y] = project([coords[0], coords[1]]);
        
        let color = '#ff9500';
        let typeStr = 'Incident';
        if (incident.hazard === 10) { color = '#ff3b30'; typeStr = 'Fire'; }
        else if (incident.hazard === 11) { color = '#007af5'; typeStr = 'Flood'; }
        else if (incident.hazard === 17) { color = '#a25f25'; typeStr = 'Landslide'; }
        else if (incident.hazard === 12) { color = '#34c759'; typeStr = 'Heavy Rain'; }
        else if (incident.hazard === 23) { color = '#af52de'; typeStr = 'Thunderbolt'; }

        const outline = `rgba(${color === '#ff3b30' ? '255, 59, 48' : color === '#007af5' ? '0, 122, 245' : '162, 95, 37'}, 0.25)`;
        const r = 4.0;

        ctx.beginPath(); ctx.fillStyle = outline; ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        const details = [
          `Type: ${typeStr}`,
          `Address: ${incident.streetAddress || 'N/A'}`,
          `Incident Date: ${incident.incidentOn ? new Date(incident.incidentOn).toLocaleString() : 'N/A'}`,
          `Deaths: ${incident.loss?.deaths ?? 0} • Missing: ${incident.loss?.missing ?? 0}`,
          `Injured: ${incident.loss?.injured ?? 0} • Families Affected: ${incident.loss?.familiesAffected ?? 0}`
        ];

        mapHitsRef.current.push({
          id: `incident-${incident.id}`,
          type: 'incident',
          title: incident.title || incident.titleNe || 'Disaster Incident',
          subtitle: `Disaster Event • ${typeStr}`,
          details,
          x,
          y,
          radius: r + 5,
          raw: incident
        });
      }
    }

    // Draw alerts
    if (showAlerts && bipadData?.alerts) {
      for (const alert of bipadData.alerts) {
        const coords = alert.point?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [x, y] = project([coords[0], coords[1]]);
        
        const color = '#ff2d55';
        const outline = 'rgba(255, 45, 85, 0.25)';
        const r = 5.5;

        ctx.beginPath(); ctx.fillStyle = outline; ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', x, y);

        const details = [
          `Alert details: ${alert.description || 'No description available'}`,
          `Source: ${alert.source || 'DHM'}`,
          `Active Since: ${alert.startedOn ? new Date(alert.startedOn).toLocaleString() : 'N/A'}`,
          `Expires on: ${alert.expireOn ? new Date(alert.expireOn).toLocaleString() : 'Active Alert'}`
        ];

        mapHitsRef.current.push({
          id: `alert-${alert.id}`,
          type: 'alert',
          title: alert.title || alert.titleNe || 'Early Warning Alert',
          subtitle: `Early Warning • ${alert.source || 'DHM'}`,
          details,
          x,
          y,
          radius: r + 6,
          raw: alert
        });
      }
    }

    // Draw earthquakes
    if (showEarthquakes && bipadData?.earthquakes) {
      for (const eq of bipadData.earthquakes) {
        const coords = eq.point?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [x, y] = project([coords[0], coords[1]]);
        
        const mag = eq.magnitude || 4.0;
        const r = Math.max(3, mag * 1.5);
        const color = '#e85c13';

        ctx.beginPath(); ctx.strokeStyle = 'rgba(232, 92, 19, 0.18)'; ctx.lineWidth = 1.5; ctx.arc(x, y, r * 2.8, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.fillStyle = 'rgba(232, 92, 19, 0.1)'; ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = color; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        const details = [
          `Magnitude: M ${mag}`,
          `Epicenter: ${eq.address || 'N/A'}`,
          `Depth: ${eq.depth ? eq.depth + ' km' : 'N/A'}`,
          `Time: ${eq.eventOn ? new Date(eq.eventOn).toLocaleString() : 'N/A'}`
        ];

        mapHitsRef.current.push({
          id: `eq-${eq.id}`,
          type: 'earthquake',
          title: `M ${mag} Earthquake`,
          subtitle: `Seismic Activity`,
          details,
          x,
          y,
          radius: r * 2,
          raw: eq
        });
      }
    }

    // Draw signals (News Feed)
    if (showSignals) {
      for (const sig of signals) {
        const [x, y] = project([sig.lon, sig.lat]);
        const pal = NML_SEVERITY_COLORS[sig.severity as 'high' | 'elevated' | 'monitoring'];
        const r = sig.severity === 'high' ? 4.8 : sig.severity === 'elevated' ? 4.1 : 3.3;
        ctx.beginPath(); ctx.fillStyle = pal.ring; ctx.arc(x, y, r + 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = pal.fill; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.strokeStyle = lightTheme ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.6; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

        const details = [
          `Severity: ${sig.severity.toUpperCase()}`,
          `Type: ${NML_TYPE_LABEL[sig.type] || sig.type}`,
          `Region: ${sig.provinceName}`,
          `Published: ${nmlFormatAgo(sig.pubDate)}`
        ];

        mapHitsRef.current.push({
          id: `sig-${sig.id}`,
          type: 'news',
          title: sig.title,
          subtitle: `News • ${sig.source}`,
          details,
          x,
          y,
          radius: r + 5,
          link: sig.link,
          raw: sig
        });
      }
    }

    // Draw province names
    for (const prov of geoData.provinces) {
      const c = getCentroid(prov);
      if (!c) continue;
      ctx.fillStyle = lightTheme ? 'rgba(35,65,60,0.88)' : 'rgba(230,238,250,0.88)'; ctx.font = '10px "Geist Pixel"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(prov.name, c[0], c[1]);
    }
  };

  // Re-draw when dependencies change
  useEffect(() => {
    draw();
  }, [
    geoData,
    signals,
    showDistricts,
    showSignals,
    showRiver,
    showRain,
    showAlerts,
    showIncidents,
    showEarthquakes,
    selectedBipadItem,
    expanded,
    bipadData
  ]);

  useEffect(() => {
    const observer = new MutationObserver(() => draw());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [
    geoData,
    signals,
    showDistricts,
    showSignals,
    showRiver,
    showRain,
    showAlerts,
    showIncidents,
    showEarthquakes,
    selectedBipadItem,
    expanded,
    bipadData
  ]);

  // Wheel and drag interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let pointerActive = false;
    let pointerId: number | null = null;
    let pointerMovedDist = 0;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const prevZ = zoomRef.current;
      zoomRef.current = nmlClamp(zoomRef.current * (e.deltaY < 0 ? 1.14 : 0.88), 1, 8);
      if (zoomRef.current === prevZ) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
      const cx = cssW / 2, cy = cssH / 2;
      const bx = (sx - cx - panXRef.current) / prevZ + cx, by = (sy - cy - panYRef.current) / prevZ + cy;

      panXRef.current = sx - ((bx - cx) * zoomRef.current + cx);
      panYRef.current = sy - ((by - cy) * zoomRef.current + cy);

      // Clamp pan bounds
      if (zoomRef.current <= 1) {
        panXRef.current = 0;
        panYRef.current = 0;
      } else {
        const mx = ((cssW * zoomRef.current) - cssW) / 2 + 60, my = ((cssH * zoomRef.current) - cssH) / 2 + 60;
        panXRef.current = nmlClamp(panXRef.current, -mx, mx);
        panYRef.current = nmlClamp(panYRef.current, -my, my);
      }
      draw();
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerActive = true; pointerId = e.pointerId; pointerMovedDist = 0; isDragging = false;
      dragStartX = e.clientX; dragStartY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = zoomRef.current > 1 ? 'grabbing' : 'default';
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;

      // Find hover hit
      let hit: MapHit | null = null;
      for (const h of mapHitsRef.current) {
        const dx = x - h.x, dy = y - h.y;
        if (Math.sqrt(dx * dx + dy * dy) <= h.radius) { hit = h; break; }
      }

      setHoveredItem(hit);
      if (hit) {
        setHoveredPos({ x: x + 12, y: y + 12 });
      } else {
        setHoveredPos(null);
      }

      if (pointerActive && pointerId === e.pointerId) {
        const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
        dragStartX = e.clientX; dragStartY = e.clientY;
        pointerMovedDist += Math.sqrt(dx * dx + dy * dy);

        if (zoomRef.current > 1 && pointerMovedDist >= 2) {
          isDragging = true;
          panXRef.current += dx;
          panYRef.current += dy;

          // Clamp
          const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
          const mx = ((cssW * zoomRef.current) - cssW) / 2 + 60, my = ((cssH * zoomRef.current) - cssH) / 2 + 60;
          panXRef.current = nmlClamp(panXRef.current, -mx, mx);
          panYRef.current = nmlClamp(panYRef.current, -my, my);

          draw();
          canvas.style.cursor = 'grabbing';
          return;
        }
      }
      canvas.style.cursor = hit ? 'pointer' : (zoomRef.current > 1 ? 'grab' : 'default');
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!pointerActive) { canvas.style.cursor = zoomRef.current > 1 ? 'grab' : 'default'; return; }
      const pid = pointerId;
      pointerActive = false; pointerId = null;
      if (pid != null && canvas.hasPointerCapture(pid)) canvas.releasePointerCapture(pid);

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const moved = pointerMovedDist, wasDrag = isDragging;
      pointerMovedDist = 0; isDragging = false;

      if (!wasDrag && moved < 6) {
        let hit: MapHit | null = null;
        for (const h of mapHitsRef.current) {
          const dx = x - h.x, dy = y - h.y;
          if (Math.sqrt(dx * dx + dy * dy) <= h.radius) { hit = h; break; }
        }
        if (hit) {
          setSelectedBipadItem(prev => prev?.id === hit!.id ? null : hit);
        } else {
          setSelectedBipadItem(null);
        }
      }
      canvas.style.cursor = zoomRef.current > 1 ? 'grab' : 'default';
    };

    const handleResize = () => {
      draw();
    };

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('resize', handleResize);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
    };
  }, [geoData, signals, bipadData, showRiver, showRain, showAlerts, showIncidents, showEarthquakes]);

  const handleZoomReset = () => {
    zoomRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    draw();
  };

  if (loading) {
    return (
      <LoadingUI
        variant="map"
        active
        message="Loading Nepal map…"
        hint="Drawing boundaries and connecting to BIPAD live telemetry."
      />
    );
  }
  if (error) return <div className="nml-empty">Failed to load Nepal map: {error}</div>;

  return (
    <div ref={containerRef} className={`nml-map-layout-container ${expanded ? 'nml-map-expanded' : ''}`}>
      <div className="nml-map-toolbar">
        <button className="nml-map-toggle" onClick={() => setShowDistricts(prev => !prev)}>
          Districts: {showDistricts ? 'On' : 'Off'}
        </button>
        <button className={`nml-map-toggle ${showSignals ? 'active' : ''}`} onClick={() => setShowSignals(prev => !prev)}>
          News Feed
        </button>
        <button className={`nml-map-toggle ${showRiver ? 'active' : ''}`} onClick={() => setShowRiver(prev => !prev)}>
          River Levels
        </button>
        <button className={`nml-map-toggle ${showRain ? 'active' : ''}`} onClick={() => setShowRain(prev => !prev)}>
          Rain Gauges
        </button>
        <button className={`nml-map-toggle ${showAlerts ? 'active' : ''}`} onClick={() => setShowAlerts(prev => !prev)}>
          Warnings
        </button>
        <button className={`nml-map-toggle ${showIncidents ? 'active' : ''}`} onClick={() => setShowIncidents(prev => !prev)}>
          Incidents
        </button>
        <button className={`nml-map-toggle ${showEarthquakes ? 'active' : ''}`} onClick={() => setShowEarthquakes(prev => !prev)}>
          Earthquakes
        </button>
        <button className="nml-map-toggle" onClick={handleZoomReset}>
          Reset Pan
        </button>
        <button className="nml-map-toggle" onClick={() => setExpanded(prev => !prev)}>
          {expanded ? 'Collapse Map' : 'Full Screen'}
        </button>
        <div className="nml-map-caption">
          {bipadData ? 'BIPAD Connected' : 'Loading Telemetry...'}
        </div>
      </div>
      <div className="nml-map-layout">
        <div className="nml-map-wrap">
          <canvas ref={canvasRef} className="nml-map-canvas" aria-label="Nepal signals map"></canvas>

          {/* Floating interactive tooltip card */}
          {hoveredItem && hoveredPos && (
            <div
              className="nml-map-tooltip"
              style={{
                position: 'absolute',
                left: hoveredPos.x,
                top: hoveredPos.y,
                transform: 'translate(5px, 5px)',
                zIndex: 1000,
                pointerEvents: 'none'
              }}
            >
              <div className="nml-tooltip-subtitle">{hoveredItem.subtitle}</div>
              <div className="nml-tooltip-title">{hoveredItem.title}</div>
              <div className="nml-tooltip-divider" />
              <div className="nml-tooltip-rows">
                {hoveredItem.details.map((d, i) => (
                  <div key={i} className="nml-tooltip-row">{d}</div>
                ))}
              </div>
            </div>
          )}

          {/* Detail feed/selection overlay */}
          {selectedBipadItem !== null && (
            <div className="nml-map-overlay">
              <div className="nml-map-feed-header">
                <div className="nml-market-subtitle">
                  {selectedBipadItem.subtitle}
                </div>
                <button className="nml-map-toggle" onClick={() => setSelectedBipadItem(null)}>
                  Clear
                </button>
              </div>
              <div className="nml-map-feed-list">
                <div className="nml-bipad-detail-card">
                  <h4 className="nml-bipad-detail-title">{selectedBipadItem.title}</h4>
                  <div className="nml-bipad-detail-rows">
                    {selectedBipadItem.details.map((d, i) => (
                      <div key={i} className="nml-bipad-detail-row">
                        {d}
                      </div>
                    ))}
                  </div>
                  {selectedBipadItem.link && (
                    <a href={selectedBipadItem.link} target="_blank" rel="noopener noreferrer" className="nml-bipad-detail-link">
                      View source url ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="nml-map-helper">
          Hover over markers to view metadata. Click a circle to open detail panel.
        </div>
        <div className="nml-map-legend">
          <span><i className="legend-news"></i>News Signal</span>
          <span><i className="legend-river"></i>River Level</span>
          <span><i className="legend-rain"></i>Rain Telemetry</span>
          <span><i className="legend-warning"></i>DHM Warning</span>
          <span><i className="legend-incident"></i>Disaster Event</span>
          <span><i className="legend-eq"></i>Earthquake</span>
        </div>
      </div>
    </div>
  );
}

