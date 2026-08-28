// NDRRMA's national Daily Disaster Bulletin.
//
// Every day the National Disaster Risk Reduction and Management Authority
// publishes a one-paragraph situation summary for the whole country — how many
// disaster incidents in the last 24 hours, how many dead, how many missing —
// with the full bulletin attached as a PDF. It is published bilingually as
// structured JSON at ndrrma.gov.np/api/v1/bulletin/bulletins/.
//
// This is national context, not the Bhotekoshi corridor toll. The flood desk
// shows it under its own heading with the date it covers, and never folds its
// figures into the corridor sitrep — a nationwide 24-hour count and a
// cumulative corridor count are different things and must not be added.
//
// Nothing here is parsed out of the summary sentence or recomputed: the text is
// carried through as NDRRMA wrote it, in both languages, and the reader is
// pointed at the PDF for the detail.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://ndrrma.gov.np/api/v1';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';
const TIMEOUT = 20_000;

/** The bulletin changes once a day; a 15-minute cache is plenty. */
const TTL_MS = 15 * 60 * 1000;
let cache = null;

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * The most recent daily bulletins, newest first.
 *
 * @returns {Promise<{bulletins: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getDailyBulletins({ limit = 5 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'NDRRMA Daily Disaster Bulletin', url: 'https://ndrrma.gov.np/np' };

  if (cache && Date.now() - cache.at < TTL_MS) return { ...cache.value, fetchedAt: cache.value.fetchedAt };

  try {
    const data = await safeFetch(`${BASE}/bulletin/bulletins/?limit=${Math.max(1, limit) + 4}`, {
      timeout: TIMEOUT,
      retries: 1,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!data || data.error) throw new Error(data?.error || 'no data');
    if (data.rawText) throw new Error('portal answered with something other than JSON');

    const rows = Array.isArray(data.results) ? data.results : [];
    const bulletins = rows
      .filter(r => (r.bulletin_type?.bul_type || '').toLowerCase().includes('daily'))
      .slice(0, limit)
      .map(r => ({
        id: r.id,
        title: clean(r.title),
        titleNe: clean(r.title_ne),
        summary: clean(r.summary),
        summaryNe: clean(r.summary_ne),
        date: clean(r.date),
        pdfUrl: clean(r.pdffile),
        // Raw upstream URL — the caller signs it through the media proxy.
        image: clean(r.image),
      }));

    if (!bulletins.length) throw new Error('no daily bulletins in the response');

    const value = { bulletins, error: null, source, fetchedAt };
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error('[NDRRMA bulletin] Unavailable:', err.message);
    return { bulletins: [], error: err.message, source, fetchedAt };
  }
}
