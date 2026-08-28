// NDRRMA's own notices — press releases and standing public advisories.
//
// Two small NDRRMA endpoints, both published bilingually as JSON:
//
//   pressnotenews/newsinfo/  — dated press notes from the authority, each with a
//   headline and a lead image. This is the government speaking in its own
//   voice, distinct from the newsroom reporting the Coverage page already
//   carries, so Atlas shows it under an "Official" heading and links back.
//
//   nationalbipadalerts/bipadalert/ — the standing advisories NDRRMA wants on
//   every disaster page right now (typically: verify information before sharing
//   it). Short text; the flood desk folds the current one into its ticker.
//
// Nothing is translated or rewritten here — both languages come straight from
// the API, and HTML in the advisory body is stripped to plain text.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://ndrrma.gov.np/api/v1';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';
const TIMEOUT = 20_000;
const TTL_MS = 15 * 60 * 1000;

const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { value, at: Date.now() });
  return value;
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stripHtml(value) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length ? text : null;
}

async function getJson(path) {
  const data = await safeFetch(`${BASE}/${path}`, {
    timeout: TIMEOUT,
    retries: 1,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!data || data.error) throw new Error(data?.error || 'no data');
  if (data.rawText) throw new Error('portal answered with something other than JSON');
  return data;
}

/**
 * Recent NDRRMA press notes, newest first.
 *
 * @returns {Promise<{items: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getPressReleases({ limit = 12 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'NDRRMA press notes', url: 'https://ndrrma.gov.np/np' };
  try {
    return await cached(`press:${limit}`, async () => {
      const data = await getJson(
        `pressnotenews/newsinfo/?omit=description,description_ne&limit=${Math.max(1, limit)}`,
      );
      const rows = Array.isArray(data.results) ? data.results : [];
      const items = rows.map(r => ({
        id: r.id,
        title: clean(r.title),
        titleNe: clean(r.title_ne),
        summary: clean(r.summary),
        summaryNe: clean(r.summary_ne),
        date: clean(r.date),
        // Raw upstream URL — the caller signs it through the media proxy.
        image: clean(r.image),
      }));
      if (!items.length) throw new Error('no press notes in the response');
      return { items, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error('[NDRRMA press] Unavailable:', err.message);
    return { items: [], error: err.message, source, fetchedAt };
  }
}

/**
 * The standing national advisories NDRRMA is publishing right now.
 *
 * @returns {Promise<{advisories: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getNationalAdvisories() {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'NDRRMA national advisory', url: 'https://ndrrma.gov.np/np' };
  try {
    return await cached('advisories', async () => {
      const data = await getJson('nationalbipadalerts/bipadalert/');
      const rows = Array.isArray(data.results) ? data.results : [];
      const advisories = rows.map(r => ({
        id: r.id,
        title: clean(r.title),
        titleNe: clean(r.title_ne),
        body: stripHtml(r.description) || clean(r.title),
        bodyNe: stripHtml(r.description_ne) || clean(r.title_ne),
        links: Array.isArray(r.important_links)
          ? r.important_links.map(l => ({ name: clean(l.name), link: clean(l.link) })).filter(l => l.link)
          : [],
        numbers: Array.isArray(r.important_numbers)
          ? r.important_numbers
              .map(n => ({
                name: clean(n.name) || clean(n.name_ne),
                designation: clean(n.designation) || clean(n.designation_ne),
                number: clean(n.number) || clean(n.phone) || clean(n.mobile),
              }))
              .filter(n => n.number)
          : [],
      }));
      return { advisories, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error('[NDRRMA advisory] Unavailable:', err.message);
    return { advisories: [], error: err.message, source, fetchedAt };
  }
}
