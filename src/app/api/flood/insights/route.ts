import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { extractiveDigest, translateDigest } from '@/lib/news-digest.mjs';
import type { DigestDraft } from '@/lib/news-digest.mjs';
import { cacheFor, noStore } from '@/lib/http-cache';
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
// No model writes this brief. The panel lists what the outlets filed and says
// so: on a page people use to decide whether to move, prose a model composed
// about a disaster reads exactly as confidently when it is wrong as when it is
// right, and nothing on the page can tell the reader which it got. Listing
// headlines is weaker writing and a stronger claim, so that is what it does.
//
// The key still earns its keep, on the one job where a model's mistakes are
// catchable: carrying that brief into the reader's language. A translation can
// be checked against the original — the bullets are counted, and a call that
// loses one is discarded — and a brief that has been through a model is
// labelled as translated, because a headline is no longer verbatim afterwards.

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_TTL_S = CACHE_TTL_MS / 1000;
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

/**
 * Whether the brief still needs carrying into the reader's language.
 *
 * Decided on the text, not the language code. The wire is mixed — most of
 * these headlines are filed in Nepali, a few in English — and the extractive
 * draft reproduces whatever it was handed, so an English reader can be shown a
 * page of Devanagari under a label that says English. What the headlines are
 * actually written in is the only thing that settles it.
 */
function needsTranslation(draft: DigestDraft, lang: string): boolean {
  const body = [draft.headline, ...draft.bullets].join(' ');
  const hasDevanagari = /[\u0900-\u097F]/.test(body);
  if (lang === 'ne') return !hasDevanagari;
  if (lang === 'en') return hasDevanagari;
  return true;
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

  // The brief is always written from the headlines themselves, in the language
  // they arrive in. Anything beyond Nepali and English needs the translator, so
  // without a key those requests land on Nepali — and the response says which
  // language it actually is, so the panel never puts a Maithili label on
  // Nepali prose.
  const writable = hasModel || isWireLanguage(requested.code) ? requested : findLanguage('ne');
  const fellBackFrom = writable.code === requested.code ? undefined : requested.code;

  // Wire languages are drafted directly; everything else is drafted in Nepali
  // and carried across. Nepali rather than English because that is the language
  // most of these headlines are filed in, so it is the shorter journey.
  const sourceLang = isWireLanguage(writable.code) ? writable.code : 'ne';
  const drafted = extractiveDigest(items, sourceLang);

  const { draft, model, translated } = needsTranslation(drafted, writable.code)
    ? await translateDigest(provider, drafted, writable.code, writable.english)
    : { draft: drafted, model: null, translated: false };

  // A translation that failed leaves Nepali on the page, and saying so is the
  // same statement the picker already makes about a language it cannot write.
  const lang = translated || sourceLang === writable.code ? writable.code : sourceLang;

  const sources: DigestSource[] = items.slice(0, 8).map(i => ({
    title: i.title,
    url: i.link,
    source: i.source,
  }));

  const insight: FloodInsight = {
    ...draft,
    sources,
    itemCount: items.length,
    generator: 'extractive',
    model,
    translated,
    lang,
    fellBackFrom: lang === requested.code ? undefined : fellBackFrom ?? requested.code,
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
    return cacheFor(res, { edge: CACHE_TTL_S });
  }

  // One in-flight build per language: the panel polls, and neither the wire
  // fetch nor a translation is something to start twice because two readers
  // arrived together.
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
    const data = await inflight;
    const res = NextResponse.json(data);
    // Only a brief that actually got built is worth reusing. The wire fetch and
    // any translation together are the most expensive thing this route does, so
    // when one succeeds, let the edge answer with it for the full ten minutes.
    return data.insight ? cacheFor(res, { edge: CACHE_TTL_S }) : noStore(res);
  } catch (err) {
    console.error('[Insights API] Failed:', errorMessage(err));
    return noStore(NextResponse.json({ insight: null, hasModel: false, reason: 'unavailable' } satisfies FloodInsightFeed));
  }
}
