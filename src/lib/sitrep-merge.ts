import type { BulletinSitrep, SitrepBreakdown, SitrepContent, SitrepDiscrepancy, SitrepHeadline } from '@/types';

/**
 * Which live panel updates which headline tile.
 *
 * The air-rescue panel is the SitRep helicopter total; the overview tile is
 * still labelled `heli` from when that figure lived only in reviewed JSON.
 */
const HEADLINE_FOR: Record<string, string> = {
  deaths: 'deaths',
  injured: 'injured',
  uncontacted: 'uncontacted',
  deployed: 'deployed',
  'air-rescue': 'heli',
};

function summed(breakdown: SitrepBreakdown): number {
  return (breakdown.items ?? []).reduce((acc, item) => acc + (item.value || 0), 0);
}

/**
 * Re-add every breakdown and report the ones that no longer close.
 *
 * Groups whose parts overlap rather than partition the total opt out with
 * `no_total_check`; for them the arithmetic was never meant to close.
 */
export function reconcile(breakdowns: SitrepBreakdown[] | undefined): SitrepDiscrepancy[] {
  const discrepancies: SitrepDiscrepancy[] = [];
  for (const breakdown of breakdowns ?? []) {
    if (breakdown.no_total_check) continue;
    const total = summed(breakdown);
    if (total !== breakdown.total) {
      discrepancies.push({ id: breakdown.id, stated: breakdown.total, summed: total });
    }
  }

  if (discrepancies.length) {
    console.error(
      '[Flood] SitRep figures do not reconcile:',
      discrepancies.map(d => `${d.id} states ${d.stated}, parts sum to ${d.summed}`).join('; '),
    );
  }
  return discrepancies;
}

/**
 * Whether a live panel is safe to lay over the reviewed group of the same id.
 *
 * Deaths never go down: this disaster's toll is recovered bodies, and a
 * compilation that has not caught up with Police would otherwise put 781 back
 * over 794. Other groups may fall (uncontacted, as people are found). A panel
 * whose parts do not add up to its stated total is left as reviewed — including
 * overlapping air-rescue rows. The bulletin's air KPI has drifted to NDRRMA's
 * all-rescued graphic (9,435 air and ground); that must not replace the
 * SitRep helicopter tile. `no_total_check` only silences the page warning.
 */
export function shouldOverlay(reviewed: SitrepBreakdown | undefined, live: SitrepBreakdown): boolean {
  if (live.total == null || !Number.isFinite(live.total)) return false;
  if (live.id === 'deaths' && reviewed && live.total < reviewed.total) return false;
  if (summed(live) !== live.total) return false;
  return true;
}

function overlayHeadline(
  headlines: SitrepHeadline[] | undefined,
  live: SitrepBreakdown,
  sourceLabel: string,
): SitrepHeadline[] | undefined {
  const headlineId = HEADLINE_FOR[live.id];
  if (!headlineId || !headlines?.length) return headlines;
  return headlines.map(h =>
    h.id === headlineId
      ? { ...h, value: live.total, suffix: live.suffix || h.suffix, source: sourceLabel, tone: live.tone, live: true }
      : h,
  );
}

/**
 * The reviewed toll with the bulletin's current figures laid over it.
 *
 * The reviewed file is a floor, not a ceiling. It holds groups the bulletin
 * does not publish; the bulletin publishes five that move every few hours.
 * A live group replaces the reviewed one of the same id when `shouldOverlay`
 * allows it. A failed read leaves the reviewed figures standing.
 */
export function mergeSitrep(reviewed: SitrepContent | null, live: BulletinSitrep | null): SitrepContent | null {
  if (!reviewed) return reviewed;
  if (!live || live.error || !live.breakdowns.length) return reviewed;

  const reviewedById = new Map((reviewed.breakdowns ?? []).map(b => [b.id, b]));
  const fresh = new Map(live.breakdowns.map(b => [b.id, b]));
  const seen = new Set<string>();
  let overlaid = false;
  let deathsOverlaid = false;
  let headlines = reviewed.headline;

  const breakdowns = (reviewed.breakdowns ?? []).map(b => {
    const replacement = fresh.get(b.id);
    if (!replacement || !shouldOverlay(b, replacement)) return b;
    seen.add(b.id);
    overlaid = true;
    if (b.id === 'deaths') deathsOverlaid = true;
    headlines = overlayHeadline(headlines, replacement, live.source.label);
    return { ...replacement, live: true };
  });

  for (const b of live.breakdowns) {
    if (seen.has(b.id) || reviewedById.has(b.id)) continue;
    if (!shouldOverlay(undefined, b)) continue;
    breakdowns.push({ ...b, live: true });
    overlaid = true;
    if (b.id === 'deaths') deathsOverlaid = true;
    headlines = overlayHeadline(headlines, b, live.source.label);
  }

  if (!overlaid) return { ...reviewed, discrepancies: reconcile(reviewed.breakdowns) };

  const sources = [...(reviewed.sources ?? [])];
  if (!sources.some(s => s.url === live.source.url)) sources.push(live.source);

  return {
    ...reviewed,
    breakdowns,
    headline: headlines,
    sources,
    as_of: deathsOverlaid ? live.fetchedAt || reviewed.as_of : reviewed.as_of,
    as_of_label_en: deathsOverlaid ? live.asOfLabelEn || reviewed.as_of_label_en : reviewed.as_of_label_en,
    as_of_label_ne: deathsOverlaid ? live.asOfLabelNe || reviewed.as_of_label_ne : reviewed.as_of_label_ne,
    discrepancies: reconcile(breakdowns),
  };
}
