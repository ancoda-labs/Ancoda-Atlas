// Ten-minute news digests for the flood desk.
//
// The wire on /bhotekoshi-flood is a raw list of headlines: useful to someone
// watching it all day, near-useless to someone opening the page for the first
// time at hour nineteen. This module turns each ten-minute window of reporting
// into one short brief, so the page can show how the event actually developed
// rather than a wall of near-duplicate titles.
//
// Written in plain ESM like the rest of the sweep pipeline, so the sweeper and
// the route handler can both drive it and so it runs under bare node.

/** Digest windows are ten minutes wide and aligned to the clock. */
export const BUCKET_MINUTES = 10;

/** The start of the ten-minute window a moment falls in. */
export function bucketStartFor(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / BUCKET_MINUTES) * BUCKET_MINUTES);
  return d;
}

export function bucketEndFor(start) {
  return new Date(start.getTime() + BUCKET_MINUTES * 60 * 1000);
}

// How each language is named to the model. Kept here rather than imported from
// the TypeScript registry because this module also runs under bare node in the
// sweep pipeline, where only plain ESM resolves.
//
// Only the codes with a script worth naming are listed. The registry now holds
// well over a hundred languages and mirroring all of them here would be two
// lists to keep in step; callers that know the language pass its name directly
// as the last argument to draftDigest, and this map is the fallback for the
// stored ten-minute digests, which only ever ask for English or Nepali.
const LANGUAGE_NAME = {
  en:  'English',
  ne:  'Nepali (Devanagari script)',
  mai: 'Maithili (Devanagari script)',
  bho: 'Bhojpuri (Devanagari script)',
  thr: 'Tharu (Devanagari script)',
  taj: 'Tamang (Devanagari script)',
  new: 'Nepal Bhasa / Newar (Devanagari script)',
  bjj: 'Bajjika (Devanagari script)',
  mag: 'Magar Dhut (Devanagari script)',
  awa: 'Awadhi (Devanagari script)',
  dty: 'Doteli (Devanagari script)',
};

const SYSTEM_PROMPT = `You are the wire editor for Ancoda Atlas, a Nepal natural-hazard monitoring desk, writing a short brief on the Rasuwa-Bhotekoshi flood.

Your readers are affected families, volunteers and responders. Write plainly.

Absolute rules:
- Use ONLY the headlines given to you. Never add a fact, number, place or name that is not in them.
- Never invent or estimate casualty, damage or displacement figures. If the headlines disagree on a number, say that they disagree.
- Attribute anything contested to the outlet that reported it.
- No speculation about what will happen next, and no advice beyond what the headlines state.
- If the headlines are thin or repetitive, write a short brief saying so. Do not pad.

Return STRICT JSON and nothing else, in this shape:
{"headline": "under 80 characters", "summary": "two or three sentences", "bullets": ["short point", "short point"]}
Use at most 4 bullets. Each bullet is one clause, under 120 characters.`;

function buildUserPrompt(items, lang, windowLabel, languageName) {
  const lines = items.map((item, i) => `${i + 1}. [${item.source}] ${item.title}`).join('\n');
  return `Window: ${windowLabel}
Headlines that arrived in this window (${items.length}):

${lines}

Write the brief in ${LANGUAGE_NAME[lang] || languageName || 'English'}. Every field of the JSON must be in that language. Return only the JSON object.`;
}

/** Pull the first JSON object out of a model response that may be fenced or prefaced. */
function extractJson(text) {
  if (!text) return null;
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * A digest written without a model: the strongest headline, plus the distinct
 * ones under it. No claim is made that Atlas did not receive verbatim.
 */
function extractiveDraft(items, lang) {
  const ne = lang === 'ne';
  const sources = [...new Set(items.map(i => i.source))];
  const seen = new Set();
  const bullets = [];
  for (const item of items) {
    // Near-duplicate syndicated copy is the norm on a wire; key on the opening
    // words so the same story from six outlets does not fill the brief.
    const key = item.title.toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]/g, '').split(' ').slice(0, 6).join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(clean(`${item.title} — ${item.source}`, 120));
    if (bullets.length === 4) break;
  }

  const headline = clean(items[0]?.title || (ne ? 'नयाँ समाचार' : 'New reporting'), 80);
  // Two claims withheld on purpose. Nothing about the window's length: the
  // stored digests really are ten minutes wide, the live overview brief covers
  // a whole day, and one wording cannot be true of both. And nothing about the
  // headlines being verbatim, because this draft may be translated downstream
  // — what stays true either way is that no model wrote it.
  const summary = ne
    ? `${sources.length} स्रोतबाट ${items.length} समाचार, तल सूचीबद्ध। यो संक्षेप कुनै मोडेलले लेखेको होइन।`
    : `${items.length} reports from ${sources.length} outlets, listed below. No model wrote this brief.`;

  return { headline, summary, bullets };
}

