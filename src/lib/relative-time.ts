// Relative timestamps for the flood desk, in English and Nepali.
//
// Shared rather than duplicated because the wire, the gauge table and the
// ground-report feed all sit on the same page: if one of them rounded
// differently, two timestamps for the same moment would disagree in view of
// each other.

export type Lang = 'en' | 'ne';

/** "12 min ago" / "३ घण्टा अघि". Minutes in, human phrase out. */
export function ageLabel(minutes: number | null, lang: Lang): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const mins = Math.max(0, Math.round(minutes));
  if (mins < 1) return lang === 'ne' ? 'भर्खरै' : 'just now';
  if (mins < 60) return lang === 'ne' ? `${mins} मिनेट अघि` : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return lang === 'ne' ? `${h} घण्टा अघि` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === 'ne' ? `${d} दिन अघि` : `${d}d ago`;
}

/** The same, from an ISO timestamp. Invalid or missing input reads as an em dash. */
export function ageFrom(iso: string | null | undefined, lang: Lang): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  return ageLabel((Date.now() - then) / 60000, lang);
}

/** Clock time in Nepal, for labelling a ten-minute digest window. */
export function nepalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
}

/**
 * CSS transform that undoes an EXIF orientation. The tags are stripped from
 * stored photos, so the browser cannot right them on its own and the value is
 * carried in the database instead.
 */
export function orientationTransform(orientation: number): string | undefined {
  switch (orientation) {
    case 2: return 'scaleX(-1)';
    case 3: return 'rotate(180deg)';
    case 4: return 'scaleX(-1) rotate(180deg)';
    case 5: return 'scaleX(-1) rotate(90deg)';
    case 6: return 'rotate(90deg)';
    case 7: return 'scaleX(-1) rotate(270deg)';
    case 8: return 'rotate(270deg)';
    default: return undefined;
  }
}
