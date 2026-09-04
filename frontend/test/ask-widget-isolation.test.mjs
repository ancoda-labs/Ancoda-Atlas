/**
 * Ask Atlas language pickers must move their own surface and nothing else.
 *
 * The floating widget and the flood desk panel each hold answer-language state.
 * Neither may reach for the site chrome's language action: `useFloodLang()`
 * returns a setter as well as a value, and destructuring both would let a
 * side-panel picker retitle the whole site.
 *
 * These are source assertions rather than render tests because the repo has no
 * component harness, and because what matters here is precisely which symbols
 * each module is allowed to reach for.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const widget = readFileSync(join(root, 'src/components/AskAtlasWidget.tsx'), 'utf8');
const panel = readFileSync(
  join(root, 'src/app/bhotekoshi-flood/_components/FloodAskPanel.tsx'),
  'utf8',
);

test('neither surface imports the shared language action', () => {
  for (const [name, source] of [
    ['widget', widget],
    ['panel', panel],
  ]) {
    assert.equal(
      /from '@\/store\/slices\/langSlice'/.test(source),
      false,
      `${name} must not import langSlice`,
    );
    assert.equal(/\bsetLang\b/.test(source), false, `${name} must not reference setLang`);
  }
});

test('neither surface dispatches to the store', () => {
  for (const [name, source] of [
    ['widget', widget],
    ['panel', panel],
  ]) {
    assert.equal(
      /useAppDispatch|\bdispatch\(/.test(source),
      false,
      `${name} must not dispatch`,
    );
  }
});

test('the widget takes the value from useFloodLang and not the setter', () => {
  const match = widget.match(/const \[([^\]]*)\] = useFloodLang\(\)/);
  assert.ok(match, 'expected the widget to read the site language');
  // One binding, no comma: `[siteLang]`, never `[siteLang, setLang]`.
  assert.equal(match[1].includes(','), false, `destructured a setter: ${match[1]}`);
});

test('the panel takes lang as a prop and never calls useFloodLang', () => {
  assert.match(panel, /lang: SiteLang|lang: 'en' \| 'ne'|\{ lang \}/);
  assert.equal(
    /useFloodLang/.test(panel),
    false,
    'the flood panel must not call useFloodLang',
  );
});

test('the widget writes its own storage key, not the site language key', () => {
  assert.match(widget, /const ASK_LANG_KEY = 'atlas_ask_language'/);
  assert.equal(
    widget.includes("'atlas_language'"),
    false,
    "the widget must not touch the site chrome's key",
  );
});

test('the panel writes translations into byLang and never assigns source in the carry path', () => {
  // Carry path updates byLang only. Assigning source there would lose the
  // desk's composed wording when switching back to English.
  assert.match(panel, /byLang: \{ \.\.\.turn\.byLang, \[answerLang\]: item\.text \}/);
  const carryAssignsSource = /source:\s*(item\.text|result\.|translated)/.test(panel);
  assert.equal(carryAssignsSource, false, 'carry must not assign source');
});

test('only turn.source is sent to the translate endpoint', () => {
  assert.match(panel, /missing\.map\(t => t\.source\)/);
  assert.equal(
    /retranslate\.mutateAsync\(\{ texts: missing\.map\(t => t\.(byLang|text)/.test(panel),
    false,
  );
});

test('both pickers still offer the whole registry', () => {
  for (const [name, source] of [
    ['widget', widget],
    ['panel', panel],
  ]) {
    assert.ok(
      /NEPAL_LANGUAGES/.test(source) && /WORLD_LANGUAGES/.test(source),
      `${name} should offer both groups`,
    );
  }
});

test('the observer watches the slot, never panelRef', () => {
  assert.match(panel, /observer\.observe\(slot\)/);
  assert.equal(
    /observer\.observe\(panelRef/.test(panel),
    false,
    'observing the panel would latch docked forever',
  );
});

test('exactly one panel const — never a second chat for the docked state', () => {
  const matches = panel.match(/const panel = \(/g) || [];
  assert.equal(matches.length, 1, `expected one panel const, found ${matches.length}`);
});

test('the slot holds slotHeight while docked', () => {
  assert.match(panel, /docked && slotHeight \? \{ height: slotHeight \}/);
});
