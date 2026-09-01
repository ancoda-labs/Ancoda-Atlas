/**
 * The bits of Nepal's geography the browser needs.
 *
 * The authoritative copy is backend/app/core/nepal.py and
 * backend/app/domains/flood/scope.py — everything server-side resolves against
 * those. This is the small subset the UI cannot ask the API for on every
 * render: bucketing a map marker into a province, placing a headline that
 * names a district, and filling the report form's district picker.
 *
 * Keep the values here in step with the backend's. They are editorial
 * constants that change when the scope of a response changes, not data that
 * moves on a cycle.
 */

export interface ProvinceBox {
  label: string;
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
}

export const NEPAL_BBOX = { lamin: 26.3, lomin: 79.9, lamax: 30.6, lomax: 88.3 };

/** The seven federal provinces, as approximate tiling rectangles. */
export const PROVINCES: Record<string, ProvinceBox> = {
  koshi: { label: 'Koshi', lamin: 26.35, lomin: 86.5, lamax: 28.15, lomax: 88.3 },
  madhesh: { label: 'Madhesh', lamin: 26.3, lomin: 84.8, lamax: 27.35, lomax: 86.9 },
  bagmati: { label: 'Bagmati', lamin: 27.0, lomin: 84.3, lamax: 28.4, lomax: 86.4 },
  gandaki: { label: 'Gandaki', lamin: 27.5, lomin: 82.9, lamax: 29.35, lomax: 85.2 },
  lumbini: { label: 'Lumbini', lamin: 27.3, lomin: 81.4, lamax: 29.0, lomax: 84.4 },
  karnali: { label: 'Karnali', lamin: 28.1, lomin: 81.0, lamax: 30.45, lomax: 83.6 },
  sudurpashchim: { label: 'Sudurpashchim', lamin: 28.3, lomin: 79.9, lamax: 30.6, lomax: 81.8 },
};

export function inNepal(lat: number | null, lon: number | null): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  return (
    lat >= NEPAL_BBOX.lamin && lat <= NEPAL_BBOX.lamax &&
    lon >= NEPAL_BBOX.lomin && lon <= NEPAL_BBOX.lomax
  );
}

/** Bucket a coordinate into a province key, or null if it falls outside Nepal. */
export function provinceOf(lat: number | null, lon: number | null): string | null {
  if (!inNepal(lat, lon)) return null;
  for (const [key, p] of Object.entries(PROVINCES)) {
    if (lat! >= p.lamin && lat! <= p.lamax && lon! >= p.lomin && lon! <= p.lomax) return key;
  }
  return null;
}
