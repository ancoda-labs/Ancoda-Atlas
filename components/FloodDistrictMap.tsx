'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AffectedDistrictProps, GeoCollection, Geometry } from '@/lib/types';

// Affected-district map for the Rasuwa–Bhotekoshi flood.
//
// Canvas rather than SVG: seven district polygons at full coordinate precision
// is ~5,700 points, which is a lot of DOM nodes for something that never
// animates. Equirectangular projection, scaled to the district bbox — over
// two degrees of Nepal the distortion is not visible.

interface Props {
  /** Flood path points, drawn over the districts upstream → downstream. */
  points?: Array<{ id: string; name_en: string; name_ne: string; lat: number; lng: number; status: string }>;
  lang: 'en' | 'ne';
}

/** Flatten Polygon and MultiPolygon into a single list of rings. */
function ringsOf(geometry: Geometry): Array<Array<[number, number]>> {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

const SEVERE = '#ff4d5c';
const AFFECTED = '#ffb020';

export default function FloodDistrictMap({ points = [], lang }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [geo, setGeo] = useState<GeoCollection<AffectedDistrictProps> | null>(null);
  const [hover, setHover] = useState<{ name: string; status: string; x: number; y: number } | null>(null);
  const hitRef = useRef<Array<{ name: string; status: string; path: Path2D }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/flood-affected-districts.geojson')
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

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = Math.max(300, Math.round(w * 0.72));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Fit the district bbox into the canvas with a small margin.
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const f of geo.features) {
        for (const ring of ringsOf(f.geometry)) {
          for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      const pad = 18;
      // Latitude degrees are longer than longitude degrees at 28°N; correcting
      // for it keeps the districts from looking horizontally stretched.
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

      const hits: Array<{ name: string; status: string; path: Path2D }> = [];

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

        hits.push({
          name: lang === 'ne' ? f.properties.name_ne : f.properties.name_en,
          status: f.properties.status,
          path,
        });

        // District label at the polygon centroid.
        let cx = 0, cy = 0, n = 0;
        for (const ring of ringsOf(f.geometry)) {
          for (const [lon, lat] of ring) {
            const [x, y] = project(lon, lat);
            cx += x;
            cy += y;
            n++;
          }
        }
        if (n) {
          ctx.fillStyle = severe ? '#ffd9dd' : '#ffe6bf';
          ctx.font = `${severe ? '600 ' : ''}11px ui-monospace, monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(lang === 'ne' ? f.properties.name_ne : f.properties.name_en, cx / n, cy / n);
        }
      }
      hitRef.current = hits;

      // Flood path: a line downstream, with a marker at each reported point.
      if (points.length) {
        ctx.beginPath();
        points.forEach((p, i) => {
          const [x, y] = project(p.lng, p.lat);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = 'rgba(110, 200, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        points.forEach((p, i) => {
          const [x, y] = project(p.lng, p.lat);
          ctx.beginPath();
          ctx.arc(x, y, i === 0 ? 6 : 4, 0, Math.PI * 2);
          ctx.fillStyle = i === 0 ? '#6ec8ff' : '#0e141c';
          ctx.strokeStyle = '#6ec8ff';
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
        });
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [geo, points, lang]);

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitRef.current.find(h => ctx.isPointInPath(h.path, x * (window.devicePixelRatio || 1), y * (window.devicePixelRatio || 1)));
    setHover(hit ? { name: hit.name, status: hit.status, x, y } : null);
  };

  return (
    <div className="flood-map" ref={wrapRef}>
      <canvas ref={canvasRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      {hover && (
        <div className="flood-map-tip" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <strong>{hover.name}</strong>
          <span>
            {hover.status === 'severe'
              ? lang === 'ne' ? 'गम्भीर प्रभावित' : 'Severely affected'
              : lang === 'ne' ? 'प्रभावित' : 'Affected'}
          </span>
        </div>
      )}
      <div className="flood-map-key">
        <span><i style={{ background: SEVERE }} />{lang === 'ne' ? 'गम्भीर' : 'Severe'}</span>
        <span><i style={{ background: AFFECTED }} />{lang === 'ne' ? 'प्रभावित' : 'Affected'}</span>
        <span><i className="line" />{lang === 'ne' ? 'बाढीको बाटो' : 'Flood path'}</span>
      </div>
    </div>
  );
}
