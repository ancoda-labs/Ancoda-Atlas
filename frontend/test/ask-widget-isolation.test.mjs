/**
 * The ask widget's language picker must move the ask widget and nothing else.
 *
 * It sits on every page beside two other language controls — the site chrome's
 * English/नेपाली toggle and the AI Insights brief picker — and all three read
 * from the same registry. The failure this guards against is a one-line one:
 * `useFloodLang()` returns a setter as well as a value, and destructuring both
 * would let this picker retitle the whole site. Nothing about that would look
 * wrong in review.
 *
 * These are source assertions rather than render tests because the repo has no
 * component harness, and because what matters here is precisely which symbols
 * the module is allowed to reach for.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const widget = readFileSync(join(root, 'src/components/AskAtlasWidget.tsx'), 'utf8');
const insights = readFileSync(
  join(root, 'src/app/bhotekoshi-flood/_components/FloodAiInsights.tsx'),
  'utf8',
);

test('the widget never imports the shared language action', () => {
  assert.equal(/from '@\/store\/slices\/langSlice'/.test(widget), false);
  assert.equal(/\bsetLang\b/.test(widget), false);
});

test('the widget never dispatches to the store', () => {
  assert.equal(/useAppDispatch|\bdispatch\(/.test(widget), false);
});

test('the widget takes the value from useFloodLang and not the setter', () => {
  const match = widget.match(/const \[([^\]]*)\] = useFloodLang\(\)/);
  assert.ok(match, 'expected the widget to read the site language');
  // One binding, no comma: `[siteLang]`, never `[siteLang, setLang]`.
  assert.equal(match[1].includes(','), false, `destructured a setter: ${match[1]}`);
});

test('the widget writes its own storage key, not the site language key', () => {
  assert.match(widget, /const ASK_LANG_KEY = 'atlas_ask_language'/);
  assert.equal(
    widget.includes("'atlas_language'"),
    false,
    "the widget must not touch the site chrome's key",
  );
});

test('the widget and the brief hold separate language state', () => {
  // Different variables, so changing one cannot move the other.
  assert.match(widget, /const \[answerLang, setAnswerLangState\] = useState/);
  assert.match(insights, /const \[briefLang, setBriefLang\] = useState/);
  assert.equal(widget.includes('briefLang'), false);
  assert.equal(insights.includes('answerLang'), false);
});

test('both pickers still offer the whole registry', () => {
  for (const [name, source] of [['widget', widget], ['insights', insights]]) {
    assert.ok(
      /NEPAL_LANGUAGES/.test(source) && /WORLD_LANGUAGES/.test(source),
      `${name} should offer both groups`,
    );
  }
});
