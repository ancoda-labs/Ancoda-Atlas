import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { draftDigest } from '@/lib/news-digest.mjs';
import { canGenerateIn, findLanguage } from '@/lib/nepal-languages';
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

  const { fetchTopicNews } = await import('@/apis/sources/nepal-news.mjs');
  const data = await fetchTopicNews({ topic: 'flood', window: '24h', limit: 30, sourceCap: 8 });
  const items: NewsItem[] = Array.isArray(data.items) ? data.items : [];

  const provider = await loadProvider();
  const hasModel = Boolean(provider?.isConfigured);

  if (!items.length) return { insight: null, hasModel, reason: 'no_reporting' };

  // What can honestly be written, which is narrower than what was asked for in
  // two different ways:
  //
  //   With a model, every language the registry marks generatable is fair game.
  //   Anything it marks 'minimal' is answered in Nepali instead of letting the
  //   model improvise a language it does not really know.
  //
  //   With no model there is no translation at all — the extractive draft
  //   reproduces headlines, and those arrive from the outlets in Nepali and
  //   English. Every other language therefore also lands on Nepali.
  //
  // Either way the response says which language it actually is, so the panel
  // never puts a Maithili label on English prose.
  const writable = hasModel
    ? (canGenerateIn(requested) ? requested : findLanguage('ne'))
    : (requested.code === 'en' ? requested : findLanguage('ne'));
  const fellBackFrom = writable.code === requested.code ? undefined : requested.code;
  const { draft, generator, model } = await draftDigest(
    provider,
    items,
    writable.code,
    'the last 24 hours',
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
