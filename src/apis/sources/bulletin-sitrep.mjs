// The live toll, from the Rasuwa flood bulletin's own figure panels.
//
// The headline figures on the overview used to be a reviewed JSON file typed in
// by hand from police briefings. That is the right way to hold numbers nobody
// publishes as data — and the wrong way to hold numbers that move every few
// hours. It went stale: the page said 469 dead while the compilation everyone
// else was reading said 579.
//
// The bulletin at nirajbhusal.github.io/rasuwa-flood-bulletin is the same
// compilation Atlas already cites as a source, and it does something unusual
// for a hand-built page — it keeps each headline figure beside its district
// split, and ships a full Nepali/English dictionary for every label. So this
// module reads both: the totals from the KPI strip, the parts from the panels
// under it, and the labels from the page's own i18n file. Nothing is
// translated here and no total is recomputed; where the bulletin's parts do not
// add up to its stated total, that survives into Atlas and is printed.
//
// Numerals arrive in Devanagari and are parsed, not reformatted — ५७९ is 579,
// and a value the page writes as "२००+" keeps its plus. A row whose value is a
// word rather than a number ("अलग", separate) is dropped: it is a note about
// the deployment, not a count of it.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://nirajbhusal.github.io/rasuwa-flood-bulletin';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';

/**
 * Which panel becomes which card.
 *
 * Titles stay Atlas's own rather than the bulletin's ("Deaths", not "Deaths
 * count"), so the ids and headings match the reviewed content this replaces and
 * a reader sees the same page with newer numbers in it. Everything below the
 * heading — totals, parts, labels, the source note — comes from the bulletin.
 */
const PANELS = [
  { panel: 'dead', id: 'deaths', tone: 'critical', title_en: 'Deaths', title_ne: 'मृत्यु' },
  { panel: 'injured', id: 'injured', tone: 'warning', title_en: 'Injured', title_ne: 'घाइते' },
  { panel: 'miss', id: 'uncontacted', tone: 'critical', title_en: 'Uncontacted', title_ne: 'सम्पर्कविहीन' },
  {
    panel: 'deploy',
    id: 'deployed',
    tone: 'positive',
    title_en: 'Personnel deployed',
    title_ne: 'परिचालित जनशक्ति',
    // Medical staff are not counted in the security total, and a helicopter is
    // not a person. The bulletin lists them in the same strip; Atlas draws
    // them outside the total, where they cannot be added in by eye.
    aside: ['d_medical', 'd_surgical', 'd_heli_n'],
  },
  {
    panel: 'air',
    id: 'air-rescue',
    tone: 'positive',
    title_en: 'Rescued by air',
    title_ne: 'हवाई उद्धार',
    // The rows here describe overlapping counts of the same operation — army
    // sorties inside the citizen figure, NDRRMA's own tally beside it — so the
    // arithmetic was never meant to close.
    overlapping: true,
    // The panel opens by restating its own headline figure. Once it is the
    // card's total, repeating it as the first part of itself reads as a
    // component of the thing it is.
    skip: ['d_heli'],
    // Aircraft and sorties, not people rescued. The bulletin's note is explicit
    // that the 14 helicopters are not 14 of the 1,976.
    aside: ['d_heli_n', 'd_ndrrma_heli', 'd_heli_flights'],
  },
];

const DEVA_DIGITS = '०१२३४५६७८९';

/**
 * A published figure as a number, or null if it is not one.
 *
 * The plus in "२००+" is meaning, not formatting: it is the bulletin saying the
 * real figure is higher than the one it can source. It comes back separately so
 * the card can print it too.
 */
function figure(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(/[०-९]/g, d => String(DEVA_DIGITS.indexOf(d))).replace(/,/g, '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(\+?)$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? { value, suffix: match[2] || undefined } : null;
}

/** The bulletin's own bilingual dictionary, keyed by its data-i18n attributes. */
function parseI18n(js) {
  const start = js.indexOf('{');
  if (start === -1) return { ne: {}, en: {} };
  // The file declares several objects in sequence, so the parse has to stop at
  // the end of the first rather than run to the last brace in the file.
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
  // A key the dictionary has not caught up with keeps the Nepali on both sides
  // rather than losing the row.
  return { label_en: en || ne, label_ne: ne || en };
}

/**
 * Each figure panel's own slice of the page, keyed by panel name.
 *
 * Sliced between one panel and the next rather than by matching a closing tag:
 * the panes contain nested divs, and the same data-panel names also sit on the
 * KPI buttons above them, so anything looser collects every row on the page
 * into whichever panel asked first.
 */
function panesIn(html) {
  const marks = [...html.matchAll(/<div class="ov-pane"[^>]*data-panel="(\w+)"[^>]*>/g)];
  const panes = new Map();
  marks.forEach((mark, i) => {
    const from = mark.index + mark[0].length;
    const to = i + 1 < marks.length ? marks[i + 1].index : Math.min(html.length, from + 8000);
    // Every pane closes with its own source note, and the rows all sit above
    // it. Cutting there keeps the last pane on the page from running on into
    // whatever section follows and collecting its numbers.
    const slice = html.slice(from, to);
    const note = slice.indexOf('class="ov-note"');
    panes.set(mark[1], note === -1 ? slice : slice.slice(0, note));
  });
  return panes;
}

function rowsIn(pane, dict) {
  const rows = [];
  const re = /<span data-i18n="([^"]+)">([^<]*)<\/span>[\s\S]{0,160}?<em class="num">([^<]*)<\/em>/g;
  let match;
  while ((match = re.exec(pane)) !== null) {
    const parsed = figure(match[3]);
    if (!parsed) continue;
    rows.push({ key: match[1], ...labelFor(dict, match[1], match[2].trim()), ...parsed });
  }
  return rows;
}

