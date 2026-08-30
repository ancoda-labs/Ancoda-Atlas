// The Copernicus EMSR927 grading, from the Rasuwa flood bulletin's damage page.
//
// Copernicus does not publish this AOI as a live GeoJSON API Atlas can poll.
// The bulletin at nirajbhusal.github.io/rasuwa-flood-bulletin/damage.html is
// the same compilation Atlas already cites, and it reprints the EMSR927
// AOI01 Syapru Besi table in a scrapeable form — KPI strip, full class table,
// bilingual dictionary, and the grading maps (overview, details, infographic)
// that live in the bulletin's img folder. This module reads those. It does
// not scrape the page's "Damage (preliminary)" news log: those are stale
// early death counts that would fight the Police sitrep.
//
// Ground photographs are only the Syabrubesi / Timure frames on photos.html.
// Casualty infographics stay off this feed.
//
// The NEA plant table on the same page is a dated government notice. It stays
// in reviewed JSON; this scrape is Copernicus only.
//
// Numerals arrive in Devanagari. "~450" keeps its tilde (approximate), "5/5"
// takes the first number, and a dash is a missing cell rather than a zero.
// A scrape whose building arithmetic does not close is still returned;
// mergeDamage leaves the reviewed table standing rather than publishing it.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://nirajbhusal.github.io/rasuwa-flood-bulletin';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';

const DEVA_DIGITS = '०१२३४५६७८९';

const ROW_FOR = {
  ems_r_slide: { id: 'landslide', group: 'hazard' },
  ems_r_pop: { id: 'population', group: 'people' },
  ems_r_res: { id: 'residential', group: 'buildings' },
  ems_r_inst: { id: 'institutional', group: 'buildings' },
  ems_r_school: { id: 'school', group: 'buildings' },
  ems_r_otherb: { id: 'other-nonres', group: 'buildings' },
  ems_r_rel: { id: 'religious', group: 'buildings' },
  ems_r_allb: { id: 'all-buildings', group: 'buildings' },
  ems_r_pri: { id: 'primary-road', group: 'transport' },
  ems_r_loc: { id: 'local-road', group: 'transport' },
  ems_r_cart: { id: 'cart-track', group: 'transport' },
  ems_r_br: { id: 'bridges', group: 'transport' },
  ems_r_heli: { id: 'helipad', group: 'transport' },
  ems_r_pp: { id: 'power-plant', group: 'facilities' },
  ems_r_wet: { id: 'wetland', group: 'landcover' },
  ems_r_otherlu: { id: 'other-landuse', group: 'landcover' },
  ems_r_agri: { id: 'agriculture', group: 'landcover' },
  ems_r_shrub: { id: 'shrub', group: 'landcover' },
  ems_r_forest: { id: 'forest', group: 'landcover' },
  ems_r_alllc: { id: 'all-landcover', group: 'landcover' },
};

const KPI_FOR = {
  ems_k_slide: { id: 'landslide', tone: 'critical' },
  ems_k_pop: { id: 'population', tone: 'warning' },
  ems_k_built: { id: 'buildings', tone: 'critical' },
  ems_k_res: { id: 'residential', tone: 'critical' },
  ems_k_road: { id: 'road', tone: 'warning' },
  ems_k_br: { id: 'bridges', tone: 'critical' },
  ems_k_pp: { id: 'power', tone: 'critical' },
  ems_k_heli: { id: 'helipad', tone: 'warning' },
};

const IMG_HOST = `${BASE}/img`;
const GITHUB_IMG = 'https://api.github.com/repos/nirajbhusal/rasuwa-flood-bulletin/contents/img';

/** Product-name captions when a map file has no figcaption. Not image descriptions. */
const MAP_CAPTION = {
  overview: { caption_en: 'EMSR927 AOI01 grading overview', caption_ne: 'EMSR927 AOI01 ग्रेडिङ अवलोकन' },
  detail: { caption_en: 'EMSR927 AOI01 grading detail', caption_ne: 'EMSR927 AOI01 ग्रेडिङ विवरण' },
  infographic: { caption_en: 'EMSR927 grading infographic', caption_ne: 'EMSR927 ग्रेडिङ इन्फोग्राफिक' },
};

/**
 * Reviewed flood-path coordinates for caption-matched AOI photographs.
 * These are place pins, not GPS of the shutter.
 */
const AOI_PLACES = [
  { id: 'timure', re: /timure|टिमुरे/i, lat: 28.207, lon: 85.334 },
  { id: 'syaphrubesi', re: /syafru|syabru|स्याफ्रु/i, lat: 28.161, lon: 85.336 },
];

const SKIP_PHOTO = /nepal-police|sitrep|ndrrma|pmdrf|us-state|jaishankar|family-|qr-|indians|foreign-rescued|copernicus|ems927/i;

