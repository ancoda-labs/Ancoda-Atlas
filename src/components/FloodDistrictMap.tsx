'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AffectedDistrictProps, FloodGauge, GeoCollection, Geometry, PhotoGeoSource } from '@/types';
import { orientationTransform } from '@/lib/photo-orientation';

// The flood corridor map.
//
// Canvas rather than SVG or a tile map: seven district polygons at full
// coordinate precision is ~5,700 points, which is a lot of DOM nodes for
// something that never animates, and the page carries no basemap dependency it
// would have to survive an outage of. Equirectangular projection, scaled to the
// district bbox — over two degrees of Nepal the distortion is not visible.
//
// The map draws four things, and the distinction between the first two is the
// one that matters most:
//
//   Confirmed path — solid. The water is known to have reached these places.
//   Estimated reach — dashed, in a different colour, labelled as an estimate.
//     Drawing a projection in the same ink as an observation would tell a
//     reader downstream that something has happened when it has not.
//   DHM gauges — live, each coloured against its own danger mark.
//   Ground reports — photographs the public sent in.
//
// Everything on it is clickable; the parent opens a dialog for whatever was hit.

export interface MapPhoto {
  id: string;
  lat: number;
  lon: number;
  geoSource: PhotoGeoSource;
  label: string;
  /** When set, the pin is the photograph itself rather than a coloured dot. */
  url?: string;
  orientation?: number;
  /** Ground reports vs press photographs — drawn differently, labelled differently. */
  layer?: 'ground' | 'news';
  /** Press items open the outlet's page; ground reports open the map dialog. */
  href?: string;
  /** Overrides the default hover subtitle. */
  sub?: string;
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
}

const SEVERE = '#ff4d5c';
const AFFECTED = '#ffb020';
const CONFIRMED = '#ff4d5c';
const ESTIMATED = '#ffb020';
const PHOTO = '#7ce0b4';
const NEWS = '#6ec8ff';
const ENTRY = '#6ec8ff';

interface OverlayPin {
  id: string;
  x: number;
  y: number;
  url: string;
  orientation?: number;
  layer: 'ground' | 'news';
  href?: string;
  title: string;
  sub: string;
  approximate: boolean;
}

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
    const angle = step * 2.4;              // golden-ish turn, avoids clustering
    const radius = minGap * (0.8 + step * 0.22);
    const nx = x + Math.cos(angle) * radius;
    const ny = y + Math.sin(angle) * radius;
    if (!collides(nx, ny)) return { x: nx, y: ny };
  }
  return { x, y };
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

