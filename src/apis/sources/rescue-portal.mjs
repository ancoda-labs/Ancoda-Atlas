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
