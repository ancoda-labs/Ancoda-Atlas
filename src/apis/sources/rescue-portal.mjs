// The OPMCM rescue portal's live counters.
//
// rescue.opmcm.gov.np is the Prime Minister's Office portal for the Rasuwa
// flood. Families file a missing person there, people in trouble file a request
// for help, and volunteers and hospitals file what they can offer. The home
// page publishes a running tally of all three under "हालको अवस्था / Current
// Situation", and this module reads the same JSON that page reads.
//
// What these counters are, and what they are not. They count filings, not
// people: one person can be reported missing by three relatives, and a family
// that finds their relative rarely comes back to close the report. So the
// portal's 5,000-odd missing reports are not a missing-persons toll and must
// never be added to, or reconciled against, the NDRRMA register or the sitrep
// figures. They are a measure of how much the public is asking for, which is a
// real and separate thing worth showing.
//
// Nothing here is recomputed. Every number is passed through as the portal
// states it, and a counter the portal omits comes back null rather than 0 —
// "the portal did not say" and "the portal said none" are different facts.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://rescue.opmcm.gov.np';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';

/** A counter as published, or null if it was missing or not a sane count. */
function count(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function emptyStats(error, fetchedAt, source) {
  return {
    requests: { total: null, open: null, critical: null, inProgress: null, resolved: null, cancelled: null },
    offers: { total: null, available: null, helping: null, completed: null, unavailable: null },
    persons: {
      total: null, lost: null, lostOpen: null, found: null, foundOpen: null,
      resolved: null, last24h: null, childrenMissing: null, elderlyMissing: null,
    },
    error,
    source,
    fetchedAt,
  };
}

/**
 * The portal's current counters.
 *
 * @returns {Promise<{requests: object, offers: object, persons: object,
 *   error: string|null, source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getRescuePortalStats() {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal', url: `${BASE}/` };

  try {
    const body = await safeFetch(`${BASE}/api/stats`, {
      timeout: 20_000,
      retries: 1,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!body || body.error) throw new Error(body?.error || 'no data');
    if (body.rawText) throw new Error('portal answered with something other than JSON');
    if (!body.success || !body.data) throw new Error('portal reported no data');

    const { requests = {}, offers = {}, persons = {} } = body.data;

    return {
      requests: {
        total: count(requests.total),
        open: count(requests.open),
        // A severity flag rather than a state: a critical request is also
        // counted under whichever state it sits in.
        critical: count(requests.critical),
        inProgress: count(requests.inProgress),
        resolved: count(requests.resolved),
        cancelled: count(requests.cancelled),
      },
      offers: {
        total: count(offers.total),
        available: count(offers.available),
        helping: count(offers.helping),
        completed: count(offers.completed),
        unavailable: count(offers.unavailable),
      },
      persons: {
        total: count(persons.total),
        lost: count(persons.lost),
        lostOpen: count(persons.lostOpen),
        found: count(persons.found),
        foundOpen: count(persons.foundOpen),
        resolved: count(persons.resolved),
        last24h: count(persons.last24h),
        childrenMissing: count(persons.childrenMissing),
        elderlyMissing: count(persons.elderlyMissing),
      },
      error: null,
      source,
      fetchedAt,
    };
  } catch (err) {
    console.error('[Rescue portal] Unavailable:', err.message);
    return emptyStats(err.message, fetchedAt, source);
  }
}

// ─── The portal's content endpoints ────────────────────────────────────────
//
// Beyond the counters, the same portal publishes four lists its own front page
// reads: what the government is doing, who to call, the missing-and-found
// register, and the geolocated help requests. Atlas reads them the same way —
// pass every value through as published, translate nothing, invent nothing.

const CONTENT_TTL_MS = 3 * 60 * 1000;
const contentCache = new Map();

async function cachedContent(key, loader) {
  const hit = contentCache.get(key);
  if (hit && Date.now() - hit.at < CONTENT_TTL_MS) return hit.value;
  const value = await loader();
  contentCache.set(key, { value, at: Date.now() });
  return value;
}

async function getPortalJson(path) {
  const body = await safeFetch(`${BASE}${path}`, {
    timeout: 20_000,
    retries: 1,
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!body || body.error) throw new Error(body?.error || 'no data');
  if (body.rawText) throw new Error('portal answered with something other than JSON');
  if (!body.success || !body.data) throw new Error('portal reported no data');
  return body.data;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A relative portal path made absolute, so the media proxy can sign it. */
function absolute(url) {
  const u = text(url);
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  return `${BASE}${u.startsWith('/') ? '' : '/'}${u}`;
}

/** A base64 data-URI thumbnail, kept only if it actually looks like one. */
function dataThumb(value) {
  const u = text(value);
  return u && u.startsWith('data:image/') ? u : null;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

/**
 * Split a government-effort description into its Nepali and English halves.
 *
 * The portal writes these as one string. Sometimes each half is flagged with a
 * 🇳🇵 / 🇬🇧 emoji, sometimes the two just sit in consecutive paragraphs. So the
 * split is by script: each paragraph is filed under whichever alphabet it is
 * mostly written in, the flag and the trailing "Official live updates" line are
 * dropped, and if a language ends up empty the other stands in for both.
 */
function splitBilingual(raw) {
  const source = text(raw);
  if (!source) return { en: null, ne: null };
  const paragraphs = source
    .split(/\n{2,}/)
    .map(p => p.replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}️]+/u, '').trim())
    .filter(Boolean)
    .filter(p => !/^📢|official live updates/i.test(p));

  const ne = [];
  const en = [];
  for (const p of paragraphs) {
    const deva = (p.match(/[ऀ-ॿ]/g) || []).length;
    const latin = (p.match(/[A-Za-z]/g) || []).length;
    (deva >= latin ? ne : en).push(p);
  }
  const neText = ne.join('\n\n') || null;
  const enText = en.join('\n\n') || null;
  return { en: enText || neText, ne: neText || enText };
}

