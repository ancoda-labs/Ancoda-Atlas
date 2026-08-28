// Nepali broadcast video for the flood desk.
//
// Television is where a lot of this coverage actually lives — a correspondent
// standing where a bridge used to be says more than the wire copy about it —
// and the Nepali channels put it on YouTube within the hour.
//
// How Atlas reaches it, and why:
//
//   Embed, never download. Videos are shown in YouTube's own iframe player, so
//   the outlet keeps its view count and its advertising. Nothing is copied to
//   MinIO; that bucket is for photographs the public sent us and nothing else.
//
//   The Data API when a key exists. YOUTUBE_API_KEY gives proper search, which
//   is the only way to find relevant video across channels Atlas has not been
//   told about.
//
//   Channel pages and oEmbed when it does not. YouTube's old RSS endpoint
//   (feeds/videos.xml) now answers 404, so recent video ids are read off the
//   channel page and each one's title, author and thumbnail come from the
//   documented oEmbed endpoint rather than from scraped markup.

import { safeFetch } from '../utils/fetch.mjs';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * Nepali news channels, verified by channel id.
 *
 * Handles change and get squatted; ids do not. To add one, open the channel and
 * take the UC… id out of its /channel/ URL.
 */
export const DEFAULT_CHANNELS = [
  { id: 'UC3yDoaqQzOd1bNP74ZrGPTA', name: 'Kantipur TV HD' },
  { id: 'UCo4cuctdb-1YdZNgWEVZGwA', name: 'Onlinekhabar' },
  { id: 'UCjG2HX7jfwqIjzTlaF1CPGA', name: 'News24 Nepal' },
  { id: 'UCg04d_B2CR0Di1rs7mSu6JQ', name: 'Nepal News' },
];

// A video is only shown if its title says it is about this event. Broadcasters
// post everything to the same channel, and a flood desk carrying last night's
// football highlights would be worse than carrying no video at all.
const RELEVANCE_TERMS = [
  'बाढी', 'पहिरो', 'रसुवा', 'भोटेकोशी', 'त्रिशूली', 'उद्धार', 'राहत', 'विपद्',
  'डुबान', 'बगायो', 'सखाप', 'घाइते', 'बेपत्ता', 'तटबन्ध', 'हिमताल', 'लेन्डे',
  'नुवाकोट', 'धादिङ', 'तिमुरे', 'स्याफ्रुबेसी', 'धुन्चे', 'बेत्रावती',
  'flood', 'landslide', 'rasuwa', 'bhotekoshi', 'bhote koshi', 'trishuli',
  'rescue', 'relief', 'disaster', 'washed away', 'timure', 'syafrubesi',
  'dhunche', 'nuwakot', 'dhading', 'glof', 'inundat',
];

const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loader();
  cache.set(key, { value, at: Date.now() });
  return value;
}

function isRelevant(text) {
  const lower = String(text || '').toLowerCase();
  return RELEVANCE_TERMS.some(term => lower.includes(term.toLowerCase()));
}

/**
 * Recent video ids from a channel's uploads page.
 *
 * The ids appear in the bootstrap JSON the page ships with. Only the eleven
 * character ids are taken — no titles, no descriptions, nothing that oEmbed
 * will give authoritatively a moment later.
 */
async function getChannelVideoIds(channelId, limit = 25) {
  const res = await fetch(`https://www.youtube.com/channel/${channelId}/videos`, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'ne,en;q=0.8' },
  });
  if (!res.ok) throw new Error(`YouTube channel HTTP ${res.status}`);
  const html = await res.text();

  const ids = [];
  const seen = new Set();
  for (const match of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

/** Title, author and thumbnail for one video, from YouTube's oEmbed endpoint. */
async function getVideoMeta(videoId) {
  return cached(`meta:${videoId}`, async () => {
    const target = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
    const data = await safeFetch(`https://www.youtube.com/oembed?url=${target}&format=json`, {
      timeout: 12_000,
      retries: 1,
    });
    if (!data || data.error || !data.title) return null;
    return {
      id: videoId,
      title: data.title,
      channel: data.author_name || null,
      channelUrl: data.author_url || null,
      thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
      publishedAt: null,
    };
  });
}

/** Search, when a Data API key is configured. Returns [] when it is not. */
async function searchViaApi(query, limit) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    order: 'date',
    maxResults: String(Math.min(limit, 50)),
    relevanceLanguage: 'ne',
    regionCode: 'NP',
    key,
  });
  const data = await safeFetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { timeout: 15_000 });
  if (!data || data.error) {
    console.warn('[YouTube] Data API search failed:', data?.error?.message || data?.error);
    return [];
  }
  return (data.items || [])
    .filter(item => item.id?.videoId)
    .map(item => ({
      id: item.id.videoId,
      title: item.snippet?.title || '',
      channel: item.snippet?.channelTitle || null,
      channelUrl: item.snippet?.channelId ? `https://www.youtube.com/channel/${item.snippet.channelId}` : null,
      thumbnail: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${item.id.videoId}`,
      publishedAt: item.snippet?.publishedAt || null,
    }));
}

async function getLiveVideoId(channelId) {
  try {
    const res = await fetch(`https://www.youtube.com/channel/${channelId}/live`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': BROWSER_UA }
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html.includes('"isLive":true')) return null;
    
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})">/);
    if (canonicalMatch) return canonicalMatch[1];
    
    const match = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Flood coverage from the Nepali broadcasters.
 *
 * @param {object} [opts]
 * @param {Array<{id: string, name: string}>} [opts.channels]
 * @param {number} [opts.limit]
 * @param {string} [opts.query] search string, used only when a Data API key is set
 */