const UNIT_FOR = {
  landslide: { unit_en: 'ha', unit_ne: 'हे' },
  road: { unit_en: 'km', unit_ne: 'कि.मी.' },
  'primary-road': { unit_en: 'km', unit_ne: 'कि.मी.' },
  'local-road': { unit_en: 'km', unit_ne: 'कि.मी.' },
  'cart-track': { unit_en: 'km', unit_ne: 'कि.मी.' },
  helipad: { unit_en: 'ha', unit_ne: 'हे' },
  'power-plant': { unit_en: 'ha', unit_ne: 'हे' },
  power: { unit_en: 'ha', unit_ne: 'हे' },
  wetland: { unit_en: 'ha', unit_ne: 'हे' },
  'other-landuse': { unit_en: 'ha', unit_ne: 'हे' },
  agriculture: { unit_en: 'ha', unit_ne: 'हे' },
  shrub: { unit_en: 'ha', unit_ne: 'हे' },
  forest: { unit_en: 'ha', unit_ne: 'हे' },
  'all-landcover': { unit_en: 'ha', unit_ne: 'हे' },
};

function asciiDigits(raw) {
  return String(raw).replace(/[०-९]/g, d => String(DEVA_DIGITS.indexOf(d)));
}

/**
 * A published Copernicus figure, or null if the cell is a dash or a word.
 *
 * "~450" keeps approximate. "5/5" returns the first number (destroyed of
 * five in the AOI). A trailing plus is meaning, the same as the sitrep parser.
 */
export function parseDamageFigure(raw) {
  if (typeof raw !== 'string') return null;
  let text = asciiDigits(raw).replace(/,/g, '').replace(/[—–−]/g, '-').trim();
  if (!text || text === '-') return null;

  const approximate = /^[~≈]/.test(text);
  if (approximate) text = text.replace(/^[~≈]\s*/, '');

  const plus = text.includes('+');
  text = text.replace(/\+/g, ' ').trim();

  // Leading number only — trailing units ("हे", "किमि") are not \b-word
  // characters, so they cannot be stripped with a word-boundary regex.
  const slash = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*\d+(?:\.\d+)?/);
  if (slash) {
    const value = Number(slash[1]);
    return Number.isFinite(value)
      ? { value, suffix: plus ? '+' : undefined, approximate: approximate || undefined }
      : null;
  }

  const match = text.match(/^(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value)
    ? { value, suffix: plus ? '+' : undefined, approximate: approximate || undefined }
    : null;
}

function parseShare(raw) {
  const text = asciiDigits(raw).replace(/\s/g, '');
  const match = text.match(/^(\d+(?:\.\d+)?)%$/);
  return match ? `${match[1]}%` : null;
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** The bulletin's own bilingual dictionary, keyed by its data-i18n attributes. */
function parseI18n(js) {
  const start = js.indexOf('{');
  if (start === -1) return { ne: {}, en: {} };
  const decoder = new (class {
    decode(text) {
      for (let end = text.length; end > 1; end = text.lastIndexOf('}', end - 1)) {
        try {
          return JSON.parse(text.slice(0, end + 1));
        } catch {
          /* keep walking back to the previous closing brace */
        }
      }
      return null;
    }
  })();
  return decoder.decode(js.slice(start)) || { ne: {}, en: {} };
}

function labelFor(dict, key, fallbackNe) {
  const ne = dict.ne?.[key] || fallbackNe || null;
  const en = dict.en?.[key] || null;
  return { label_en: en || ne, label_ne: ne || en };
}

/**
 * The Copernicus class table — first `table.plants` on the page, before the
 * NEA plant list that reuses the same class under #power.
 */
export function plantsTableHtml(html) {
  const power = html.search(/id=["']power["']/);
  const slice = power === -1 ? html : html.slice(0, power);
  const start = slice.indexOf('<table class="plants">');
  if (start === -1) return null;
  const end = slice.indexOf('</table>', start);
  return end === -1 ? null : slice.slice(start, end + '</table>'.length);
}

function cellsIn(tr) {
  return [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
}

/**
 * One grading row per class, numbers as the bulletin printed them.
 */
export function parseCopernicusTable(html, dict = { ne: {}, en: {} }) {
  const table = plantsTableHtml(html);
  if (!table) return [];
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/g;
  let tr;
  while ((tr = trRe.exec(table)) !== null) {
    const body = tr[1];
    const keyMatch = body.match(/data-i18n="(ems_r_[^"]+)"/);
    if (!keyMatch) continue;
    const spec = ROW_FOR[keyMatch[1]];
    if (!spec) continue;
    const cells = cellsIn(body);
    if (cells.length < 7) continue;
    const fallback = stripTags(cells[0]);
    const destroyed = parseDamageFigure(stripTags(cells[1]));
    const damaged = parseDamageFigure(stripTags(cells[2]));
    const possible = parseDamageFigure(stripTags(cells[3]));
    const affected = parseDamageFigure(stripTags(cells[4]));
    const aoi = parseDamageFigure(stripTags(cells[5]));
    const share = parseShare(stripTags(cells[6]));
    const approximate = Boolean(affected?.approximate || aoi?.approximate);
    rows.push({
      id: spec.id,
      group: spec.group,
      ...labelFor(dict, keyMatch[1], fallback),
      ...(UNIT_FOR[spec.id] || {}),
      destroyed: destroyed ? destroyed.value : null,
      damaged: damaged ? damaged.value : null,
      possible: possible ? possible.value : null,
      affected: affected ? affected.value : null,
      aoi: aoi ? aoi.value : null,
      share,
      approximate: approximate || undefined,
    });
  }
  return rows;
}

export function parseCopernicusKpis(html, dict = { ne: {}, en: {} }) {
  const headline = [];
  const re =
    /<span class="kpi-k" data-i18n="(ems_k_[^"]+)">([^<]*)<\/span>\s*<strong class="num">([^<]*)<\/strong>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const spec = KPI_FOR[match[1]];
    if (!spec) continue;
    const parsed = parseDamageFigure(match[3]);
    if (!parsed) continue;
    const labels = labelFor(dict, `${match[1]}_sub`, match[2].trim());
    headline.push({
      id: spec.id,
      value: parsed.value,
      suffix: parsed.suffix,
      approximate: parsed.approximate,
      tone: spec.tone,
      source: 'EMSR927',
      label_en: labels.label_en,
      label_ne: labels.label_ne,
      ...(UNIT_FOR[spec.id] || {}),
    });
  }
  return headline;
}