/** Best-effort split of a "<Nepali> — <English>" title. */
function splitTitle(raw) {
  const t = text(raw);
  if (!t) return { title: null, titleNe: null };
  const parts = t.split(/\s+[—–-]\s+/);
  if (parts.length === 2) {
    const [a, b] = parts;
    if (DEVANAGARI.test(a) && LATIN.test(b) && !DEVANAGARI.test(b)) {
      return { title: b.trim(), titleNe: a.trim() };
    }
  }
  return { title: t, titleNe: t };
}

/**
 * What the government is doing, as the OPMCM portal logs it.
 *
 * @returns {Promise<{items: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getGovernmentEfforts({ limit = 20 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal — government efforts', url: `${BASE}/government-efforts` };
  try {
    return await cachedContent(`efforts:${limit}`, async () => {
      const data = await getPortalJson(`/api/government-efforts?limit=${Math.max(1, limit)}`);
      const rows = Array.isArray(data.items) ? data.items : [];
      const items = rows.map(r => {
        const { title, titleNe } = splitTitle(r.title);
        const { en, ne } = splitBilingual(r.description);
        return {
          id: text(r._id),
          title,
          titleNe,
          bodyEn: en,
          bodyNe: ne,
          agency: text(r.agency),
          district: text(r.district),
          province: text(r.province),
          link: text(r.link),
          createdAt: text(r.createdAt) || text(r.updatedAt),
        };
      });
      if (!items.length) throw new Error('no government-effort entries in the response');
      return { items, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error('[Rescue portal efforts] Unavailable:', err.message);
    return { items: [], error: err.message, source, fetchedAt };
  }
}

/**
 * The portal's emergency-contact directory.
 *
 * These are the portal's own words, English only — it does not publish a Nepali
 * twin for the name or the note. The flood desk shows them in their own section,
 * attributed to the portal, and does not fold them into the hand-verified
 * national lines it maintains separately.
 *
 * @returns {Promise<{items: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getEmergencyContacts({ limit = 50 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal — emergency contacts', url: `${BASE}/` };
  try {
    return await cachedContent(`contacts:${limit}`, async () => {
      const data = await getPortalJson(`/api/emergency-contacts?limit=${Math.max(1, limit)}`);
      const rows = Array.isArray(data.items) ? data.items : [];
      const items = rows
        .filter(r => r.isActive !== false)
        .map(r => ({
          id: text(r._id),
          name: text(r.name),
          nameNe: text(r.name_ne),
          organization: text(r.organization),
          category: text(r.category),
          phones: Array.isArray(r.phones) ? r.phones.map(text).filter(Boolean) : [],
          email: text(r.email),
          description: text(r.description),
          descriptionNe: text(r.description_ne),
          district: text(r.district),
          isNationwide: Boolean(r.isNationwide),
          available24x7: Boolean(r.available24x7),
        }))
        .filter(c => c.name && c.phones.length);
      if (!items.length) throw new Error('no emergency contacts in the response');
      return { items, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error('[Rescue portal contacts] Unavailable:', err.message);
    return { items: [], error: err.message, source, fetchedAt };
  }
}

/**
 * The portal's missing-and-found register.
 *
 * Every record is a named living person, filed by a relative or imported from a
 * District Administration Office. Nothing here is merged with the NDRRMA
 * register or the community bulletin — the same person may sit on several lists
 * under different spellings, and reconciling them by machine would either hide
 * someone still missing or announce a reunion that has not happened.
 *
 * The portal's `location.coordinates` on these rows is unreliable (sample rows
 * geolocate to other countries), so no coordinate is carried through — the
 * place is the text the filer typed.
 *
 * @param {{type: 'lost'|'found', limit?: number}} opts
 */