/**
 * A digest with no model in it, in one of the wire languages.
 *
 * This is the whole brief for the overview panel: the desk stopped asking a
 * model to *write* about a disaster, because a summary that reads well is
 * indistinguishable from a summary that is right, and neither the reader nor
 * Atlas can tell them apart from the page. Listing what the outlets filed is
 * weaker prose and a stronger claim.
 */
export function extractiveDigest(items, lang) {
  if (!items.length) {
    return {
      headline: lang === 'ne' ? 'नयाँ समाचार छैन' : 'No new reporting',
      summary: lang === 'ne'
        ? 'यस अवधिमा कुनै नयाँ समाचार आएन।'
        : 'No new reporting arrived in this window.',
      bullets: [],
    };
  }
  return extractiveDraft(items, lang);
}

const TRANSLATE_PROMPT = `You are a translator for Ancoda Atlas, a Nepal natural-hazard monitoring desk.

You translate. You do not write, summarise, shorten, expand or comment.

Absolute rules:
- Translate every field into the target language and nothing else.
- Keep every number, date, place name and outlet name exactly as given. Do not convert units or numerals.
- Keep the same number of bullets, in the same order. Never merge, drop or add one.
- If a phrase has no natural equivalent, transliterate it rather than replacing it with something else.

Return STRICT JSON and nothing else, in the shape you were given:
{"headline": "...", "summary": "...", "bullets": ["...", "..."]}`;

/**
 * Translate a finished draft, leaving what it says alone.
 *
 * The model is allowed to carry the brief across languages and nothing more.
 * That is a narrower job than writing one and it fails more visibly: a
 * translation that drops or invents a bullet is caught here by counting them,
 * and a failed call leaves the original standing rather than producing
 * nothing. Callers are told which happened so the page can label a translated
 * brief as translated — a headline is no longer verbatim once it has been
 * through a model, and the reader is entitled to know that.
 *
 * @returns {Promise<{ draft: object, model: string|null, translated: boolean }>}
 */
export async function translateDigest(provider, draft, lang, languageName = null) {
  if (!provider?.isConfigured) return { draft, model: null, translated: false };

  const target = LANGUAGE_NAME[lang] || languageName || 'English';
  const user = `Target language: ${target}

Translate this brief into ${target}. Return only the JSON object.

${JSON.stringify(draft)}`;

  try {
    const { text } = await provider.complete(TRANSLATE_PROMPT, user, { maxTokens: 900, timeout: 45_000 });
    const parsed = extractJson(text);
    const headline = clean(parsed?.headline, 80);
    const summary = clean(parsed?.summary, 600);
    const bullets = Array.isArray(parsed?.bullets)
      ? parsed.bullets.map(b => clean(b, 160)).filter(Boolean)
      : [];
    // A translation that lost or gained a point is not a translation.
    if (headline && summary && bullets.length === draft.bullets.length) {
      return { draft: { headline, summary, bullets }, model: provider.name || null, translated: true };
    }
    console.warn('[Digest] Translation did not come back intact; keeping the original');
  } catch (err) {
    console.warn('[Digest] Translation failed; keeping the original:', err?.message || err);
  }
  return { draft, model: null, translated: false };
}

/**
 * Write one digest for one window in one language.
 *
 * Falls back to the extractive draft whenever no LLM is configured or the model
 * fails, and always reports which of the two produced the text — a reader on a
 * disaster page is entitled to know whether a machine summarised the news or
 * merely listed it.
 *
 * @returns {Promise<{ draft: { headline: string, summary: string, bullets: string[] }, generator: 'llm'|'extractive', model: string|null }>}
 */
export async function draftDigest(provider, items, lang, windowLabel = '', languageName = null) {
  if (!items.length) {
    return {
      draft: {
        headline: lang === 'ne' ? 'नयाँ समाचार छैन' : 'No new reporting',
        summary: lang === 'ne'
          ? 'यस दस-मिनेटे अवधिमा कुनै नयाँ समाचार आएन।'
          : 'No new reporting arrived in this ten-minute window.',
        bullets: [],
      },
      generator: 'extractive',
      model: null,
    };
  }

  if (provider?.isConfigured) {
    try {
      const { text } = await provider.complete(SYSTEM_PROMPT, buildUserPrompt(items, lang, windowLabel, languageName), {
        maxTokens: 700,
        timeout: 45_000,
      });
      const parsed = extractJson(text);
      const headline = clean(parsed?.headline, 80);
      const summary = clean(parsed?.summary, 600);
      if (headline && summary) {
        const bullets = Array.isArray(parsed.bullets)
          ? parsed.bullets.map(b => clean(b, 120)).filter(Boolean).slice(0, 4)
          : [];
        return { draft: { headline, summary, bullets }, generator: 'llm', model: provider.name || null };
      }
      console.warn('[Digest] Model response was not usable JSON; falling back to extractive');
    } catch (err) {
      console.warn('[Digest] Model call failed; falling back to extractive:', err?.message || err);
    }
  }

  return { draft: extractiveDraft(items, lang), generator: 'extractive', model: null };
}
