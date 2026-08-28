import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { draftDigest } from '@/lib/news-digest.mjs';
import { findLanguage, isWireLanguage } from '@/lib/nepal-languages';
import type { DigestSource, FloodInsight, FloodInsightFeed, LLMProviderLike, NewsItem } from '@/types';
import { errorMessage } from '@/types';

export const dynamic = 'force-dynamic';

// A live read of what the flood reporting currently says.
//
// The stored ten-minute digests in /api/flood/digest need Postgres. This one
// deliberately does not: the overview panel has to say something useful on a
// deployment that has an LLM key and nothing else, and on a deployment that has
// neither. So the brief is computed per request, cached in memory, and thrown
// away — the same shape the videos route uses.
//
// Which of the two paths produced the text is carried in the response, because
// a reader deciding whether to act on a summary is entitled to know whether a
// machine wrote the sentence or merely selected it.

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { data: FloodInsightFeed; at: number }>();
const pending = new Map<string, Promise<FloodInsightFeed>>();

async function loadProvider(): Promise<LLMProviderLike | null> {
  try {
    const [{ createLLMProvider }, configModule] = await Promise.all([
      import('@/lib/llm/index.mjs'),
      import('@/atlas.config.mjs'),
    ]);
    return createLLMProvider(configModule.default.llm);
  } catch (err) {
    console.warn('[Insights] No LLM provider available:', errorMessage(err));
    return null;
  }
}

async function build(langCode: string): Promise<FloodInsightFeed> {
  const requested = findLanguage(langCode);

  // Eighteen headlines, not thirty. A wire is mostly syndicated near-duplicates
  // so the extra twelve add little to a four-bullet brief, and every one of them
  // is input tokens on a per-minute budget — Groq's free tier allows 8,000 TPM,
  // which a handful of thirty-headline calls exhausts in seconds.
  const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
  const data = await fetchTopicNews({ topic: 'flood', window: '24h', limit: 18, sourceCap: 8 });
  const items: NewsItem[] = Array.isArray(data.items) ? data.items : [];

  const provider = await loadProvider();
  const hasModel = Boolean(provider?.isConfigured);

  if (!items.length) return { insight: null, hasModel, reason: 'no_reporting' };

  // Every language in the registry is one a model can write, so with a model
  // configured the request is honoured as asked. Without one there is no
  // translation at all — the extractive draft reproduces headlines, and those
  // arrive from the outlets only in Nepali and English — so everything else
  // lands on Nepali. The response says which language it actually is either
  // way, so the panel never puts a Maithili label on Nepali prose.
  const writable = hasModel || isWireLanguage(requested.code) ? requested : findLanguage('ne');
  const fellBackFrom = writable.code === requested.code ? undefined : requested.code;
  const { draft, generator, model } = await draftDigest(
    provider,
    items,
    writable.code,
    'the last 24 hours',
    writable.english,
  );

  const sources: DigestSource[] = items.slice(0, 8).map(i => ({
    title: i.title,
    url: i.link,
    source: i.source,
  }));

  const insight: FloodInsight = {
    ...draft,
    sources,
    itemCount: items.length,
    generator,
    model,
    lang: writable.code,
    fellBackFrom,
    generatedAt: new Date().toISOString(),
  };
  return { insight, hasModel };
}

export async function GET(req: NextRequest) {
  const langCode = req.nextUrl.searchParams.get('lang') || 'ne';
  const key = findLanguage(langCode).code;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    const res = NextResponse.json(hit.data);
    res.headers.set('X-Atlas-Cache', 'hit');
    return res;
  }

  // One in-flight build per language: the panel polls, and a model call is not
  // something to start twice because two readers arrived together.
  let inflight = pending.get(key);
  if (!inflight) {
    inflight = build(key)
      .then(data => {
        if (data.insight) cache.set(key, { data, at: Date.now() });
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, inflight);
  }

  try {
    return NextResponse.json(await inflight);
  } catch (err) {
    console.error('[Insights API] Failed:', errorMessage(err));
    return NextResponse.json({ insight: null, hasModel: false, reason: 'unavailable' } satisfies FloodInsightFeed);
  }
}
