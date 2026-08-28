// Nepal disaster news aggregation — hazard-scoped RSS fan-out across Nepali
// dailies and Google News queries, with per-topic relevance ranking and
// source diversity.
//
// Every topic here is a natural hazard, its impact, or the response to it.
// A global hazard gate runs on top of the per-topic rules, so an off-topic
// headline that slips through a Google News query never reaches a panel.

const SUPPORTED_TOPICS = new Set([
  'all',
  'disaster',
  'earthquake',
  'flood',
  'weather',
  'wildfire',
  'airquality',
  'climate',
  'relief',
]);

const DEFAULT_TOPIC = 'all';

const SUPPORTED_WINDOWS = new Set(['1h', '6h', '24h', '48h', '7d', 'all']);
const WINDOW_TO_GOOGLE_WHEN = {
  '1h': 'when:1h',
  '6h': 'when:6h',
  '24h': 'when:1d',
  '48h': 'when:2d',
  '7d': 'when:7d',
};

const FEED_TIMEOUT_MS = 12_000;
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
const DEFAULT_SOURCE_CAP = 20;
const MIN_TOPIC_ITEMS = 12;

function googleQuery(query, locale = { hl: 'en-US', gl: 'US', ceid: 'US:en' }) {
  const q = encodeURIComponent(query);
  const { hl, gl, ceid } = locale;
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

// The national dailies, read directly rather than through a search wrapper.
//
// A Google News query returns a redirect stub and a truncated title; the
// outlet's own feed returns the headline as filed, the publication time, and
// usually a photograph. For district-level flood reporting — which is most of
// what matters here and much of which never reaches an English wire — that
// difference is the whole story.
const NEPALI_PORTALS = [
  { name: 'Onlinekhabar', url: 'https://www.onlinekhabar.com/feed' },
  { name: 'Ratopati', url: 'https://www.ratopati.com/feed' },
  { name: 'Nagarik News', url: 'https://nagariknews.nagariknetwork.com/feed' },
  { name: 'Setopati', url: 'https://www.setopati.com/feed' },
  { name: 'Himal Khabar', url: 'https://www.himalkhabar.com/feed' },
  { name: 'Onlinekhabar English', url: 'https://english.onlinekhabar.com/feed' },
];

// Nepali dailies carry district hazard reporting that never reaches the
// English wires, so every topic pairs an English query with a Nepali one.
const NEPAL_SOURCES = {
  disaster: [
    { name: 'The Rising Nepal', url: 'https://risingnepaldaily.com/rss' },
    { name: 'Nepal News', url: 'https://www.nepalnews.com/feed/' },
    { name: 'Kathmandu Post', url: 'https://kathmandupost.com/rss' },
    ...NEPALI_PORTALS,
    { name: 'Google Nepal Disaster', url: googleQuery('(Nepal earthquake OR landslide Nepal OR flood Nepal OR monsoon Nepal OR avalanche Nepal OR "disaster Nepal" OR NDRRMA) when:7d') },
    { name: 'Google Nepal Disaster Nepali', url: googleQuery('(विपद् OR भूकम्प OR पहिरो OR बाढी OR उद्धार OR राहत) नेपाल when:7d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  earthquake: [
    { name: 'Kathmandu Post', url: 'https://kathmandupost.com/rss' },
    { name: 'Google Nepal Earthquake', url: googleQuery('(Nepal earthquake OR Nepal quake OR aftershock Nepal OR "National Seismological Centre" Nepal OR tremor Kathmandu) when:14d') },
    { name: 'Google Nepal Earthquake Nepali', url: googleQuery('(भूकम्प OR पराकम्प OR भूकम्पीय) नेपाल when:14d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  flood: [
    { name: 'The Rising Nepal', url: 'https://risingnepaldaily.com/rss' },
    ...NEPALI_PORTALS,
    // Kantipur publishes no working RSS of its own — ekantipur.com/rss serves
    // an HTML page — so its reporting is reached through a site-scoped query.
    { name: 'Kantipur', url: googleQuery('site:ekantipur.com (बाढी OR पहिरो OR रसुवा OR भोटेकोशी OR त्रिशूली) when:14d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
    { name: 'Google Nepal Flood', url: googleQuery('(flood Nepal OR landslide Nepal OR inundation Terai OR "Koshi river" OR "Karnali river" OR embankment Nepal OR flash flood Nepal) when:14d') },
    { name: 'Google Nepal Flood Nepali', url: googleQuery('(बाढी OR पहिरो OR डुबान OR कटान OR तटबन्ध) नेपाल when:14d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  weather: [
    { name: 'Kathmandu Post', url: 'https://kathmandupost.com/rss' },
    { name: 'Google Nepal Weather', url: googleQuery('("Department of Hydrology and Meteorology" OR DHM Nepal OR weather warning Nepal OR heavy rainfall Nepal OR cold wave Nepal OR heat wave Nepal OR hailstorm Nepal OR lightning Nepal) when:14d') },
    { name: 'Google Nepal Weather Nepali', url: googleQuery('(मौसम OR वर्षा OR मनसुन OR शीतलहर OR असिना OR चट्याङ) नेपाल when:14d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  wildfire: [
    { name: 'Google Nepal Wildfire', url: googleQuery('("forest fire" Nepal OR wildfire Nepal OR "Department of Forests" Nepal fire OR bushfire Nepal) when:21d') },
    { name: 'Google Nepal Wildfire Nepali', url: googleQuery('(डढेलो OR वन आगलागी OR आगलागी) नेपाल when:21d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  airquality: [
    { name: 'Kathmandu Post', url: 'https://kathmandupost.com/rss' },
    { name: 'Google Nepal Air Quality', url: googleQuery('("air quality" Kathmandu OR AQI Nepal OR "air pollution" Nepal OR smog Kathmandu OR haze Nepal OR PM2.5 Nepal) when:21d') },
    { name: 'Google Nepal Air Quality Nepali', url: googleQuery('(वायु प्रदूषण OR वायु गुणस्तर OR धुवाँ OR तुसारो) नेपाल when:21d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  climate: [
    { name: 'Google Nepal Climate Hazard', url: googleQuery('(glacier Nepal OR "glacial lake" Nepal OR GLOF Nepal OR ICIMOD OR snowmelt Nepal OR drought Nepal OR "climate risk" Nepal) when:30d') },
    { name: 'Google Nepal Climate Nepali', url: googleQuery('(हिमताल OR हिमनदी OR जलवायु OR खडेरी) नेपाल when:30d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
  relief: [
    { name: 'Nepal News', url: 'https://www.nepalnews.com/feed/' },
    ...NEPALI_PORTALS,
    { name: 'Google Nepal Relief', url: googleQuery('(NDRRMA OR "disaster relief" Nepal OR "Nepal Red Cross" OR rescue operation Nepal OR displaced Nepal OR relief distribution Nepal OR evacuation Nepal) when:14d') },
    { name: 'Google Nepal Relief Nepali', url: googleQuery('(उद्धार OR राहत OR विस्थापित OR क्षतिपूर्ति OR विपद् व्यवस्थापन) नेपाल when:14d', { hl: 'ne', gl: 'NP', ceid: 'NP:ne' }) },
  ],
};

const LOCAL_SOURCE_HINTS = ['kathmandu post', 'onlinekhabar', 'nepal news', 'the rising nepal', 'setopati', 'ratopati', 'khabarhub', 'nepali times'];

const NEPAL_CONTEXT_TERMS = [
  'nepal', 'nepali', 'kathmandu', 'pokhara', 'biratnagar', 'lumbini', 'terai',
  'koshi', 'karnali', 'gandaki', 'bagmati', 'madhesh', 'sudurpashchim',
  'नेपाल', 'नेपाली', 'काठमाडौँ', 'पोखरा',
];

// The global hazard gate. An item must name a natural hazard, its impact, or
// the response to it — for every topic, including 'all'.
const HAZARD_GATE_TERMS = [
  'earthquake', 'quake', 'aftershock', 'tremor', 'seismic', 'epicentre', 'epicenter',
  'landslide', 'mudslide', 'rockfall', 'avalanche', 'debris flow',
  'flood', 'inundat', 'glof', 'glacial lake', 'embankment', 'washed away', 'swollen', 'waterlogg',
  'monsoon', 'rainfall', 'heavy rain', 'downpour', 'cloudburst', 'storm', 'hailstorm',
  'thunderstorm', 'lightning', 'cold wave', 'heat wave', 'heatwave', 'snowfall', 'blizzard',
  'drought', 'glacier', 'snowmelt',
  'wildfire', 'forest fire', 'bushfire', 'fire season',
  'air quality', 'aqi', 'pm2.5', 'smog', 'haze', 'air pollution',
  'disaster', 'calamity', 'hazard', 'evacuat', 'rescue', 'relief', 'displaced',
  'casualt', 'missing', 'shelter', 'ndrrma', 'red cross', 'dhm', 'icimod',
  'preparedness', 'early warning', 'weather warning',
  'भूकम्प', 'पराकम्प', 'पहिरो', 'बाढी', 'डुबान', 'हिमपहिरो', 'हिमताल', 'हिमनदी',
  'वर्षा', 'मनसुन', 'असिना', 'चट्याङ', 'आगलागी', 'डढेलो', 'खडेरी', 'मौसम',
  'विपद्', 'उद्धार', 'राहत', 'विस्थापित', 'क्षति', 'बेपत्ता', 'शीतलहर', 'प्रदूषण',
];

const TOPIC_RELEVANCE_RULES = {
  disaster: { include: ['disaster', 'earthquake', 'landslide', 'flood', 'monsoon', 'avalanche', 'rescue', 'relief', 'ndrrma', 'emergency', 'विपद्', 'भूकम्प', 'पहिरो', 'बाढी', 'उद्धार'], minScore: 8 },
  earthquake: { include: ['earthquake', 'quake', 'aftershock', 'tremor', 'seismic', 'epicentre', 'epicenter', 'magnitude', 'भूकम्प', 'पराकम्प'], minScore: 8 },
  flood: { include: ['flood', 'landslide', 'inundation', 'inundated', 'embankment', 'river', 'washed away', 'swollen', 'debris', 'बाढी', 'पहिरो', 'डुबान', 'कटान'], minScore: 8 },
  weather: { include: ['weather', 'rainfall', 'rain', 'monsoon', 'storm', 'hailstorm', 'lightning', 'cold wave', 'heat wave', 'snowfall', 'dhm', 'forecast', 'मौसम', 'वर्षा', 'मनसुन', 'शीतलहर', 'असिना', 'चट्याङ'], minScore: 8 },
  // Deliberately excludes bare 'fire': it matches building and vehicle fires,
  // which are not natural hazards.
  wildfire: { include: ['wildfire', 'forest fire', 'bush fire', 'bushfire', 'grassland fire', 'fire season', 'डढेलो', 'वन आगलागी'], minScore: 8 },
  airquality: { include: ['air quality', 'aqi', 'air pollution', 'pm2.5', 'smog', 'haze', 'pollution', 'प्रदूषण', 'धुवाँ'], minScore: 8 },
  climate: { include: ['glacier', 'glacial lake', 'glof', 'icimod', 'snowmelt', 'drought', 'climate', 'हिमताल', 'हिमनदी', 'जलवायु', 'खडेरी'], minScore: 8 },
  relief: { include: ['relief', 'rescue', 'ndrrma', 'red cross', 'displaced', 'evacuation', 'shelter', 'compensation', 'aid', 'उद्धार', 'राहत', 'विस्थापित', 'क्षतिपूर्ति'], minScore: 8 },
};

// Every topic falls back to the broad disaster feed rather than to general news.
const TOPIC_FALLBACKS = {
  earthquake: ['disaster'],
  flood: ['disaster', 'weather'],
  weather: ['disaster'],
  wildfire: ['disaster', 'airquality'],
  airquality: ['wildfire', 'disaster'],
  climate: ['weather', 'disaster'],
  relief: ['disaster'],
};

const TOPIC_MIN_ITEMS = {
  disaster: 16,
  earthquake: 8,
  flood: 12,
  weather: 12,
  wildfire: 8,
  airquality: 8,
  climate: 8,
  relief: 10,
};

function decodeXml(str) {
  return String(str)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function parseDate(value) {
  if (!value) return Date.now();
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Date.now();
}

function extractTag(block, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(re);
  return match ? decodeXml(match[1]) : '';
}

/**
 * The lead photograph for an item, if the feed offers one.
 *
 * Outlets advertise it four different ways and no two of the Nepali portals
 * agree: Ratopati uses media:thumbnail, Nagarik embeds an <img> in the body,
 * others use media:content or an enclosure. All four are tried in order of how
 * likely they are to be the article's actual lead image rather than a logo.
 *
 * The URL is returned as published. Atlas never copies the file — it is served
 * through the signed proxy in lib/news-media.ts at request time, so the outlet
 * keeps its bytes and its referer.
 */
function extractImage(block) {
  const patterns = [
    /<media:thumbnail[^>]*\burl=["']([^"']+)["']/i,
    /<media:content[^>]*\burl=["']([^"']+)["']/i,
    /<enclosure[^>]*\burl=["']([^"']+)["'][^>]*type=["']image\//i,
    /<enclosure[^>]*type=["']image\/[^"']*["'][^>]*\burl=["']([^"']+)["']/i,
    /<img[^>]*\bsrc=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const match = block.match(re);
    if (!match) continue;
    const url = decodeXml(match[1]);
    // Feed furniture: tracking pixels and the outlet's own logo are not the story.
    if (!/^https?:\/\//i.test(url)) continue;
    if (/\b(logo|icon|avatar|pixel|blank|spacer)\b/i.test(url)) continue;
    return url;
  }
  return null;
}

function extractItemBlocks(xml) {
  const matches = xml.match(/<item\b[\s\S]*?<\/item>/gi);
  return matches || [];
}

function extractEntryBlocks(xml) {
  const matches = xml.match(/<entry\b[\s\S]*?<\/entry>/gi);
  return matches || [];
}

function parseRssItems(xml, fallbackSource) {
  const itemBlocks = extractItemBlocks(xml);
  const items = [];

  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    if (!title || !link) continue;

    const source = extractTag(block, 'source') || fallbackSource;
    const pubDate = parseDate(extractTag(block, 'pubDate') || extractTag(block, 'dc:date') || extractTag(block, 'updated'));

    items.push({ title, link, source, pubDate, image: extractImage(block) });
  }

  if (items.length > 0) return items;

  const entryBlocks = extractEntryBlocks(xml);
  for (const block of entryBlocks) {
    const title = extractTag(block, 'title');
    const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/i);
    const link = hrefMatch ? decodeXml(hrefMatch[1]) : extractTag(block, 'link');
    if (!title || !link) continue;

    const source = extractTag(block, 'source') || fallbackSource;
    const pubDate = parseDate(extractTag(block, 'published') || extractTag(block, 'updated') || extractTag(block, 'dc:date'));

    items.push({ title, link, source, pubDate, image: extractImage(block) });
  }

  return items;
}

async function fetchWithTimeout(url, timeoutMs = FEED_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AncodaAtlas-NepalHazardFeed/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9,ne;q=0.8',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getSourcesForTopic(topic) {
  if (topic === 'all') {
    const all = Object.values(NEPAL_SOURCES).flat();
    const seen = new Set();
    return all.filter((source) => {
      if (seen.has(source.url)) return false;
      seen.add(source.url);
      return true;
    });
  }

  return NEPAL_SOURCES[topic] || NEPAL_SOURCES.disaster;
}

function dedupeSources(sources) {
  const out = [];
  const seen = new Set();
  for (const source of sources) {
    const key = String(source?.url || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

function clampLimit(limit) {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  if (limit < 10) return 10;
  if (limit > MAX_LIMIT) return MAX_LIMIT;
  return Math.floor(limit);
}

function clampSourceCap(value) {
  if (!Number.isFinite(value)) return DEFAULT_SOURCE_CAP;
  if (value < 1) return 1;
  if (value > 50) return 50;
  return Math.floor(value);
}

function normalizeWindow(windowParam) {
  const value = String(windowParam || 'all').toLowerCase();
  return SUPPORTED_WINDOWS.has(value) ? value : 'all';
}

function getWindowCutoff(windowRange, now = Date.now()) {
  const windowMsByRange = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '48h': 48 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    'all': Infinity,
  };
  const windowMs = windowMsByRange[windowRange] ?? Infinity;
  return Number.isFinite(windowMs) ? now - windowMs : null;
}

function applyWindowFilter(items, cutoff) {
  if (cutoff == null) return items;
  return items.filter((item) => Number.isFinite(item.pubDate) && item.pubDate >= cutoff);
}

function withWindowAdjustedSources(sources, windowRange) {
  if (windowRange === 'all') return sources;
  const whenToken = WINDOW_TO_GOOGLE_WHEN[windowRange];
  if (!whenToken) return sources;

  return sources.map((source) => {
    if (!source.url.includes('news.google.com/rss/search?')) return source;
    try {
      const parsed = new URL(source.url);
      const currentQuery = parsed.searchParams.get('q') || '';
      const withoutWhen = currentQuery.replace(/\s+when:\d+[hdw]\b/gi, '').trim();
      parsed.searchParams.set('q', `${withoutWhen} ${whenToken}`.trim());
      return { ...source, url: parsed.toString() };
    } catch {
      return source;
    }
  });
}

function dedupeItems(items) {
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.link}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function applySourceCap(items, sourceCap) {
  const bySource = new Map();
  const out = [];
  for (const item of items) {
    const key = item.source || 'unknown';
    const count = bySource.get(key) ?? 0;
    if (count >= sourceCap) continue;
    bySource.set(key, count + 1);
    out.push(item);
  }
  return out;
}

function asLower(value) {
  return String(value || '').toLowerCase();
}

// Short Latin keywords have to match on word boundaries. Plain substring
// matching turns 'rain' into a hit on "training", 'fire' into a hit on
// "firefighter" and 'heat' into a hit on "wheat". Devanagari keeps substring
// matching: Nepali attaches case suffixes directly to the noun, so a boundary
// match would miss "रसुवामा" for "रसुवा".
const DEVANAGARI = /[\u0900-\u097F]/;
const boundaryCache = new Map();

function keywordMatcher(keyword) {
  const key = asLower(keyword);
  if (DEVANAGARI.test(key)) return null;
  let re = boundaryCache.get(key);
  if (!re) {
    re = new RegExp(`(?:^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i');
    boundaryCache.set(key, re);
  }
  return re;
}

function matchesKeyword(text, keyword) {
  const re = keywordMatcher(keyword);
  return re ? re.test(text) : text.includes(asLower(keyword));
}

function countKeywordMatches(text, keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) return 0;
  let count = 0;
  for (const keyword of keywords) {
    if (matchesKeyword(text, keyword)) count += 1;
  }
  return count;
}

function isLikelyLocalSource(source) {
  const lower = asLower(source);
  return LOCAL_SOURCE_HINTS.some((hint) => lower.includes(hint));
}

// The gate every item passes, whatever the topic. A Nepali daily's RSS feed
// carries its whole newsroom, and Google News queries leak adjacent stories,
// so relevance is enforced here rather than trusted from the feed.
function isHazardItem(item) {
  const text = asLower(`${item.title} ${item.link}`);
  return HAZARD_GATE_TERMS.some((term) => matchesKeyword(text, term));
}

function scoreItemForTopic(item, topic) {
  const rule = TOPIC_RELEVANCE_RULES[topic];
  if (!rule) return { score: 0, includeMatches: 0, nepalMatches: 0, localSource: false };

  const text = asLower(`${item.title} ${item.source} ${item.link}`);
  const includeMatches = countKeywordMatches(text, rule.include);
  const nepalMatches = countKeywordMatches(text, NEPAL_CONTEXT_TERMS);
  const localSource = isLikelyLocalSource(item.source);

  let score = includeMatches * 7;
  score += nepalMatches * 4;
  if (localSource) score += 3;
  // A hazard story with no Nepal marker and no Nepali byline is usually
  // coverage of a disaster somewhere else.
  if (nepalMatches === 0 && !localSource) score -= 20;
  if (includeMatches === 0) score -= 10;

  return { score, includeMatches, nepalMatches, localSource };
}

function rankAndFilterItemsForTopic(items, topic) {
  const hazardOnly = items.filter(isHazardItem);

  if (topic === 'all') {
    const byTime = [...hazardOnly].filter((item) => (
      countKeywordMatches(asLower(`${item.title} ${item.source} ${item.link}`), NEPAL_CONTEXT_TERMS) > 0
      || isLikelyLocalSource(item.source)
    ));
    byTime.sort((a, b) => b.pubDate - a.pubDate);
    return byTime;
  }

  const rule = TOPIC_RELEVANCE_RULES[topic];
  if (!rule) return hazardOnly;

  const scored = hazardOnly.map((item) => ({ item, ...scoreItemForTopic(item, topic) }));

  const filtered = scored.filter((entry) => {
    if (entry.nepalMatches === 0 && !entry.localSource) return false;
    if (entry.includeMatches === 0) return false;
    return entry.score >= (rule.minScore ?? 1);
  });

  filtered.sort((a, b) => (b.score - a.score) || (b.item.pubDate - a.item.pubDate));
  return filtered.map((entry) => entry.item);
}

function getFallbackTopics(topic) {
  return TOPIC_FALLBACKS[topic] ?? ['disaster'];
}

async function fetchAggregatedItems(sources) {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await fetchWithTimeout(source.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseRssItems(xml, source.name);
    }),
  );

  const flattened = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      flattened.push(...result.value);
    }
  }
  return flattened;
}

/**
 * Fetch ranked, deduplicated hazard news for a topic.
 *
 * @param {object} [opts]
 * @param {string} [opts.topic='all']   one of SUPPORTED_TOPICS
 * @param {string} [opts.window='24h']  1h | 6h | 24h | 48h | 7d | all
 * @param {number} [opts.limit=60]
 * @param {number} [opts.sourceCap=20]  max items per source, for diversity
 * @returns {Promise<{topic,window,items,count,mode,timestamp}>}
 */
export async function fetchTopicNews(opts = {}) {
  const requestedTopic = String(opts.topic || DEFAULT_TOPIC).toLowerCase();
  const topic = SUPPORTED_TOPICS.has(requestedTopic) ? requestedTopic : DEFAULT_TOPIC;
  const windowRange = normalizeWindow(opts.window);
  const windowCutoff = getWindowCutoff(windowRange);
  const limit = clampLimit(Number(opts.limit));
  const sourceCap = clampSourceCap(opts.sourceCap == null ? Number.NaN : Number(opts.sourceCap));

  const primarySourceSet = dedupeSources(getSourcesForTopic(topic));
  const primarySources = withWindowAdjustedSources(primarySourceSet, windowRange);

  const respond = (items, mode) => ({
    topic,
    window: windowRange,
    mode,
    timestamp: new Date().toISOString(),
    count: items.length,
    items: items.map(compactItem),
  });

  try {
    let aggregated = applyWindowFilter(await fetchAggregatedItems(primarySources), windowCutoff);
    let deduped = dedupeItems(aggregated);
    let ranked = rankAndFilterItemsForTopic(deduped, topic);

    if (topic !== 'all') {
      const targetMinItems = TOPIC_MIN_ITEMS[topic] ?? MIN_TOPIC_ITEMS;
      const primaryUrls = new Set(primarySources.map((s) => s.url));

      for (const fallbackTopic of getFallbackTopics(topic)) {
        if (ranked.length >= targetMinItems) break;

        const fallbackSources = withWindowAdjustedSources(dedupeSources(getSourcesForTopic(fallbackTopic)), windowRange)
          .filter((source) => !primaryUrls.has(source.url));
        if (fallbackSources.length === 0) continue;

        const fallbackItems = await fetchAggregatedItems(fallbackSources);
        aggregated = applyWindowFilter(aggregated.concat(fallbackItems), windowCutoff);
        deduped = dedupeItems(aggregated);
        ranked = rankAndFilterItemsForTopic(deduped, topic);
      }

      if (ranked.length === 0 && windowRange !== 'all') {
        // Hazard topics go quiet for long stretches, which is the normal
        // state. Widen the horizon before showing an empty panel, but never
        // relax the hazard or Nepal gates to fill it.
        const extendedPrimary = withWindowAdjustedSources(primarySourceSet, 'all');
        const extendedItems = await fetchAggregatedItems(extendedPrimary);
        const extendedDeduped = dedupeItems(aggregated.concat(extendedItems));
        ranked = rankAndFilterItemsForTopic(extendedDeduped, topic);
      }
    }

    deduped = dedupeItems(ranked);
    deduped.sort((a, b) => b.pubDate - a.pubDate);
    return respond(applySourceCap(deduped, sourceCap).slice(0, limit), 'normal');
  } catch (error) {
    console.error('[nepal-news] aggregation failed:', error.message);
    try {
      // Emergency path: best-effort hazard headlines rather than an empty panel.
      const emergencySources = withWindowAdjustedSources(getSourcesForTopic('disaster'), windowRange);
      const emergencyItems = applyWindowFilter(await fetchAggregatedItems(emergencySources), windowCutoff);
      const dedupedEmergency = dedupeItems(emergencyItems)
        .filter(isHazardItem)
        .sort((a, b) => b.pubDate - a.pubDate);
      return respond(dedupedEmergency.slice(0, Math.min(limit, 30)), 'fallback');
    } catch (fallbackError) {
      console.error('[nepal-news] fallback aggregation failed:', fallbackError.message);
      return respond([], 'empty');
    }
  }
}

// Serialise an internal item (pubDate is a millisecond timestamp) for the wire.
function compactItem(item) {
  return {
    title: item.title,
    link: item.link,
    source: item.source,
    pubDate: new Date(item.pubDate).toISOString(),
    image: item.image || null,
  };
}

export { SUPPORTED_TOPICS, SUPPORTED_WINDOWS, DEFAULT_TOPIC };

// Run standalone: node apis/sources/nepal-news.mjs [topic] [window]
if (process.argv[1]?.endsWith('nepal-news.mjs')) {
  const data = await fetchTopicNews({
    topic: process.argv[2] || 'all',
    window: process.argv[3] || '24h',
    limit: 15,
  });
  console.log(JSON.stringify(data, null, 2));
}
