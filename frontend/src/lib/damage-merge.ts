import type { BulletinDamage, DamageGradeRow, FloodDamageContent, SitrepHeadline } from '@/types';

const BUILDING_PARTS = ['residential', 'institutional', 'school', 'other-nonres', 'religious'] as const;

function partsOf(row: DamageGradeRow | undefined): number | null {
  if (!row || row.affected == null || !Number.isFinite(row.affected)) return null;
  return (row.destroyed ?? 0) + (row.damaged ?? 0) + (row.possible ?? 0);
}

/**
 * Whether the Copernicus building arithmetic still closes.
 *
 * Three identities the source itself prints:
 *   destroyed + damaged + possible = all buildings (323+32+78 = 433)
 *   the same for residential (283+31+78 = 392)
 *   the five building classes sum to all buildings (392+1+1+37+2 = 433)
 *
 * 392 is inside 433. A scrape that would let a reader add them is refused.
 */
export function buildingsClose(rows: DamageGradeRow[] | undefined): boolean {
  if (!rows?.length) return false;
  const byId = new Map(rows.map(r => [r.id, r]));
  const all = byId.get('all-buildings');
  const res = byId.get('residential');
  if (!all || !res || all.affected == null || res.affected == null) return false;
  if (partsOf(all) !== all.affected) return false;
  if (partsOf(res) !== res.affected) return false;
  const classSum = BUILDING_PARTS.reduce((acc, id) => acc + (byId.get(id)?.affected ?? 0), 0);
  return classSum === all.affected;
}

function overlayRow(reviewed: DamageGradeRow, live: DamageGradeRow): DamageGradeRow {
  return {
    ...reviewed,
    destroyed: live.destroyed ?? reviewed.destroyed,
    damaged: live.damaged ?? reviewed.damaged,
    possible: live.possible ?? reviewed.possible,
    affected: live.affected ?? reviewed.affected,
    aoi: live.aoi ?? reviewed.aoi,
    share: live.share ?? reviewed.share,
    approximate: live.approximate ?? reviewed.approximate,
    label_en: live.label_en || reviewed.label_en,
    label_ne: live.label_ne || reviewed.label_ne,
  };
}

function overlayHeadline(
  headlines: SitrepHeadline[] | undefined,
  live: SitrepHeadline[],
  sourceLabel: string,
): SitrepHeadline[] | undefined {
  if (!headlines?.length || !live.length) return headlines;
  const fresh = new Map(live.map(h => [h.id, h]));
  return headlines.map(h => {
    const replacement = fresh.get(h.id);
    if (!replacement || replacement.value == null || !Number.isFinite(replacement.value)) return h;
    return {
      ...h,
      value: replacement.value,
      suffix: replacement.suffix,
      approximate: replacement.approximate,
      source: sourceLabel,
    };
  });
}

function withSource(reviewed: FloodDamageContent, live: BulletinDamage): FloodDamageContent {
  const sources = [...(reviewed.sources ?? [])];
  if (live.source?.url && !sources.some(s => s.url === live.source.url)) sources.push(live.source);
  return { ...reviewed, sources };
}

/**
 * The reviewed Copernicus table with the bulletin's current figures laid over it.
 *
 * The reviewed file is a floor. The NEA plant list is never overlaid — that
 * notice is dated and does not move every cycle. A failed read, or a scrape
 * whose buildings do not add up, leaves the reviewed figures standing.
 *
 * Maps and AOI photographs overlay on their own: a closed table is not
 * required, and an empty scrape leaves the reviewed images in place.
 */
export function mergeDamage(
  reviewed: FloodDamageContent | null,
  live: BulletinDamage | null,
): FloodDamageContent | null {
  if (!reviewed) return reviewed;
  if (!live || live.error) return reviewed;

  let next = withSource(reviewed, live);

  if (live.rows.length && buildingsClose(live.rows)) {
    const reviewedRows = next.copernicus?.rows ?? [];
    const fresh = new Map(live.rows.map(r => [r.id, r]));
    const rows = reviewedRows.map(row => {
      const replacement = fresh.get(row.id);
      return replacement ? overlayRow(row, replacement) : row;
    });
    const headline = overlayHeadline(next.copernicus?.headline, live.headline, live.source.label);
    next = {
      ...next,
      as_of: live.fetchedAt || next.as_of,
      copernicus: {
        ...next.copernicus,
        rows,
        headline,
      },
    };
  }

  if (live.maps?.length || live.photos?.length) {
    next = {
      ...next,
      copernicus: {
        ...next.copernicus,
        maps: live.maps?.length ? live.maps : next.copernicus?.maps,
        photos: live.photos?.length ? live.photos : next.copernicus?.photos,
      },
    };
  }

  return next;
}
