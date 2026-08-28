// Scraper for community rescue and treatment lists from the Rasuwa Flood Bulletin.
//
// These lists are hardcoded directly inside the HTML page because they are compiled
// manually or statically. We fetch the raw HTML, parse each table body by ID,
// and extract the row cells (including names and addresses).

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://nirajbhusal.github.io/rasuwa-flood-bulletin';
const UA = 'AncodaAtlas/4.0 (Nepal hazard monitoring; +https://github.com/ancoda-labs/Ancoda-Atlas)';

function cleanHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '') // remove HTML tags
    .replace(/\s+/g, ' ')   // normalize whitespace
    .trim();
}

function parseTable(html, bodyId) {
  const startIdx = html.indexOf(`id="${bodyId}"`);
  if (startIdx === -1) return [];
  const endIdx = html.indexOf('</tbody>', startIdx);
  if (endIdx === -1) return [];
  const bodyText = html.slice(startIdx, endIdx);
  
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
  
  const rows = [];
  let rowMatch;
  while ((rowMatch = rowRegex.exec(bodyText)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      cells.push(cleanHtml(cellMatch[2]));
    }
    if (cells.length > 0) {
      rows.push(cells);
    }
  }
  return rows;
}

function parseStats(html) {
  const stats = {
    cashTotal: '३९.३३',
    goodsTotal: '४७.५',
    fundsTotal: '१.२',
    aidSubtext: 'भारत दुई उडान · IFRC रेडक्रस · पठाइएको'
  };

  const cashIdx = html.indexOf('id="hero-cash"');
  if (cashIdx !== -1) {
    const cashEnd = html.indexOf('</a>', cashIdx);
    const cashBlock = html.slice(cashIdx, cashEnd);
    const numMatch = cashBlock.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    if (numMatch) {
      stats.cashTotal = cleanHtml(numMatch[1]);
    }
  }

  const aidIdx = html.indexOf('id="hero-aid"');
  if (aidIdx !== -1) {
    const aidEnd = html.indexOf('</a>', aidIdx);
    const aidBlock = html.slice(aidIdx, aidEnd);
    const numMatches = [...aidBlock.matchAll(/<strong[^>]*>([\s\S]*?)<\/strong>/gi)];
    if (numMatches.length >= 2) {
      stats.goodsTotal = cleanHtml(numMatches[0][1]);
      stats.fundsTotal = cleanHtml(numMatches[1][1]);
    }
    const subMatch = aidBlock.match(/<span class="cash-sub"[^>]*>([\s\S]*?)<\/span>/i);
    if (subMatch) {
      stats.aidSubtext = cleanHtml(subMatch[1]);
    }
  }

  return stats;
}

export async function getBulletinRescue() {
  const fetchedAt = new Date().toISOString();
  const source = { label: 'Rasuwa flood bulletin — rescue lists', url: BASE };

  try {
    const html = await safeFetch(`${BASE}/?t=${Date.now()}`, {
      as: 'text',
      timeout: 20_000,
      retries: 1,
      headers: { Accept: 'text/html', 'User-Agent': UA },
    });
    // safeFetch resolves rather than throws, so a failure arrives as an object
    // carrying the reason. Pass that reason on instead of flattening every
    // cause — DNS, timeout, 503 — into one indistinguishable message.
    if (typeof html !== 'string') throw new Error(html?.error || 'Failed to fetch HTML');

    const data = {
      treat: parseTable(html, 'treat-body'),
      shelter: parseTable(html, 'shelter-body'),
      surya: parseTable(html, 'surya-body'),
      nuwakot: parseTable(html, 'rasuwa-res-body'),
      dao: parseTable(html, 'dao-res-body'),
      india: parseTable(html, 'india-res-body'),
      trishuli1: parseTable(html, 'trishuli1-res-body'),
      stats: parseStats(html),
      fetchedAt,
      source,
      error: null
    };

    return data;
  } catch (err) {
    console.error('[Bulletin rescue scraper] Failed:', err.message);
    return {
      treat: [],
      shelter: [],
      surya: [],
      nuwakot: [],
      dao: [],
      india: [],
      trishuli1: [],
      stats: {
        cashTotal: '३९.३३',
        goodsTotal: '४७.५',
        fundsTotal: '१.२',
        aidSubtext: 'भारत दुई उडान · IFRC रेडक्रस · पठाइएको'
      },
      fetchedAt,
      source,
      error: err.message
    };
  }
}
