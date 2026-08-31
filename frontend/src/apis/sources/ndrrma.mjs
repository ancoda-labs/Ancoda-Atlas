// NDRRMA rescue portal — the official rescued-persons register.
//
// The National Disaster Risk Reduction and Management Authority publishes the
// Rasuwa flood register behind ndrrma.gov.np/np/rasuwa/rescue as an open JSON
// API (the same list also answers at /np/rescue). It is the government's own
// reunification list, which is why Atlas reads it directly rather than
// transcribing the screenshots and handwritten sheets that circulate during a
// response — a transcription is one more place for a name to be misspelled, and
// a misspelled name is a family that does not find someone.
//
// Every record here describes a named living person. Nothing in this module
// invents, merges or infers: a field the portal leaves null stays null. The
// headline "rescued" graphic on the Rasuwa update page is a different count
// and is not folded into this register.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://ndrrma.gov.np/api/v1';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';
const PAGE = 200;
const TIMEOUT = 20_000;

/** Registers change on the order of minutes during a live response. */
const TTL_MS = 3 * 60 * 1000;
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { value, at: Date.now() });
  return value;
}

async function getJson(path) {
  return safeFetch(`${BASE}/${path}`, {
    timeout: TIMEOUT,
    retries: 1,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
}

/** Walk a paginated list endpoint to the end, with a hard cap on pages. */
async function collect(path, maxPages = 20) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const joiner = path.includes('?') ? '&' : '?';
    const data = await getJson(`${path}${joiner}limit=${PAGE}&offset=${page * PAGE}`);
    if (data?.error) throw new Error(data.error);
    const results = Array.isArray(data?.results) ? data.results : [];
    out.push(...results);
    if (!data?.next || results.length < PAGE) break;
  }
  return out;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function place(node) {
  if (!node) return null;
  const coords = node.centroid?.coordinates;
  return {
    id: node.id,
    title: text(node.title),
    titleNe: text(node.title_ne),
    lat: Array.isArray(coords) ? coords[1] ?? null : null,
    lon: Array.isArray(coords) ? coords[0] ?? null : null,
  };
}

const SOURCE = {
  label: 'NDRRMA Rasuwa flood update',
  url: 'https://ndrrma.gov.np/np/rasuwa/rescue',
};

/**
 * The full rescued-persons register.
 *
 * Names are carried through exactly as NDRRMA publishes them, including the
 * empty ones — a record with no name is still a rescue that happened, and
 * dropping it would make the register disagree with the official count.
 */
export async function getRescuedPersons() {
  return cached('persons', async () => {
    const rows = await collect('rescues/rescued-persons/');
    return rows.map(r => ({
      id: r.id,
      name: text(r.name),
      nameNe: text(r.name_ne),
      age: typeof r.age === 'number' ? r.age : null,
      gender: text(r.gender),
      nationality: text(r.nationality),
      // The portal states nationality as 'nepali' or 'foreign' and names the
      // country separately. Both are carried: "foreign" alone tells a reader
      // looking for a relative almost nothing, and the register holds people
      // from eleven countries.
      country: text(r.country),
      rescuedOn: text(r.rescued_date),
      rescuedAt: place(r.rescued_location),
      stationedAt: place(r.stationed_location),
      status: r.status ? { id: r.status.id, title: r.status.title, titleNe: text(r.status.title_ne) } : null,
      remarks: text(r.remarks),
    }));
  });
}

/**
 * The two lines NDRRMA puts above its own register — that it holds verified
 * names only, and that new names are added as they are confirmed. Carried
 * through so the rescue page can say the same thing the authority does.
 */
export async function getRescueMessages() {
  return cached('messages', async () => {
    const data = await getJson('rescues/messages/');
    if (data?.error) throw new Error(data.error);
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    return rows
      .map(r => ({ title: text(r.title), titleNe: text(r.title_ne) }))
      .filter(m => m.title || m.titleNe);
  });
}

/** Headline counts, as the portal totals them. Never recomputed locally. */
export async function getRescueSummary() {
  return cached('summary', async () => {
    const data = await getJson('rescues/status-counts/');
    if (data?.error) throw new Error(data.error);
    return {
      total: data.total_count ?? 0,
      nepali: data.nepali_count ?? 0,
      foreign: data.foreign_count ?? 0,
      byStatus: Array.isArray(data.status_counts)
        ? data.status_counts.map(s => ({ id: s.id, title: s.title, titleNe: s.title_ne, count: s.count ?? 0 }))
        : [],
    };
  });
}

export async function getRescueLocations() {
  return cached('locations', async () => {
    const [rescued, stationed] = await Promise.all([
      collect('rescues/rescued-locations/', 5),
      collect('rescues/stationed-locations/', 5),
    ]);
    return { rescued: rescued.map(place), stationed: stationed.map(place) };
  });
}

/**
 * Everything the rescue page needs, in one call.
 *
 * Partial failure is reported rather than hidden: during a response an empty
 * list and an unreachable portal mean very different things to someone looking
 * for a relative, and the page must be able to tell them apart.
 */
export async function getRescueRegister() {
  const [persons, summary, locations, messages] = await Promise.allSettled([
    getRescuedPersons(),
    getRescueSummary(),
    getRescueLocations(),
    getRescueMessages(),
  ]);

  // Notices above the register are optional flavour. A missing messages
  // endpoint must not hide the names — that is the page's actual job.
  const errors = [persons, summary, locations]
    .filter(r => r.status === 'rejected')
    .map(r => String(r.reason?.message || r.reason));

  return {
    persons: persons.status === 'fulfilled' ? persons.value : [],
    summary: summary.status === 'fulfilled' ? summary.value : null,
    locations: locations.status === 'fulfilled' ? locations.value : { rescued: [], stationed: [] },
    messages: messages.status === 'fulfilled' ? messages.value : [],
    error: errors.length ? errors.join('; ') : null,
    source: SOURCE,
    fetchedAt: new Date().toISOString(),
  };
}
