// Circle / spiral leaf layout for a clustered map pin.
//
// Atlas draws the flood corridor on a canvas, not MapLibre, so the npm
// package @nazka/map-gl-js-spiderfy cannot run here. The placement math is
// the same idea that package (and Leaflet.markercluster before it) uses:
// a ring until the cluster is crowded, then a growing spiral, then shrink
// and clamp so every leaf stays inside the map instead of covering the
// neighbouring column.

export interface Pt {
  x: number;
  y: number;
}

export interface SpiderBounds {
  w: number;
  h: number;
  pad: number;
  padTop?: number;
  padRight?: number;
  padBottom?: number;
  padLeft?: number;
}

/** Switch from a ring to a spiral once this many photographs share a pin. */
export const CIRCLE_SPIRAL_SWITCHOVER = 8;

export function spiderOffsets(count: number, leafSize = 44): Pt[] {
  if (count <= 0) return [];
  const separation = Math.max(leafSize + 28, 72);
  return count >= CIRCLE_SPIRAL_SWITCHOVER
    ? spiralOffsets(count, { leavesSeparation: Math.max(42, leafSize * 0.95), legLengthStart: leafSize + 8 })
    : circleOffsets(count, separation);
}

export function circleOffsets(count: number, separation: number): Pt[] {
  const theta = (Math.PI * 2) / Math.max(count, 1);
  const points: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const angle = theta * i - Math.PI / 2;
    points.push({
      x: separation * Math.cos(angle),
      y: separation * Math.sin(angle),
    });
  }
  return points;
}

export function spiralOffsets(
  count: number,
  opts: { legLengthStart?: number; legLengthFactor?: number; leavesSeparation?: number } = {},
): Pt[] {
  const legLengthStart = opts.legLengthStart ?? 36;
  const legLengthFactor = opts.legLengthFactor ?? 2.2;
  const leavesSeparation = opts.leavesSeparation ?? 34;
  const points: Pt[] = [];
  let legLength = legLengthStart;
  let angle = 0;
  for (let i = 0; i < count; i++) {
    angle += leavesSeparation / legLength + i * 0.0005;
    points.push({
      x: legLength * Math.cos(angle),
      y: legLength * Math.sin(angle),
    });
    legLength += (Math.PI * 2 * legLengthFactor) / angle;
  }
  return points;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Keep the hub where the photographs actually sit, and pull the fan inside
 * the stage. Scaling happens first so a 13-leaf spiral on a narrow corridor
 * map does not spill into the brief beside it.
 */
export function fitLeaves(origin: Pt, offsets: Pt[], bounds: SpiderBounds): Pt[] {
  if (!offsets.length) return [];
  const pad = bounds.pad;
  const padTop = bounds.padTop ?? pad;
  const padRight = bounds.padRight ?? pad;
  const padBottom = bounds.padBottom ?? pad;
  const padLeft = bounds.padLeft ?? pad;
  const minX = padLeft;
  const maxX = Math.max(padLeft + 1, bounds.w - padRight);
  const minY = padTop;
  const maxY = Math.max(padTop + 1, bounds.h - padBottom);

  let pts = offsets.map(p => ({ x: p.x, y: p.y }));

  const bbox = () => {
    let x0 = origin.x;
    let x1 = origin.x;
    let y0 = origin.y;
    let y1 = origin.y;
    for (const p of pts) {
      const x = origin.x + p.x;
      const y = origin.y + p.y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return { x0, x1, y0, y1 };
  };

  let box = bbox();
  const availW = Math.max(1, maxX - minX);
  const availH = Math.max(1, maxY - minY);
  const spanX = Math.max(1, box.x1 - box.x0);
  const spanY = Math.max(1, box.y1 - box.y0);
  const k = Math.min(1, availW / spanX, availH / spanY);
  if (k < 0.999) pts = pts.map(p => ({ x: p.x * k, y: p.y * k }));

  box = bbox();
  let dx = 0;
  let dy = 0;
  if (box.x0 < minX) dx = minX - box.x0;
  if (box.x1 + dx > maxX) dx = maxX - box.x1;
  if (box.x0 + dx < minX) dx = minX - box.x0;
  if (box.y0 < minY) dy = minY - box.y0;
  if (box.y1 + dy > maxY) dy = maxY - box.y1;
  if (box.y0 + dy < minY) dy = minY - box.y0;
  pts = pts.map(p => ({ x: p.x + dx, y: p.y + dy }));

  return pts.map(p => ({
    x: clamp(origin.x + p.x, minX, maxX) - origin.x,
    y: clamp(origin.y + p.y, minY, maxY) - origin.y,
  }));
}

/** After a squeeze, push leaves that landed on top of each other back apart. */
export function separateLeaves(offsets: Pt[], minGap: number): Pt[] {
  const pts = offsets.map(p => ({ x: p.x, y: p.y }));
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j < i; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      const d = Math.hypot(dx, dy);
      if (d < 0.001) {
        const a = i * 2.4;
        pts[i] = { x: pts[j].x + Math.cos(a) * minGap, y: pts[j].y + Math.sin(a) * minGap };
      } else if (d < minGap) {
        const k = minGap / d;
        pts[i] = { x: pts[j].x + dx * k, y: pts[j].y + dy * k };
      }
    }
  }
  return pts;
}