export async function getPersonReports({ type, limit = 200 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal — person reports', url: `${BASE}/` };
  try {
    return await cachedContent(`persons:${type}:${limit}`, async () => {
      const data = await getPortalJson(
        `/api/person-reports?type=${encodeURIComponent(type)}&limit=${Math.max(1, limit)}`,
      );
      const rows = Array.isArray(data.items) ? data.items : [];
      const items = rows.map(r => ({
        id: text(r._id),
        type: text(r.type) || type,
        name: text(r.fullName),
        age: text(r.approximateAge),
        gender: text(r.gender),
        place: text(r.locationText),
        eventAt: text(r.eventAt) || text(r.createdAt),
        description: text(r.description),
        status: text(r.status),
        daoStatus: text(r.daoStatus),
        daoOffice: text(r.daoOffice),
        origin: text(r.source),
        thumb: dataThumb(r.thumbnail),
        // Raw absolute URL — the caller signs it through the media proxy.
        image: absolute(Array.isArray(r.images) && r.images.length ? r.images[0] : r.imageUrl),
      }));
      return { items, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error(`[Rescue portal persons:${type}] Unavailable:`, err.message);
    return { items: [], error: err.message, source, fetchedAt };
  }
}

/** Both halves of the register in one call. */
export async function getPersonRegister() {
  const [lost, found] = await Promise.allSettled([
    getPersonReports({ type: 'lost' }),
    getPersonReports({ type: 'found' }),
  ]);
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal — person reports', url: `${BASE}/` };
  const errors = [lost, found]
    .filter(r => r.status === 'rejected' || r.value?.error)
    .map(r => String(r.reason?.message || r.value?.error))
    .filter(Boolean);
  return {
    lost: lost.status === 'fulfilled' ? lost.value.items : [],
    found: found.status === 'fulfilled' ? found.value.items : [],
    error: errors.length ? errors.join('; ') : null,
    source,
    fetchedAt,
  };
}

/**
 * Geolocated help requests, for the situation map.
 *
 * These are requests the public filed on the portal — one person in trouble can
 * be the subject of several — so they map demand, not casualties. Coordinates
 * outside Nepal are dropped as bad data.
 *
 * @returns {Promise<{requests: object[], error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getHelpRequestsMap({ limit = 200 } = {}) {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'OPMCM rescue portal — help requests', url: `${BASE}/` };
  // Nepal's bounding box, generous by ~0.2° — mirrors utils/nepal.mjs NEPAL_BBOX.
  const inNepal = (lat, lon) =>
    typeof lat === 'number' && typeof lon === 'number' &&
    lat >= 26.3 && lat <= 30.6 && lon >= 79.9 && lon <= 88.3;
  try {
    return await cachedContent(`map:${limit}`, async () => {
      const data = await getPortalJson(`/api/map?limit=${Math.max(1, limit)}`);
      const rows = Array.isArray(data.requests) ? data.requests : [];
      const requests = rows
        .map(r => {
          const coords = Array.isArray(r.location?.coordinates) ? r.location.coordinates : [];
          return {
            id: text(r._id),
            ref: text(r.referenceId),
            title: text(r.title),
            problemType: text(r.problemType),
            helpTypes: Array.isArray(r.helpTypes) ? r.helpTypes.map(text).filter(Boolean) : [],
            urgency: text(r.urgency),
            status: text(r.status),
            place: text(r.placeName),
            lon: typeof coords[0] === 'number' ? coords[0] : null,
            lat: typeof coords[1] === 'number' ? coords[1] : null,
          };
        })
        .filter(r => inNepal(r.lat, r.lon));
      return { requests, error: null, source, fetchedAt };
    });
  } catch (err) {
    console.error('[Rescue portal map] Unavailable:', err.message);
    return { requests: [], error: err.message, source, fetchedAt };
  }
}
