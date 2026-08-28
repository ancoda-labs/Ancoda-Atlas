// Persistence and scheduling for the ten-minute news digests.
//
// lib/news-digest.mjs writes one brief; this decides which briefs are missing,
// gets them written, and reads them back. Two rules shape it:
//
//   Windows with no reporting are not stored. A timeline of "nothing arrived"
//   rows every ten minutes buries the windows where something did.
//
//   Catch-up never blocks a request. If nobody opens the page for two hours,
//   the visitor who finally does gets the briefs that exist immediately, and
//   the backlog fills in behind them rather than holding the response open for
//   as many model calls as the gap is wide.

import { randomUUID } from 'crypto';
import { query } from './db';
import { bucketStartFor, bucketEndFor, draftDigest } from '@/lib/news-digest.mjs';
import type { DigestSource, LLMProviderLike, NewsDigest, NewsItem } from './types';
import { errorMessage } from './types';

export type DigestLang = 'en' | 'ne';

/** Windows to fill in one catch-up pass. Bounds a cold start's model spend. */
const MAX_CATCHUP_BUCKETS = 3;
/** How far back a catch-up will look for gaps. */
const LOOKBACK_BUCKETS = 12;
/** Floor between catch-up passes, so a burst of readers triggers one run. */
const CATCHUP_COOLDOWN_MS = 60 * 1000;

interface DigestGlobal {
  __atlasDigestRun?: Promise<void> | null;
  __atlasDigestLastRun?: number;
}
const g = globalThis as unknown as DigestGlobal;

interface DigestRow {
  id: string;
  bucket_start: Date;
  bucket_end: Date;
  lang: string;
  headline: string;
  summary: string;
  bullets: unknown;
  sources: unknown;
  item_count: number;
  generator: string;
  model: string | null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function asSources(value: unknown): DigestSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DigestSource[] => {
    if (!entry || typeof entry !== 'object') return [];
    const o = entry as Record<string, unknown>;
    if (typeof o.title !== 'string' || typeof o.url !== 'string' || typeof o.source !== 'string') return [];
    return [{ title: o.title, url: o.url, source: o.source }];
  });
}

function toDigest(row: DigestRow): NewsDigest {
  return {
    id: row.id,
    bucketStart: row.bucket_start.toISOString(),
    bucketEnd: row.bucket_end.toISOString(),
    lang: row.lang === 'ne' ? 'ne' : 'en',
    headline: row.headline,
    summary: row.summary,
    bullets: asStringArray(row.bullets),
    sources: asSources(row.sources),
    itemCount: row.item_count,
    generator: row.generator === 'llm' ? 'llm' : 'extractive',
    model: row.model,
  };
}

export async function getDigests(lang: DigestLang, limit = 12): Promise<NewsDigest[]> {
  const rows = await query<DigestRow>(
    `SELECT id, bucket_start, bucket_end, lang, headline, summary, bullets, sources,
            item_count, generator, model
       FROM news_digests
      WHERE topic = 'flood' AND lang = $1
      ORDER BY bucket_start DESC
      LIMIT $2`,
    [lang, Math.min(Math.max(limit, 1), 48)],
  );
  return rows.map(toDigest);
}

/** Bucket starts already written, for either language, within the lookback. */
async function existingBucketKeys(): Promise<Set<string>> {
  const rows = await query<{ bucket_start: Date; lang: string }>(
    `SELECT bucket_start, lang FROM news_digests
      WHERE topic = 'flood' AND bucket_start > now() - interval '6 hours'`,
  );
  return new Set(rows.map(r => `${r.bucket_start.toISOString()}|${r.lang}`));
}

async function loadProvider(): Promise<LLMProviderLike | null> {
  try {
    const [{ createLLMProvider }, configModule] = await Promise.all([
      import('@/lib/llm/index.mjs'),
      import('@/atlas.config.mjs'),
    ]);
    return createLLMProvider(configModule.default.llm);
  } catch (err) {
    console.warn('[Digest] No LLM provider available:', errorMessage(err));
    return null;
  }
}

function windowLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kathmandu' });
  return `${fmt(start)}–${fmt(end)} Nepal time`;
}

async function writeDigest(start: Date, end: Date, lang: DigestLang, items: NewsItem[], provider: LLMProviderLike | null) {
  const { draft, generator, model } = await draftDigest(provider, items, lang, windowLabel(start, end));
  const sources: DigestSource[] = items.slice(0, 8).map(i => ({ title: i.title, url: i.link, source: i.source }));
  await query(
    `INSERT INTO news_digests
       (id, topic, bucket_start, bucket_end, lang, headline, summary, bullets, sources, item_count, generator, model)
     VALUES ($1, 'flood', $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
     ON CONFLICT (topic, bucket_start, lang) DO NOTHING`,
    [
      randomUUID(), start, end, lang, draft.headline, draft.summary,
      JSON.stringify(draft.bullets), JSON.stringify(sources), items.length, generator, model,
    ],
  );
}

async function runCatchup(): Promise<void> {
  const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
  // Two hours of wire covers the lookback with room for late-arriving items.
  const news = await fetchTopicNews({ topic: 'flood', window: '6h', limit: 120, sourceCap: 12 });

  // Each item belongs to exactly one window, decided by when it was published,
  // so no story is summarised into two consecutive briefs.
  const byBucket = new Map<string, NewsItem[]>();
  for (const item of news.items || []) {
    const published = new Date(item.pubDate);
    if (Number.isNaN(published.getTime())) continue;
    const key = bucketStartFor(published).toISOString();
    const list = byBucket.get(key);
    if (list) list.push(item);
    else byBucket.set(key, [item]);
  }

  const existing = await existingBucketKeys();
  const provider = await loadProvider();
  const now = Date.now();

  // Newest closed window first: the brief a reader is waiting for is the last one.
  const candidates = [...byBucket.keys()]
    .map(key => new Date(key))
    .filter(start => {
      const end = bucketEndFor(start);
      if (end.getTime() > now) return false; // still open, more may arrive
      return now - start.getTime() < LOOKBACK_BUCKETS * 10 * 60 * 1000;
    })
    .sort((a, b) => b.getTime() - a.getTime());

  let written = 0;
  for (const start of candidates) {
    if (written >= MAX_CATCHUP_BUCKETS) break;
    const items = byBucket.get(start.toISOString()) || [];
    if (!items.length) continue;

    const langs: DigestLang[] = (['en', 'ne'] as DigestLang[]).filter(
      lang => !existing.has(`${start.toISOString()}|${lang}`),
    );
    if (!langs.length) continue;

    const end = bucketEndFor(start);
    // Both languages for one window go together; the windows themselves are
    // sequential so a slow model cannot fan out into a dozen parallel calls.
    await Promise.all(langs.map(lang => writeDigest(start, end, lang, items, provider)));
    written++;
  }

  if (written) console.log(`[Digest] Wrote ${written} ten-minute brief window(s)`);
}

/**
 * Kick off a catch-up if one is not already running and the cooldown has
 * passed. Deliberately not awaited by callers — see the note at the top.
 */
export function scheduleCatchup(): void {
  if (g.__atlasDigestRun) return;
  if (g.__atlasDigestLastRun && Date.now() - g.__atlasDigestLastRun < CATCHUP_COOLDOWN_MS) return;
  g.__atlasDigestLastRun = Date.now();
  g.__atlasDigestRun = runCatchup()
    .catch(err => console.error('[Digest] Catch-up failed:', errorMessage(err)))
    .finally(() => {
      g.__atlasDigestRun = null;
    });
}
