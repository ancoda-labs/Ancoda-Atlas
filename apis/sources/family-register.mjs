// The community missing-and-found register.
//
// Families searching for someone after the Bhotekoshi flood file through two
// public Google Forms, and the results are published as JSON alongside the
// Rasuwa flood bulletin. It is not an official list — NDRRMA's register is the
// official one — but it is the larger of the two and it moves faster, because
// it is filled in by the people actually looking.
//
// Two things this module deliberately does not do. It does not merge these
// names with the NDRRMA register: the same person may appear on both under two
// spellings, and silently reconciling them would either hide a still-missing
// person or announce a rescue that has not happened. And it does not recompute
// the totals: the counts are reported as the register states them.

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://nirajbhusal.github.io/rasuwa-flood-bulletin';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';

function clean(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function person(row, status) {
  return {
    id: String(row.id || ''),
    name: clean(row.name),
    age: clean(String(row.age ?? '')),
    place: clean(row.place),
    when: clean(row.when),
    // The contact number is the mechanism the register works by: it is how
    // someone who has found a person reaches the family looking for them.
    phone: clean(row.phone),
    note: clean(row.note),
    source: clean(row.source) || null,
    status: clean(row.status) || status,
  };
}

/**
 * The current missing-and-found register.
 *
 * @returns {Promise<{missing: object[], found: object[], counts: object,
 *   forms: object, updatedAt: string|null, error: string|null,
 *   source: {label: string, url: string}, fetchedAt: string}>}
 */
export async function getFamilyRegister() {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'Rasuwa flood bulletin — missing and found', url: `${BASE}/#family` };

  try {
    const data = await safeFetch(`${BASE}/family.json?t=${Date.now()}`, {
      timeout: 20_000,
      retries: 1,
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!data || data.error) throw new Error(data?.error || 'no data');

    const missing = Array.isArray(data.missing) ? data.missing.map(r => person(r, 'missing')) : [];
    const found = Array.isArray(data.found) ? data.found.map(r => person(r, 'found')) : [];
    const matched = Array.isArray(data.matched) ? data.matched.map(r => person(r, 'matched')) : [];

    return {
      missing,
      found,
      matched,
      counts: { missing: missing.length, found: found.length, matched: matched.length },
      forms: {
        missing: clean(data.forms?.missing),
        found: clean(data.forms?.found),
      },
      sheet: clean(data.sheet),
      updatedAt: clean(data.updated_at),
      error: null,
      source,
      fetchedAt,
    };
  } catch (err) {
    console.error('[Family register] Unavailable:', err.message);
    return {
      missing: [],
      found: [],
      matched: [],
      counts: { missing: 0, found: 0, matched: 0 },
      forms: { missing: null, found: null },
      sheet: null,
      updatedAt: null,
      error: err.message,
      source,
      fetchedAt,
    };
  }
}