export default function FloodDistrictMap({ points = [], photos = [], gauges = [], onSelect, onPhotoSelect, lang }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<GeoCollection<AffectedDistrictProps> | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [overlays, setOverlays] = useState<OverlayPin[]>([]);
  const districtHitRef = useRef<Array<{ name: string; status: string; path: Path2D }>>([]);
  const hitRef = useRef<Hit[]>([]);

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
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !geo) return;
    const ne = lang === 'ne';

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = Math.max(340, Math.round(w * 0.72));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Fit the districts and everything plotted on them into the canvas.
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
      // The corridor now runs past the district polygons, so the downstream
      // points have to widen the frame or they fall off the edge.
      for (const p of points) stretch(p.lng, p.lat);
      for (const photo of photos) stretch(photo.lon, photo.lat);

      const pad = 20;
      const lonScale = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
      const spanX = (maxX - minX) * lonScale;
      const spanY = maxY - minY;
      const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
      const offX = (w - spanX * scale) / 2;
      const offY = (h - spanY * scale) / 2;
      const project = (lon: number, lat: number): [number, number] => [
        offX + (lon - minX) * lonScale * scale,
        offY + (maxY - lat) * scale,
      ];

      // ── Districts ──
      const districtHits: Array<{ name: string; status: string; path: Path2D }> = [];
      for (const f of geo.features) {
        const severe = f.properties.status === 'severe';
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
        ctx.lineWidth = severe ? 1.6 : 1.1;
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
          ctx.fillStyle = severe ? '#ffd9dd' : '#ffe6bf';
          ctx.font = `${severe ? '600 ' : ''}11px "Geist Pixel"`;
          ctx.textAlign = 'center';
          ctx.fillText(ne ? f.properties.name_ne : f.properties.name_en, cx / n, cy / n);
        }
      }
      districtHitRef.current = districtHits;

      const hits: Hit[] = [];
      // Every marker already drawn, so later ones can step aside from them.
      const placed: Array<{ x: number; y: number }> = [];

      // ── The path: confirmed solid, estimated dashed ──
      if (points.length) {
        const firstEstimated = points.findIndex(p => isEstimated(p.status));
        const confirmed = firstEstimated === -1 ? points : points.slice(0, firstEstimated);
        // The estimated leg starts at the last confirmed point so the line joins up.
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
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.setLineDash(dash);
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
          const r = entry ? 7 : 5.5;
          const { x, y } = deOverlap(tx, ty, placed, r * 2 + 3);
          placed.push({ x, y });
          // A displaced marker gets a hairline back to its true position, so a
          // nudge for legibility never reads as a claim about where it is.
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

      // ── DHM gauges ──
      for (const g of gauges) {
        if (g.lat == null || g.lon == null) continue;
        const [gtx, gty] = project(g.lon, g.lat);
        const colour = GAUGE_COLOUR[g.level] || GAUGE_COLOUR.unknown;
        // Square, so a gauge is never mistaken for a place on the path.
        const s = 5;
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
          title: ne ? g.labelNe : g.label,
          sub: g.stale
            ? ne ? 'हालको तथ्यांक छैन' : 'No current reading'
            : `${g.waterLevel != null ? `${g.waterLevel.toFixed(2)} m` : '—'} · ${ne ? 'मापन केन्द्र' : 'DHM gauge'}`,
          x, y, r: s + 6,
        });
      }

      // ── Ground reports and press photographs ──
      const nextOverlays: OverlayPin[] = [];
      for (const photo of photos) {
        const [ptx, pty] = project(photo.lon, photo.lat);
        const layer = photo.layer === 'news' ? 'news' : 'ground';
        const approximate = photo.geoSource === 'district' || layer === 'news';
        const hasImage = Boolean(photo.url);
        const { x, y } = deOverlap(ptx, pty, placed, hasImage ? 22 : approximate ? 10 : 13);
        placed.push({ x, y });
        const halo = layer === 'news' ? 'rgba(110, 200, 255, 0.20)' : 'rgba(124, 224, 180, 0.16)';
        const haloStroke = layer === 'news' ? 'rgba(110, 200, 255, 0.50)' : 'rgba(124, 224, 180, 0.45)';
        if (approximate) {
          ctx.beginPath();
          ctx.arc(ptx, pty, hasImage ? 20 : 15, 0, Math.PI * 2);
          ctx.fillStyle = halo;
          ctx.fill();
          ctx.strokeStyle = haloStroke;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const sub = photo.sub
          || (layer === 'news'
          ? (ne ? 'समाचारको तस्बिर — जिल्ला शीर्षकबाट' : 'Press photograph — district from the headline')
          : approximate
            ? (ne ? 'जिल्ला अनुसार अनुमानित स्थान' : 'Approximate — district only')
            : (ne ? 'जनताको तस्बिर — खोल्न थिच्नुहोस्' : 'Ground report — click to open'));

        if (hasImage && photo.url) {
          nextOverlays.push({
            id: photo.id,
            x, y,
            url: photo.url,
            orientation: photo.orientation,
            layer,
            href: photo.href,
            title: photo.label,
            sub,
            approximate,
          });
          // Press photographs are links on the overlay, not dialog targets.
          if (layer === 'ground') {
            hits.push({
              selection: { kind: 'photo', id: photo.id },
              title: photo.label,
              sub,
              x, y, r: 20,
            });
          }
        } else {
          ctx.beginPath();
          ctx.arc(x, y, approximate ? 3.5 : 5.5, 0, Math.PI * 2);
          ctx.fillStyle = layer === 'news' ? NEWS : PHOTO;
          ctx.strokeStyle = '#08120e';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
          hits.push({
            selection: { kind: 'photo', id: photo.id },
            title: photo.label,
            sub,
            x, y, r: approximate ? 15 : 9,
          });
        }
      }

      hitRef.current = hits;
      setOverlays(prev => {
        if (
          prev.length === nextOverlays.length
          && prev.every((pin, i) => {
            const next = nextOverlays[i];
            return pin.id === next.id && pin.x === next.x && pin.y === next.y && pin.url === next.url;
          })
        ) {
          return prev;
        }
        return nextOverlays;
      });
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [geo, points, photos, gauges, lang]);

  const positionOf = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Nearest marker under the pointer. Photos and gauges sit above the path. */
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

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = positionOf(e);

    const hit = hitAt(x, y);
    if (hit) {
      setHover({ title: hit.title, sub: hit.sub, x, y });
      canvas.style.cursor = 'pointer';
      return;
    }
    canvas.style.cursor = 'crosshair';

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

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = positionOf(e);
    const hit = hitAt(x, y);
    if (!hit) return;
    if (hit.selection.kind === 'photo' && onPhotoSelect) onPhotoSelect(hit.selection.id);
    onSelect?.(hit.selection);
  };

  const ne = lang === 'ne';

  return (
    <div className="flood-map" ref={wrapRef}>
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} />
      {hover && (
        <div className="flood-map-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <strong>{hover.title}</strong>
          <span>{hover.sub}</span>
        </div>
      )}
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
        {gauges.length > 0 && <span><i className="sq" style={{ background: GAUGE_COLOUR.normal }} />{ne ? 'डीएचएम मापन केन्द्र' : 'DHM gauge'}</span>}
        {photos.some(p => (p.layer || 'ground') === 'ground') && (
          <span><i style={{ background: PHOTO, borderRadius: '50%' }} />{ne ? 'जनताका तस्बिर' : 'Ground reports'}</span>
        )}
        {photos.some(p => p.layer === 'news') && (
          <span><i style={{ background: NEWS, borderRadius: '50%' }} />{ne ? 'समाचारका तस्बिर' : 'Press photos'}</span>
        )}
      </div>
      {overlays.map(pin => {
        const className = `flood-map-shot${pin.layer === 'news' ? ' news' : ''}${pin.approximate ? ' approx' : ''}`;
        const style: React.CSSProperties = {
          left: pin.x,
          top: pin.y,
        };
        const img = (
          <img
            src={pin.url}
            alt=""
            onError={e => {
              e.currentTarget.style.display = 'none';
            }}
            style={pin.orientation ? { transform: orientationTransform(pin.orientation) } : undefined}
          />
        );
        const onEnter = () => setHover({ title: pin.title, sub: pin.sub, x: pin.x, y: pin.y });
        if (pin.href) {
          return (
            <a
              key={pin.id}
              className={className}
              style={style}
              href={pin.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={pin.title}
              onMouseEnter={onEnter}
              onMouseLeave={() => setHover(null)}
            >
              {img}
            </a>
          );
        }
        return (
          <button
            key={pin.id}
            type="button"
            className={className}
            style={style}
            aria-label={pin.title}
            onMouseEnter={onEnter}
            onMouseLeave={() => setHover(null)}
            onClick={() => {
              if (onPhotoSelect) onPhotoSelect(pin.id);
              onSelect?.({ kind: 'photo', id: pin.id });
            }}
          >
            {img}
          </button>
        );
      })}
    </div>
  );
}