function absUrl(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const path = String(src).replace(/^\.\//, '').replace(/^\//, '');
  return `${BASE}/${path}`;
}

function idFromSrc(src) {
  const file = String(src).split('/').pop() || '';
  return file.replace(/\.(jpe?g|png|webp)$/i, '').replace(/^today-\d{4}-\d{2}-\d{2}-/, '');
}

/**
 * Which Copernicus product a filename is, or null if it is a thumbnail, the
 * table screenshot, a PDF, or not an EMSR927 map.
 */
export function classifyCopernicusMap(src) {
  const file = String(src).split('/').pop() || '';
  if (!/copernicus-ems927/i.test(file)) return null;
  if (/-sm\./i.test(file) || /table\./i.test(file) || /\.pdf$/i.test(file)) return null;
  if (/overview/i.test(file)) return 'overview';
  if (/infographic/i.test(file)) return 'infographic';
  if (/detail/i.test(file)) return 'detail';
  return 'detail';
}

function placeFor(hay) {
  for (const place of AOI_PLACES) {
    if (place.re.test(hay)) return place;
  }
  return null;
}

/**
 * `figure.photo` cards: src, alt, bilingual caption from figcaption
 * (`<strong>` Nepali, remainder English).
 */
export function parseBulletinFigures(html) {
  if (typeof html !== 'string' || !html) return [];
  const figures = [];
  const re = /<figure class="photo">([\s\S]*?)<\/figure>/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const body = match[1];
    const srcMatch = body.match(/<img\b[^>]*\ssrc="([^"]+)"/i);
    if (!srcMatch) continue;
    const src = absUrl(srcMatch[1]);
    if (!src) continue;
    const altMatch = body.match(/<img\b[^>]*\salt="([^"]*)"/i);
    const hrefMatch = body.match(/<a\b[^>]*\shref="([^"]+)"/i);
    const capMatch = body.match(/<figcaption>([\s\S]*?)<\/figcaption>/i);
    const alt = altMatch ? altMatch[1] : '';
    let caption_ne = null;
    let caption_en = null;
    if (capMatch) {
      const strong = capMatch[1].match(/<strong>([\s\S]*?)<\/strong>/);
      caption_ne = strong ? stripTags(strong[1]) : null;
      const rest = stripTags(capMatch[1].replace(/<strong>[\s\S]*?<\/strong>/, ''));
      caption_en = rest || null;
    }
    figures.push({
      id: idFromSrc(src),
      src,
      href: hrefMatch ? absUrl(hrefMatch[1]) : src,
      alt,
      caption_en: caption_en || alt || null,
      caption_ne: caption_ne || alt || null,
    });
  }
  return figures;
}

function mapFromSrc(src, extra = {}) {
  const kind = classifyCopernicusMap(src);
  if (!kind) return null;
  const named = MAP_CAPTION[kind] || MAP_CAPTION.detail;
  return {
    id: idFromSrc(src),
    kind,
    src,
    href: extra.href || src,
    alt: extra.alt || named.caption_en,
    caption_en: extra.caption_en || named.caption_en,
    caption_ne: extra.caption_ne || named.caption_ne,
  };
}

