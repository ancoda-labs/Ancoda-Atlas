'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AffectedDistrictProps, FloodGauge, GeoCollection, Geometry, PhotoGeoSource } from '@/types';
import { orientationTransform } from '@/lib/photo-orientation';
import { clusterByPlace, spiderLayout, type OverlayLayer } from '@/lib/spiderfy';

// The flood corridor map.
//
// Canvas rather than SVG or a tile map: seven district polygons at full
// coordinate precision is ~5,700 points, which is a lot of DOM nodes for
// something that never animates, and the page carries no basemap dependency it
// would have to survive an outage of. Equirectangular projection, scaled to the
// district bbox — over two degrees of Nepal the distortion is not visible.
//
// Press photographs, DHM station photos and ground reports land on the same
// few districts. Press stacks sit on the district the headline names; DHM
// thumbnails stay on the station. Tap a stack to spiderfy it inside the map.
//
// The map draws four things, and the distinction between the first two is the
// one that matters most:
//
//   Confirmed path — solid. The water is known to have reached these places.
//   Estimated reach — dashed, in a different colour, labelled as an estimate.
//   DHM gauges — live, each coloured against its own danger mark.
//   Photographs — press lead images and public ground reports.

export interface MapPhoto {
  id: string;
  lat: number;
  lon: number;
  geoSource: PhotoGeoSource;
  label: string;
  /** When set, the pin is the photograph itself rather than a coloured dot. */
  url?: string;
  orientation?: number;
  /** Ground reports, press photographs, or a DHM station photo. */
  layer?: OverlayLayer;
  /** Press items open the outlet's page; ground reports open the map dialog. */
  href?: string;
  /** Overrides the default hover subtitle. */
  sub?: string;
  /** District or station name, used to keep thumbnails on that place. */
  place?: string;
}

export interface MapPathPoint {
  id: string;
  name_en: string;
  name_ne: string;
  lat: number;
  lng: number;
  /** 'entry' | 'confirmed' | 'estimated'. Anything else is treated as confirmed. */
  status: string;
}

/** What the reader clicked. The parent decides what to show for it. */
export type MapSelection =
  | { kind: 'point'; id: string }
  | { kind: 'gauge'; id: number }
  | { kind: 'photo'; id: string };

interface Props {
  points?: MapPathPoint[];
  photos?: MapPhoto[];
  gauges?: FloodGauge[];
  onSelect?: (selection: MapSelection) => void;
  /** Kept for the ground-reports page, which only cares about photographs. */
  onPhotoSelect?: (id: string) => void;
  lang: 'en' | 'ne';
  /** English district names to emphasise. Used by the /sandbox/ask map coupling. */
  highlightDistricts?: string[];
}

const SEVERE = '#ff4d5c';
const AFFECTED = '#ffb020';
const CONFIRMED = '#ff4d5c';
const ESTIMATED = '#ffb020';
const PHOTO = '#7ce0b4';
const NEWS = '#6ec8ff';
const GAUGE_SHOT = '#ffd27a';
const ENTRY = '#6ec8ff';

const MIN_ZOOM = 1;
const MAX_ZOOM = 7;

const GAUGE_COLOUR: Record<string, string> = {
  danger: '#ff4d5c',
  warning: '#ffb020',
  normal: '#45c97c',
  unknown: '#7b8794',
};