export async function getFloodVideos({ channels = DEFAULT_CHANNELS, limit = 24, query = 'रसुवा बाढी भोटेकोशी' } = {}) {
  const fetchedAt = new Date().toISOString();
  const errors = [];

  const liveChannels = [
    { id: 'UC3yDoaqQzOd1bNP74ZrGPTA', name: 'Kantipur TV HD Live', channelName: 'Kantipur TV' },
    { id: 'UCjG2HX7jfwqIjzTlaF1CPGA', name: 'News24 Nepal Live', channelName: 'News24' },
    { id: 'UCNye-w-v_C-fjh7W023RypQ', name: 'Al Jazeera English Live', channelName: 'Al Jazeera' },
    { id: 'UCknLrEdhRCp1gqcb7cyYA_Q', name: 'DW News Live', channelName: 'DW News' },
    { id: 'UCwqusr8YDwM-3mEYTDeJHzw', name: 'Republic World Live', channelName: 'Republic World' },
    { id: 'UC83iGbaOhZR8AWNYYNzSNjg', name: 'India Global Review Live', channelName: 'India Global Review' }
  ];

  const [apiResults, channelIdLists, liveStreamsResults] = await Promise.all([
    searchViaApi(query, limit).catch(err => {
      errors.push(`search: ${err.message}`);
      return [];
    }),
    Promise.allSettled(channels.map(c => getChannelVideoIds(c.id))),
    Promise.allSettled(liveChannels.map(async c => {
      const vidId = await getLiveVideoId(c.id);
      if (!vidId) return null;
      return {
        id: vidId,
        title: c.name,
        channel: c.channelName,
        channelUrl: `https://www.youtube.com/channel/${c.id}`,
        thumbnail: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${vidId}`,
        embedUrl: `https://www.youtube.com/embed/${vidId}`,
        publishedAt: null
      };
    }))
  ]);

  const live = [];
  for (const r of liveStreamsResults) {
    if (r.status === 'fulfilled' && r.value) live.push(r.value);
  }

  const ids = [];
  channelIdLists.forEach((result, i) => {
    if (result.status === 'fulfilled') ids.push(...result.value);
    else errors.push(`${channels[i].name}: ${result.reason?.message || result.reason}`);
  });

  // oEmbed is one request per video, so cap the fan-out and lean on the cache.
  const uniqueIds = [...new Set(ids)].slice(0, 60);
  const metas = [];
  const CONCURRENCY = 8;
  for (let i = 0; i < uniqueIds.length; i += CONCURRENCY) {
    const slice = uniqueIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map(getVideoMeta));
    for (const r of settled) if (r.status === 'fulfilled' && r.value) metas.push(r.value);
  }

  // Search results first — they were matched on the query, not merely on being
  // recent — then channel uploads whose titles are about this event.
  const merged = [...apiResults, ...metas];
  const seen = new Set();
  const videos = [];
  for (const video of merged) {
    if (seen.has(video.id)) continue;
    if (!isRelevant(video.title)) continue;
    seen.add(video.id);
    videos.push(video);
    if (videos.length >= limit) break;
  }

  return {
    videos,
    live,
    searchEnabled: Boolean(process.env.YOUTUBE_API_KEY),
    error: errors.length ? errors.join('; ') : null,
    fetchedAt,
  };
}