function sortMaps(maps) {
  const rank = { overview: 0, detail: 1, infographic: 2 };
  return [...maps].sort((a, b) => {
    const byKind = (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9);
    return byKind !== 0 ? byKind : String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Copernicus product maps: figures on damage.html / photos.html, then any
 * EMSR927 files listed in the bulletin's img folder that the HTML omitted.
 */
export function collectCopernicusMaps(html, photosHtml = '', listed = []) {
  const byId = new Map();
  const take = item => {
    if (!item || byId.has(item.id)) return;
    byId.set(item.id, item);
  };
  for (const fig of [...parseBulletinFigures(html), ...parseBulletinFigures(photosHtml)]) {
    take(mapFromSrc(fig.src, fig));
  }
  for (const src of listed) take(mapFromSrc(src));
  return sortMaps([...byId.values()]);
}

/**
 * Syabrubesi / Timure ground photographs. Casualty infographics and the
 * Copernicus table screenshots stay off this list.
 */
export function parseAoiPhotos(html) {
  const photos = [];
  for (const fig of parseBulletinFigures(html)) {
    const hay = `${fig.src} ${fig.alt} ${fig.caption_en || ''} ${fig.caption_ne || ''}`;
    if (SKIP_PHOTO.test(hay)) continue;
    const place = placeFor(hay);
    if (!place) continue;
    photos.push({
      id: fig.id,
      kind: 'photo',
      src: fig.src,
      href: fig.href,
      alt: fig.alt,
      caption_en: fig.caption_en,
      caption_ne: fig.caption_ne,
      lat: place.lat,
      lon: place.lon,
      place_id: place.id,
    });
    if (photos.length >= 8) break;
  }
  return photos;
}

async function listCopernicusFiles() {
  const body = await safeFetch(GITHUB_IMG, {
    timeout: 12_000,
    retries: 0,
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': UA },
  });
  if (!Array.isArray(body)) return [];
  return body
    .filter(f => f && f.type === 'file' && typeof f.name === 'string' && classifyCopernicusMap(f.name))
    .map(f => `${IMG_HOST}/${f.name}`);
}

const emptyLive = (source, fetchedAt, error) => ({
  rows: [],
  headline: [],
  maps: [],
  photos: [],
  asOfLabelEn: null,
  asOfLabelNe: null,
  error,
  source,
  fetchedAt,
});

/**
 * The EMSR927 AOI01 table, as the bulletin currently states it, plus the
 * grading maps and Syabrubesi / Timure photographs the same compilation hosts.
 *
 * @returns {Promise<{rows: object[], headline: object[], maps: object[], photos: object[],
 *   asOfLabelEn: string|null, asOfLabelNe: string|null, error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getBulletinDamage() {
  const fetchedAt = new Date().toISOString();
  const source = {
    label: 'Rasuwa flood bulletin (compilation)',
    url: `${BASE}/damage.html`,
  };

  try {
    const stamp = Date.now();
    const page = (path, accept) =>
      safeFetch(`${BASE}/${path}?t=${stamp}`, {
        as: 'text',
        timeout: 20_000,
        retries: 1,
        headers: { Accept: accept, 'User-Agent': UA },
      });
    const [html, i18n, photosHtml, listed] = await Promise.all([
      page('damage.html', 'text/html'),
      page('i18n.js', 'application/javascript'),
      page('photos.html', 'text/html'),
      listCopernicusFiles().catch(() => []),
    ]);
    if (typeof html !== 'string') throw new Error(html?.error || 'could not read the bulletin damage page');
    if (typeof i18n !== 'string') throw new Error(i18n?.error || 'could not read the bulletin dictionary');

    const dict = parseI18n(i18n);
    const rows = parseCopernicusTable(html, dict);
    const headline = parseCopernicusKpis(html, dict);
    if (!rows.length) throw new Error('no Copernicus table found — the bulletin markup has moved');

    const photosPage = typeof photosHtml === 'string' ? photosHtml : '';
    const maps = collectCopernicusMaps(html, photosPage, listed);
    const photos = parseAoiPhotos(photosPage);

    const dateline = lang => {
      const text = dict[lang]?.brand_date || null;
      if (!text) return null;
      const parts = text.split('·');
      return (parts[0] || text).trim() || null;
    };

    return {
      rows,
      headline,
      maps,
      photos,
      asOfLabelEn: dateline('en'),
      asOfLabelNe: dateline('ne'),
      error: null,
      source,
      fetchedAt,
    };
  } catch (err) {
    console.error('[Bulletin damage] Unavailable:', err.message);
    return emptyLive(source, fetchedAt, err.message);
  }
}