/** The stated total, taken from the KPI button rather than re-added from parts. */
function totalFor(html, panel) {
  const re = new RegExp(`id="kpi-${panel}"[\\s\\S]{0,400}?<strong class="num">([^<]*)</strong>`);
  const match = html.match(re);
  return match ? figure(match[1]) : null;
}

function noteFor(dict, panel, suffix) {
  const key = `ov_${panel}_${suffix}`;
  const ne = dict.ne?.[key] || null;
  const en = dict.en?.[key] || null;
  return { en: en || ne, ne: ne || en };
}

/**
 * The overview's headline figures, as the bulletin currently states them.
 *
 * @returns {Promise<{breakdowns: object[], asOfLabelEn: string|null,
 *   asOfLabelNe: string|null, error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getBulletinSitrep() {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'Rasuwa flood bulletin (compilation)', url: `${BASE}/` };

  try {
    const stamp = Date.now();
    const [html, i18n] = await Promise.all([
      safeFetch(`${BASE}/?t=${stamp}`, {
        as: 'text',
        timeout: 20_000,
        retries: 1,
        headers: { Accept: 'text/html', 'User-Agent': UA },
      }),
      safeFetch(`${BASE}/i18n.js?t=${stamp}`, {
        as: 'text',
        timeout: 20_000,
        retries: 1,
        headers: { Accept: 'application/javascript', 'User-Agent': UA },
      }),
    ]);
    if (typeof html !== 'string') throw new Error(html?.error || 'could not read the bulletin');
    if (typeof i18n !== 'string') throw new Error(i18n?.error || 'could not read the bulletin dictionary');

    const dict = parseI18n(i18n);
    const panes = panesIn(html);
    const breakdowns = [];

    for (const spec of PANELS) {
      const pane = panes.get(spec.panel);
      const total = totalFor(html, spec.panel);
      if (!pane || !total) continue;

      const skipKeys = new Set(spec.skip || []);
      const rows = rowsIn(pane, dict).filter(r => !skipKeys.has(r.key));
      const asideKeys = new Set(spec.aside || []);
      const items = rows.filter(r => !asideKeys.has(r.key));
      const aside = rows.filter(r => asideKeys.has(r.key));
      if (!items.length) continue;

      const caption = noteFor(dict, spec.panel, 'note');
      breakdowns.push({
        id: spec.id,
        total: total.value,
        suffix: total.suffix,
        tone: spec.tone,
        title_en: spec.title_en,
        title_ne: spec.title_ne,
        // The bulletin's own footnote for the panel, which carries the hour and
        // the reporting body the figure came from.
        caption_en: caption.en,
        caption_ne: caption.ne,
        items: items.map(({ key, ...item }) => item),
        aside: aside.map(({ key, ...item }) => ({ ...item, exclusive: true })),
        no_total_check: spec.overlapping || undefined,
      });
    }

    if (!breakdowns.length) throw new Error('no figure panels found — the bulletin markup has moved');

    // "Flood snapshot · 12 Bhadra" is the page's own dateline; only the date
    // half of it belongs on a line that already says "Figures as of".
    const dateline = key => {
      const text = dict[key]?.hero_overview || null;
      if (!text) return null;
      const parts = text.split('·');
      return (parts[parts.length - 1] || text).trim() || null;
    };

    return {
      breakdowns,
      asOfLabelEn: dateline('en'),
      asOfLabelNe: dateline('ne'),
      error: null,
      source,
      fetchedAt,
    };
  } catch (err) {
    console.error('[Bulletin sitrep] Unavailable:', err.message);
    return { breakdowns: [], asOfLabelEn: null, asOfLabelNe: null, error: err.message, source, fetchedAt };
  }
}