function ringsOf(geometry: Geometry): Array<Array<[number, number]>> {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

/** Points whose reach is projected rather than observed. */
function isEstimated(status: string): boolean {
  return status === 'estimated' || status === 'at-risk' || status === 'at_risk';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Nudge a marker off any already-placed marker it would sit on top of.
 *
 * Several of these points are genuinely within a few kilometres of each other —
 * Devghat and Narayanghat are about three, and Betrawati and Syaphrubesi each
 * carry two gauges — which at this scale is a couple of pixels. Drawn honestly
 * they merge into one blob, and a reader cannot tell two stations from one.
 *
 * The displacement is a tight outward spiral, capped, and it moves the hit
 * target with the drawn marker so clicking still selects what you see. It is a
 * legibility device, not a change to the data: nothing moves more than a few
 * pixels, and only when it would otherwise be hidden.
 */
function deOverlap(
  x: number,
  y: number,
  placed: Array<{ x: number; y: number }>,
  minGap: number,
): { x: number; y: number } {
  const collides = (px: number, py: number) =>
    placed.some(p => Math.hypot(p.x - px, p.y - py) < minGap);
  if (!collides(x, y)) return { x, y };

  for (let step = 1; step <= 12; step++) {
    const angle = step * 2.4;
    const radius = minGap * (0.8 + step * 0.22);
    const nx = x + Math.cos(angle) * radius;
    const ny = y + Math.sin(angle) * radius;
    if (!collides(nx, ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

interface View {
  zoom: number;
  panX: number;
  panY: number;
}

function clampView(view: View, w: number, h: number): View {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const maxX = ((zoom - 1) * w) / 2 + 24;
  const maxY = ((zoom - 1) * h) / 2 + 24;
  return {
    zoom,
    panX: clamp(view.panX, -maxX, maxX),
    panY: clamp(view.panY, -maxY, maxY),
  };
}

interface Hover {
  title: string;
  sub: string;
  x: number;
  y: number;
}

interface Hit {
  selection: MapSelection;
  title: string;
  sub: string;
  x: number;
  y: number;
  r: number;
}

interface OverlayPin {
  id: string;
  x: number;
  y: number;
  url?: string;
  orientation?: number;
  layer: OverlayLayer;
  href?: string;
  title: string;
  sub: string;
  approximate: boolean;
  /** District or station name — press stacks sit here, the list groups here. */
  place?: string;
  /** When set, the pin opens the gauge dialog rather than a photograph. */
  gaugeId?: number;
}

interface OverlayStack {
  id: string;
  x: number;
  y: number;
  items: OverlayPin[];
}

function groupPinsByPlace(pins: OverlayPin[]): Array<{ place: string; items: OverlayPin[] }> {
  const groups = new Map<string, OverlayPin[]>();
  const north = [...pins].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const pin of north) {
    const key = pin.place || '';
    const g = groups.get(key);
    if (g) g.push(pin);
    else groups.set(key, [pin]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1][0].y - b[1][0].y)
    .map(([place, items]) => ({ place, items }));
}

function stacksEqual(a: OverlayStack[], b: OverlayStack[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.x !== right.x
      || left.y !== right.y
      || left.items.length !== right.items.length
    ) {
      return false;
    }
  }
  return true;
}

export default function FloodDistrictMap({ points = [], photos = [], gauges = [], onSelect, onPhotoSelect, lang, highlightDistricts = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<GeoCollection<AffectedDistrictProps> | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [stacks, setStacks] = useState<OverlayStack[]>([]);
  const [openStack, setOpenStack] = useState<string | null>(null);
  const [focusLayer, setFocusLayer] = useState<OverlayLayer | null>(null);
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const viewRef = useRef<View>(view);
  const drawRef = useRef<() => void>(() => {});
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const pinchRef = useRef<{ d: number; zoom: number; panX: number; panY: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const districtHitRef = useRef<Array<{ name: string; status: string; path: Path2D }>>([]);
  const hitRef = useRef<Hit[]>([]);
  const skipClickRef = useRef(false);
  const stageSizeRef = useRef({ w: 1, h: 1 });

  useEffect(() => {
    let cancelled = false;
    fetch('/data/flood-affected-districts.json')
      .then(r => (r.ok ? r.json() : null))
      .then((d: GeoCollection<AffectedDistrictProps> | null) => {
        if (!cancelled) setGeo(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!openStack) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenStack(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openStack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !geo) return;
    const ne = lang === 'ne';
    const highlight = new Set(highlightDistricts.map(n => n.trim().toLowerCase()).filter(Boolean));

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = stage.clientWidth;
      const h = Math.max(340, Math.round(w * 0.72));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      stage.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const stretch = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      };
      for (const f of geo.features) {
        for (const ring of ringsOf(f.geometry)) for (const [x, y] of ring) stretch(x, y);
      }
      for (const p of points) stretch(p.lng, p.lat);
      for (const photo of photos) stretch(photo.lon, photo.lat);

      const pad = 20;
      const lonScale = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
      const spanX = (maxX - minX) * lonScale;
      const spanY = maxY - minY;
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
      const offX = (w - spanX * scale) / 2;
      const offY = (h - spanY * scale) / 2;
      const { zoom, panX, panY } = viewRef.current;
      const project = (lon: number, lat: number): [number, number] => {
        const bx = offX + (lon - minX) * lonScale * scale;
        const by = offY + (maxY - lat) * scale;
        return [bx * zoom + panX - ((zoom - 1) * w) / 2, by * zoom + panY - ((zoom - 1) * h) / 2];
      };

      const districtHits: Array<{ name: string; status: string; path: Path2D }> = [];
      for (const f of geo.features) {
        const named = `${f.properties.name_en || ''}`.toLowerCase();
        const lit = highlight.has(named);
        const severe = f.properties.status === 'severe' || lit;
        const path = new Path2D();
        for (const ring of ringsOf(f.geometry)) {
          ring.forEach(([lon, lat], i) => {
            const [x, y] = project(lon, lat);
            if (i === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
          });
          path.closePath();
        }
        ctx.fillStyle = severe ? 'rgba(255,77,92,0.30)' : 'rgba(255,176,32,0.20)';
        ctx.fill(path);
        ctx.strokeStyle = severe ? SEVERE : AFFECTED;
        ctx.lineWidth = (severe ? 1.6 : 1.1) * Math.min(zoom, 2.2);
        ctx.stroke(path);
        districtHits.push({
          name: ne ? f.properties.name_ne : f.properties.name_en,
          status: f.properties.status,
          path,
        });

        let cx = 0, cy = 0, n = 0;
        for (const ring of ringsOf(f.geometry)) {
          for (const [lon, lat] of ring) {
            const [x, y] = project(lon, lat);
            cx += x; cy += y; n++;
          }
        }
        if (n) {
          const label = ne ? f.properties.name_ne : f.properties.name_en;
          const lx = cx / n;
          const ly = cy / n;
          ctx.font = `${severe ? '700 ' : '600 '}${12 + Math.min(5, zoom)}px "Geist Pixel"`;
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(8,11,16,0.82)';
          ctx.strokeText(label, lx, ly);
          ctx.fillStyle = severe ? '#ffe8eb' : '#fff3d6';
          ctx.fillText(label, lx, ly);
        }
      }
      districtHitRef.current = districtHits;

      const hits: Hit[] = [];
      const placed: Array<{ x: number; y: number }> = [];

      if (points.length) {
        const firstEstimated = points.findIndex(p => isEstimated(p.status));
        const confirmed = firstEstimated === -1 ? points : points.slice(0, firstEstimated);
        const estimated = firstEstimated === -1 ? [] : points.slice(Math.max(0, firstEstimated - 1));

        const stroke = (list: MapPathPoint[], colour: string, dash: number[]) => {
          if (list.length < 2) return;
          ctx.beginPath();
          list.forEach((p, i) => {
            const [x, y] = project(p.lng, p.lat);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = colour;
          ctx.lineWidth = 3 * Math.min(zoom, 2);
          ctx.lineJoin = 'round';
          ctx.setLineDash(dash.map(d => d * Math.min(zoom, 2)));
          ctx.stroke();
          ctx.setLineDash([]);
        };
        stroke(confirmed, CONFIRMED, []);
        stroke(estimated, ESTIMATED, [8, 7]);

        points.forEach(p => {
          const [tx, ty] = project(p.lng, p.lat);
          const entry = p.status === 'entry';
          const est = isEstimated(p.status);
          const colour = entry ? ENTRY : est ? ESTIMATED : CONFIRMED;
          const r = (entry ? 7 : 5.5) * Math.min(1.35, 0.7 + zoom * 0.25);
          const { x, y } = deOverlap(tx, ty, placed, r * 2 + 3);
          placed.push({ x, y });
          if (Math.hypot(x - tx, y - ty) > 1) {
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(x, y);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = est ? '#0e141c' : colour;
          ctx.strokeStyle = colour;
          ctx.lineWidth = 2.4;
          if (est) ctx.setLineDash([3, 2]);
          ctx.fill();
          ctx.stroke();
          ctx.setLineDash([]);

          hits.push({
            selection: { kind: 'point', id: p.id },
            title: ne ? p.name_ne || p.name_en : p.name_en,
            sub: entry
              ? ne ? 'बाढी छिरेको बिन्दु' : 'Where the flood entered'
              : est
              ? ne ? 'अनुमानित प्रवाह — पुष्टि भएको होइन' : 'Estimated reach — not confirmed'
              : ne ? 'पानी पुगेको पुष्टि' : 'Water confirmed to have reached here',
            x, y, r: r + 5,
          });
        });
      }

      const nextOverlays: OverlayPin[] = [];
      for (const g of gauges) {
        if (g.lat == null || g.lon == null) continue;
        const [gtx, gty] = project(g.lon, g.lat);
        const colour = GAUGE_COLOUR[g.level] || GAUGE_COLOUR.unknown;
        const title = ne ? g.labelNe : g.label;
        const sub = g.stale
          ? ne ? 'हालको तथ्यांक छैन' : 'No current reading'
          : `${g.waterLevel != null ? `${g.waterLevel.toFixed(2)} m` : '—'} · ${ne ? 'डीएचएम मापन केन्द्र' : 'DHM gauge'}`;

        if (g.photo) {
          nextOverlays.push({
            id: `gauge:${g.id}`,
            x: gtx,
            y: gty,
            url: g.photo,
            layer: 'gauge',
            title,
            sub,
            approximate: false,
            place: ne ? g.districtNe : g.district,
            gaugeId: g.id,
          });
          continue;
        }

        const s = 5 * Math.min(1.35, 0.7 + zoom * 0.25);
        const { x, y } = deOverlap(gtx, gty, placed, s * 2 + 4);
        placed.push({ x, y });
        if (Math.hypot(x - gtx, y - gty) > 1) {
          ctx.beginPath();
          ctx.moveTo(gtx, gty);
          ctx.lineTo(x, y);
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.rect(x - s, y - s, s * 2, s * 2);
        ctx.fillStyle = g.stale ? '#0e141c' : colour;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        hits.push({
          selection: { kind: 'gauge', id: g.id },
          title,
          sub,
          x, y, r: s + 6,
        });
      }

      for (const photo of photos) {
        const [ptx, pty] = project(photo.lon, photo.lat);
        const layer: OverlayLayer = photo.layer === 'news' ? 'news' : photo.layer === 'gauge' ? 'gauge' : 'ground';
        const approximate = photo.geoSource === 'district' || layer === 'news';
        const hasImage = Boolean(photo.url);
        const sub = photo.sub
          || (layer === 'news'
            ? (ne ? 'समाचार — जिल्ला शीर्षकबाट' : 'Press — district from the headline')
            : layer === 'gauge'
            ? (ne ? 'डीएचएम मापन केन्द्र' : 'DHM gauge station')
            : approximate
              ? (ne ? 'जिल्ला अनुसार अनुमानित स्थान' : 'Approximate — district only')
              : (ne ? 'जनताको तस्बिर — खोल्न थिच्नुहोस्' : 'Ground report — click to open'));

        nextOverlays.push({
          id: photo.id,
          x: ptx,
          y: pty,
          url: hasImage ? photo.url : undefined,
          orientation: photo.orientation,
          layer,
          href: photo.href,
          title: photo.label,
          sub,
          approximate,
          place: photo.place,
        });
      }

      const coverFirst = (items: OverlayPin[]) =>
        [...items].sort((a, b) => Number(Boolean(b.url)) - Number(Boolean(a.url)));
      const stacks: OverlayStack[] = clusterByPlace(nextOverlays, viewRef.current.zoom < 1.8 ? 72 : 52).map(items => ({
        id: items.map(p => p.id).join('|'),
        x: items.reduce((s, p) => s + p.x, 0) / items.length,
        y: items.reduce((s, p) => s + p.y, 0) / items.length,
        items: coverFirst(items),
      }));
      for (const stack of stacks) {
        const many = stack.items.length > 1;
        const r = many ? 28 : 26;
        const { x, y } = deOverlap(stack.x, stack.y, placed, r + 8);
        stack.x = clamp(x, r + 8, w - r - 8);
        stack.y = clamp(y, r + 36, h - r - 8);
        placed.push({ x: stack.x, y: stack.y });
        const top = stack.items[0];
        if (stack.items.length === 1 && top.layer === 'ground') {
          hits.push({
            selection: { kind: 'photo', id: top.id },
            title: top.title,
            sub: top.sub,
            x: stack.x, y: stack.y, r: 22,
          });
        }
        if (stack.items.length === 1 && top.gaugeId != null) {
          hits.push({
            selection: { kind: 'gauge', id: top.gaugeId },
            title: top.title,
            sub: top.sub,
            x: stack.x, y: stack.y, r: 22,
          });
        }
      }

      hitRef.current = hits;
      stageSizeRef.current = { w, h };
      setStacks(prev => (stacksEqual(prev, stacks) ? prev : stacks));
    };

    drawRef.current = draw;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [geo, points, photos, gauges, lang, highlightDistricts]);

  const applyView = (next: View, paintButtons = true) => {
    const stage = stageRef.current;
    const w = stage?.clientWidth || 1;
    const h = stage?.clientHeight || 1;
    const clamped = clampView(next, w, h);
    viewRef.current = clamped;
    if (paintButtons) setView(clamped);
    setOpenStack(null);
    drawRef.current();
  };

  const zoomAt = (mx: number, my: number, factor: number) => {
    const stage = stageRef.current;
    const w = stage?.clientWidth || 1;
    const h = stage?.clientHeight || 1;
    const cur = viewRef.current;
    const zoom = clamp(cur.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const k = zoom / cur.zoom;
    applyView({
      zoom,
      panX: k * cur.panX + (1 - k) * (mx - w / 2),
      panY: k * cur.panY + (1 - k) * (my - h / 2),
    });
  };
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      const node = e.target;
      if (node instanceof Element && node.closest('.flood-map-stack-list')) return;
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      zoomAtRef.current(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.86 : 1.16);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [geo]);

  const positionOf = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const hitAt = (x: number, y: number): Hit | undefined => {
    let best: Hit | undefined;
    let bestDistance = Infinity;
    for (const hit of hitRef.current) {
      const distance = Math.hypot(hit.x - x, hit.y - y);
      if (distance <= hit.r && distance < bestDistance) {
        best = hit;
        bestDistance = distance;
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    stage.setPointerCapture(e.pointerId);
    const { x, y } = positionOf(e, stage);
    pointersRef.current.set(e.pointerId, { x, y });
    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: viewRef.current.zoom,
        panX: viewRef.current.panX,
        panY: viewRef.current.panY,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      pointerId: e.pointerId,
      x, y,
      panX: viewRef.current.panX,
      panY: viewRef.current.panY,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const { x, y } = positionOf(e, stage);
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x, y });

    if (pinchRef.current && pointersRef.current.size >= 2) {
      const pts = [...pointersRef.current.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const start = pinchRef.current;
      if (start.d > 8 && d > 8) {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        const mx = (pts[0].x + pts[1].x) / 2;
        const my = (pts[0].y + pts[1].y) / 2;
        const zoom = clamp(start.zoom * (d / start.d), MIN_ZOOM, MAX_ZOOM);
        const k = zoom / start.zoom;
        applyView({
          zoom,
          panX: k * start.panX + (1 - k) * (mx - w / 2),
          panY: k * start.panY + (1 - k) * (my - h / 2),
        });
      }
      setHover(null);
      return;
    }

    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      const dx = x - drag.x;
      const dy = y - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (drag.moved) {
        skipClickRef.current = true;
        applyView({
          zoom: viewRef.current.zoom,
          panX: drag.panX + dx,
          panY: drag.panY + dy,
        });
        setHover(null);
        return;
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hit = hitAt(x, y);
    if (hit) {
      setHover({ title: hit.title, sub: hit.sub, x, y });
      canvas.style.cursor = 'pointer';
      return;
    }
    canvas.style.cursor = viewRef.current.zoom > 1 ? 'grab' : 'crosshair';
    const dpr = window.devicePixelRatio || 1;
    const district = districtHitRef.current.find(d => ctx.isPointInPath(d.path, x * dpr, y * dpr));
    setHover(
      district
        ? {
            title: district.name,
            sub:
              district.status === 'severe'
                ? lang === 'ne' ? 'गम्भीर प्रभावित' : 'Severely affected'
                : lang === 'ne' ? 'प्रभावित' : 'Affected',
            x, y,
          }
        : null,
    );
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    if (openStack) {
      setOpenStack(null);
      return;
    }
    const { x, y } = positionOf(e, e.currentTarget);
    const hit = hitAt(x, y);
    if (!hit) return;
    if (hit.selection.kind === 'photo' && onPhotoSelect) onPhotoSelect(hit.selection.id);
    onSelect?.(hit.selection);
  };

  const zoomBy = (factor: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    // The + control should open the photograph cluster, not the empty middle
    // of the corridor. Wheel zoom still follows the pointer.
    let mx = stage.clientWidth / 2;
    let my = stage.clientHeight / 2;
    if (stacks.length > 0) {
      mx = stacks.reduce((s, p) => s + p.x, 0) / stacks.length;
      my = stacks.reduce((s, p) => s + p.y, 0) / stacks.length;
    }
    zoomAt(mx, my, factor);
  };

  const ne = lang === 'ne';
  const countOf = (layer: OverlayLayer) =>
    stacks.reduce((n, s) => n + (s.items[0]?.layer === layer ? s.items.length : 0), 0);
  const topicLabel = (layer: OverlayLayer, n: number) => {
    if (layer === 'gauge') return ne ? `डीएचएम ${n}` : `DHM ${n}`;
    if (layer === 'news') return ne ? `समाचार ${n}` : `Press ${n}`;
    return ne ? `जनता ${n}` : `Ground ${n}`;
  };
  const listTitle = (layer: OverlayLayer, n: number) => {
    if (layer === 'gauge') return ne ? `${n} मापन केन्द्र` : `${n} DHM stations`;
    if (layer === 'news') return ne ? `${n} समाचार` : `${n} headlines`;
    return ne ? `${n} तस्बिर` : `${n} ground reports`;
  };
  const visibleStacks = focusLayer ? stacks.filter(s => s.items[0]?.layer === focusLayer) : stacks;
  const open = visibleStacks.find(s => s.id === openStack && s.items.length > 1) || null;
  const stageW = stageSizeRef.current.w;
  const stageH = stageSizeRef.current.h;
  const listItems = open
    ? open.items
    : focusLayer
      ? stacks.filter(s => s.items[0]?.layer === focusLayer).flatMap(s => s.items)
      : [];
  const listGroups = groupPinsByPlace(listItems);
  const showList = listItems.length > 0;
  const listH = showList ? Math.min(152, Math.max(108, Math.round(stageH * 0.30))) : 0;
  const origin = open ? { x: open.x, y: open.y } : { x: 0, y: 0 };
  const spiderBounds = {
    w: stageW,
    h: stageH,
    pad: 26,
    padTop: 48,
    padLeft: 26,
    padRight: 52,
    padBottom: listH ? listH + 16 : 28,
  };
  const spider = open ? spiderLayout(origin, open.items.length, spiderBounds, 36, 44) : [];
  const tipMaxY = stageH - (listH || 0) - 56;
  const tipFlip = hover != null && hover.x > stageW * 0.55;
  const tipLeft = hover
    ? clamp(hover.x + (tipFlip ? -12 : 12), 8, stageW - 8)
    : 0;
  const tipTop = hover ? clamp(hover.y + 12, 44, Math.max(44, tipMaxY)) : 0;
  const topics: OverlayLayer[] = (['gauge', 'ground', 'news'] as OverlayLayer[]).filter(l => countOf(l) > 0);

  const shotBody = (pins: OverlayPin[], stacked: boolean) => (
    <span className="flood-map-shot-stack" aria-hidden="true">
      {pins.map((pin, i) => (
        <span
          key={pin.id}
          className="flood-map-shot-frame"
          style={{
            zIndex: pins.length - i,
            transform: stacked ? `rotate(${(i - 1) * 7}deg) translate(${(i - 1) * 3}px, ${(1 - i) * 2}px)` : undefined,
          }}
        >
          <span className={`flood-map-shot-ph${pin.layer === 'news' ? ' news' : pin.layer === 'gauge' ? ' gauge' : ''}`} />
          {pin.url && (
            <img
              src={pin.url}
              alt=""
              style={{ transform: orientationTransform(pin.orientation || 1) }}
              onError={ev => {
                ev.currentTarget.style.display = 'none';
              }}
            />
          )}
        </span>
      ))}
    </span>
  );

  const activatePin = (pin: OverlayPin) => {
    if (pin.gaugeId != null) {
      onSelect?.({ kind: 'gauge', id: pin.gaugeId });
      return;
    }
    if (onPhotoSelect) onPhotoSelect(pin.id);
    onSelect?.({ kind: 'photo', id: pin.id });
  };

  const toggleTopic = (layer: OverlayLayer) => {
    setOpenStack(null);
    setFocusLayer(prev => (prev === layer ? null : layer));
  };

  return (
    <div className="flood-map" ref={wrapRef}>
      <div
        className="flood-map-stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvasRef} onClick={onClick} />
        {hover && (
          <div
            className={`flood-map-tip${tipFlip ? ' flip' : ''}`}
            style={{ left: tipLeft, top: tipTop }}
          >
            <strong>{hover.title}</strong>
            {hover.sub && <span>{hover.sub}</span>}
          </div>
        )}
        {open && (
          <svg className="flood-map-spider" width={stageW} height={stageH} aria-hidden="true">
            {spider.map((pt, i) => {
              const pin = open.items[i];
              if (!pin) return null;
              return (
                <line
                  key={pin.id}
                  x1={open.x}
                  y1={open.y}
                  x2={open.x + pt.x}
                  y2={open.y + pt.y}
                />
              );
            })}
          </svg>
        )}
        {visibleStacks.map(stack => {
          const many = stack.items.length > 1;
          const spidered = open?.id === stack.id;
          const top = stack.items[0];
          const news = top.layer === 'news';
          const gauge = top.layer === 'gauge';
          const placeLabel = top.place
            ? (many ? `${top.place} · ${stack.items.length}` : top.place)
            : null;
          const className = `flood-map-shot${news ? ' news' : ''}${gauge ? ' gauge' : ''}${many ? ' stack' : ''}${spidered ? ' hub' : ''}${top.approximate && !many ? ' approx' : ''}`;
          const onEnter = (x: number, y: number) => () => {
            setHover({
              title: placeLabel || top.title,
              sub: many && top.place ? top.sub : top.sub,
              x, y,
            });
          };
          if (many && !spidered) {
            return (
              <button
                key={stack.id}
                type="button"
                className={className}
                style={{ left: stack.x, top: stack.y }}
                aria-expanded={false}
                aria-label={placeLabel || listTitle(top.layer, stack.items.length)}
                onMouseEnter={() => setHover({
                  title: placeLabel || top.title,
                  sub: top.sub,
                  x: stack.x,
                  y: stack.y,
                })}
                onMouseLeave={() => setHover(null)}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => {
                  setFocusLayer(top.layer);
                  setOpenStack(stack.id);
                }}
              >
                {shotBody(stack.items.slice(0, 3), true)}
                <em className="flood-map-shot-count">{stack.items.length}</em>
              </button>
            );
          }
          if (many && spidered) {
            return (
              <button
                key={stack.id}
                type="button"
                className={className}
                style={{ left: stack.x, top: stack.y }}
                aria-expanded={true}
                aria-label={ne ? 'थुप्रो बन्द गर्नुहोस्' : 'Close photograph stack'}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => setOpenStack(null)}
              >
                <em className="flood-map-shot-count">{stack.items.length}</em>
              </button>
            );
          }
          if (top.href) {
            return (
              <a
                key={stack.id}
                className={className}
                style={{ left: stack.x, top: stack.y }}
                href={top.href}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={onEnter(stack.x, stack.y)}
                onMouseLeave={() => setHover(null)}
                onPointerDown={e => e.stopPropagation()}
              >
                {shotBody([top], false)}
              </a>
            );
          }
          return (
            <button
              key={stack.id}
              type="button"
              className={className}
              style={{ left: stack.x, top: stack.y }}
              onMouseEnter={onEnter(stack.x, stack.y)}
              onMouseLeave={() => setHover(null)}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => activatePin(top)}
            >
              {shotBody([top], false)}
            </button>
          );
        })}
        {open && spider.map((pt, i) => {
          const pin = open.items[i];
          if (!pin) return null;
          const x = open.x + pt.x;
          const y = open.y + pt.y;
          const news = pin.layer === 'news';
          const className = `flood-map-shot leaf${news ? ' news' : ''}${pin.layer === 'gauge' ? ' gauge' : ''}${pin.approximate ? ' approx' : ''}`;
          const onEnter = () => setHover({ title: pin.title, sub: pin.sub, x, y });
          if (pin.href) {
            return (
              <a
                key={`leaf-${pin.id}`}
                className={className}
                style={{ left: x, top: y }}
                href={pin.href}
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={onEnter}
                onMouseLeave={() => setHover(null)}
                onPointerDown={e => e.stopPropagation()}
              >
                {shotBody([pin], false)}
              </a>
            );
          }
          return (
            <button
              key={`leaf-${pin.id}`}
              type="button"
              className={className}
              style={{ left: x, top: y }}
              onMouseEnter={onEnter}
              onMouseLeave={() => setHover(null)}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => activatePin(pin)}
            >
              {shotBody([pin], false)}
            </button>
          );
        })}
        {topics.length > 0 && (
          <div className="flood-map-chips" role="toolbar" aria-label={ne ? 'नक्साका विषय' : 'Map topics'} onPointerDown={e => e.stopPropagation()}>
            {topics.map(layer => (
              <button
                key={layer}
                type="button"
                className={focusLayer === layer ? 'on' : undefined}
                aria-pressed={focusLayer === layer}
                onClick={() => toggleTopic(layer)}
              >
                {topicLabel(layer, countOf(layer))}
              </button>
            ))}
          </div>
        )}
        {showList && (
          <div
            className="flood-map-stack-list"
            style={{ height: listH }}
            onPointerDown={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            <p>
              {open
                ? (open.items[0].place
                  ? `${open.items[0].place} · ${open.items.length}`
                  : listTitle(open.items[0].layer, open.items.length))
                : focusLayer
                  ? listTitle(focusLayer, listItems.length)
                  : (ne ? 'विषय' : 'Topics')}
              <button
                type="button"
                onClick={() => {
                  setOpenStack(null);
                  setFocusLayer(null);
                }}
                aria-label={ne ? 'बन्द' : 'Close'}
              >
                ×
              </button>
            </p>
            <ul>
              {listGroups.map(group => (
                <React.Fragment key={group.place || group.items[0]?.id}>
                  {group.place && listGroups.length > 1 && (
                    <li className="place">{group.place}</li>
                  )}
                  {group.items.map(pin => {
                    const inner = (
                      <>
                        {pin.url ? (
                          <img src={pin.url} alt="" onError={ev => { ev.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <span className={`flood-map-shot-ph${pin.layer === 'news' ? ' news' : pin.layer === 'gauge' ? ' gauge' : ''}`} />
                        )}
                        <span>
                          <strong>{pin.title}</strong>
                          <em>{pin.sub}</em>
                        </span>
                      </>
                    );
                    return (
                      <li key={pin.id}>
                        {pin.href ? (
                          <a href={pin.href} target="_blank" rel="noopener noreferrer">{inner}</a>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              activatePin(pin);
                              setOpenStack(null);
                            }}
                          >
                            {inner}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </React.Fragment>
              ))}
            </ul>
          </div>
        )}
        <div className="flood-map-zoom" role="group" aria-label={ne ? 'नक्सा जुम' : 'Map zoom'} onPointerDown={e => e.stopPropagation()}>
          <button type="button" onClick={() => zoomBy(1.4)} disabled={view.zoom >= MAX_ZOOM - 0.01} aria-label={ne ? 'ठूलो पार्नुहोस्' : 'Zoom in'}>+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.4)} disabled={view.zoom <= MIN_ZOOM + 0.01} aria-label={ne ? 'सानो पार्नुहोस्' : 'Zoom out'}>−</button>
          <button type="button" onClick={() => applyView({ zoom: 1, panX: 0, panY: 0 })} disabled={view.zoom === 1 && view.panX === 0 && view.panY === 0} aria-label={ne ? 'पूरै नक्सा' : 'Reset map'}>
            {ne ? 'पूरै' : 'All'}
          </button>
        </div>
      </div>
      <div className="flood-map-key">
        <span><i style={{ background: SEVERE }} />{ne ? 'गम्भीर' : 'Severe'}</span>
        <span><i style={{ background: AFFECTED }} />{ne ? 'प्रभावित' : 'Affected'}</span>
        {points.length > 0 && (
          <>
            <span><i className="line" />{ne ? 'पुष्टि भएको बाटो' : 'Confirmed path'}</span>
            {points.some(p => isEstimated(p.status)) && (
              <span><i className="line est" />{ne ? 'अनुमानित / जोखिममा' : 'Estimated / at risk'}</span>
            )}
            {points.some(p => p.status === 'entry') && (
              <span><i style={{ background: ENTRY, borderRadius: '50%' }} />{ne ? 'प्रवेश बिन्दु' : 'Entry'}</span>
            )}
            <span><i style={{ background: CONFIRMED, borderRadius: '50%' }} />{ne ? 'पुगेको' : 'Reached'}</span>
            {points.some(p => isEstimated(p.status)) && (
              <span><i className="hollow" style={{ borderColor: ESTIMATED }} />{ne ? 'अनुमानित' : 'Estimated'}</span>
            )}
          </>
        )}
        {gauges.some(g => !g.photo) && <span><i className="sq" style={{ background: GAUGE_COLOUR.normal }} />{ne ? 'डीएचएम मापन केन्द्र' : 'DHM gauge'}</span>}
        {countOf('gauge') > 0 && (
          <span><i style={{ background: GAUGE_SHOT, borderRadius: '2px' }} />{ne ? 'डीएचएम तस्बिर' : 'DHM station photo'}</span>
        )}
        {countOf('ground') > 0 && (
          <span><i style={{ background: PHOTO, borderRadius: '50%' }} />{ne ? 'जनताका तस्बिर' : 'Ground reports'}</span>
        )}
        {countOf('news') > 0 && (
          <span><i style={{ background: NEWS, borderRadius: '50%' }} />{ne ? 'समाचार' : 'Press'}</span>
        )}
      </div>
      <p className="flood-map-zoom-hint">
        {ne
          ? 'विषय छानेर सूची खोल्नुहोस्। थुप्रो तस्बिर थिचेर फिँजाउनुहोस् — नक्साभित्रै रहन्छ।'
          : 'Pick a topic to open its list. Tap a stacked pin to fan it out inside the map.'}
      </p>
    </div>
  );
}
