// ReliefWeb — UN OCHA humanitarian tracking, filtered to Nepal
// Nepal is a standing ReliefWeb country: monsoon floods, landslides,
// earthquakes and the post-2015 recovery all report through here.
// Requires approved appname since Nov 2025. Register at https://apidoc.reliefweb.int/parameters#appname
// Falls back to HDX (Humanitarian Data Exchange) when ReliefWeb rejects the call.

import { safeFetch } from '../utils/fetch.mjs';
import { NEPAL_ISO } from '../utils/nepal.mjs';

// v1 was decommissioned and now answers every call with HTTP 410.
const BASE = 'https://api.reliefweb.int/v2';
// Register your own appname at https://apidoc.reliefweb.int/parameters#appname
// and replace this value. Without an approved appname the API returns 403.
const APPNAME = process.env.RELIEFWEB_APPNAME || 'atlas';

const HDX_BASE = 'https://data.humdata.org/api/3/action';

// POST-based search for reports (ReliefWeb API v2 POST format)
async function rwPost(endpoint, body) {
  const url = `${BASE}/${endpoint}?appname=${APPNAME}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Atlas/1.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
    }
    return await res.json();
  } catch (e) {
    return { error: e.message, source: url };
  }
}

// Search recent reports via ReliefWeb API (POST method)
export async function searchReports(opts = {}) {
  const { query = '', limit = 25 } = opts;
  const body = {
    limit,
    filter: { field: 'country.iso3', value: NEPAL_ISO.alpha3.toLowerCase() },
    fields: {
      include: [
        'title',
        'date.created',
        'country.name',
        'disaster_type.name',
        'url_alias',
        'source.name',
      ],
    },
    sort: ['date.created:desc'],
  };
  if (query) {
    body.query = { value: query };
  }
  return rwPost('reports', body);
}

// Get active disasters via ReliefWeb API (POST method)
export async function getDisasters(opts = {}) {
  const { limit = 25 } = opts;
  const body = {
    limit,
    fields: {
      include: ['name', 'date.created', 'country.name', 'type.name', 'status'],
    },
    filter: {
      operator: 'AND',
      conditions: [
        { field: 'status', value: 'ongoing' },
        { field: 'country.iso3', value: NEPAL_ISO.alpha3.toLowerCase() },
      ],
    },
    sort: ['date.created:desc'],
  };
  return rwPost('disasters', body);
}

// Fallback: search HDX (Humanitarian Data Exchange) for Nepal hazard datasets.
// HDX's Nepal group carries everything from trade statistics to refugee
// surveys, so the results are filtered down to natural-hazard datasets here.
// Deliberately narrow. Broader words like "humanitarian", "emergency" and
// "risk" pull in nutrition, COVID and refugee datasets that have nothing to do
// with a natural hazard.
const HDX_HAZARD_TERMS = [
  'earthquake', 'seismic', 'aftershock',
  'flood', 'inundation', 'landslide', 'avalanche', 'glof', 'glacial', 'glacier',
  'monsoon', 'rainfall', 'precipitation', 'cyclone', 'storm', 'drought',
  'heat wave', 'heatwave', 'cold wave', 'wildfire', 'forest fire',
  'natural hazard', 'natural disaster', 'disaster risk', 'hazard exposure',
  'damage assessment', 'disaster response', 'disaster management',
];

function isHazardDataset(pkg) {
  const text = `${pkg.title || ''} ${pkg.notes || ''} ${(pkg.tags || []).map(t => t.name || '').join(' ')}`.toLowerCase();
  return HDX_HAZARD_TERMS.some(term => text.includes(term));
}

function mentionsNepalDataset(pkg) {
  const groups = (pkg.groups || []).map(g => (g.name || g.display_name || '').toLowerCase());
  if (groups.some(g => g === 'npl' || g.includes('nepal'))) return true;
  return `${pkg.title || ''}`.toLowerCase().includes('nepal');
}

async function hdxFallback(limit = 15) {
  const data = await safeFetch(
    `${HDX_BASE}/package_search?q=groups:npl&rows=${limit * 4}&sort=metadata_modified+desc`
  );
  if (data?.result?.results) {
    return data.result.results
      .filter(pkg => mentionsNepalDataset(pkg) && isHazardDataset(pkg))
      .slice(0, limit)
      .map(pkg => ({
        title: pkg.title,
        date: pkg.metadata_modified,
        source: pkg.dataset_source || pkg.organization?.title,
        countries: pkg.groups?.map(g => g.display_name),
        url: `https://data.humdata.org/dataset/${pkg.name}`,
      }));
  }
  return [];
}

// Briefing — get latest humanitarian crises
export async function briefing() {
  const [reports, disasters] = await Promise.all([
    searchReports({ limit: 15 }),
    getDisasters({ limit: 15 }),
  ]);

  const rwFailed = !!reports?.error || !!disasters?.error;

  let latestReports = [];
  let activeDisasters = [];
  let hdxDatasets = [];

  if (!rwFailed) {
    latestReports = (reports?.data || []).map(r => ({
      title: r.fields?.title,
      date: r.fields?.date?.created,
      countries: r.fields?.country?.map(c => c.name),
      disasterType: r.fields?.disaster_type?.map(d => d.name),
      source: r.fields?.source?.map(s => s.name),
      url: r.fields?.url_alias
        ? `https://reliefweb.int${r.fields.url_alias}`
        : null,
    }));
    activeDisasters = (disasters?.data || []).map(d => ({
      name: d.fields?.name,
      date: d.fields?.date?.created,
      countries: d.fields?.country?.map(c => c.name),
      type: d.fields?.type?.map(t => t.name),
      status: d.fields?.status,
    }));
  } else {
    // Fallback to HDX when ReliefWeb returns 403 (unapproved appname)
    hdxDatasets = await hdxFallback(15);
  }

  return {
    source: rwFailed ? 'HDX (Humanitarian Data Exchange) — ReliefWeb fallback' : 'ReliefWeb (UN OCHA)',
    timestamp: new Date().toISOString(),
    // Degraded rather than failed: HDX still answers, but with dataset
    // listings instead of live situation reports and declared disasters.
    stale: rwFailed,
    ...(rwFailed
      ? {
          rwError: reports?.error || disasters?.error,
          rwNote: 'ReliefWeb API requires an approved appname since Nov 2025. Set RELIEFWEB_APPNAME env var after registering at https://apidoc.reliefweb.int/parameters#appname',
          activeDisasters: [],
          latestReports: hdxDatasets,
          hdxDatasets,
        }
      : {
          latestReports,
          activeDisasters,
        }),
  };
}

if (process.argv[1]?.endsWith('reliefweb.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
