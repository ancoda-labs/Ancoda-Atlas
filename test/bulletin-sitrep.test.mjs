// Devanagari / plus-suffix parsing for the Rasuwa flood bulletin figures.
//
// Run: node --experimental-strip-types --test test/bulletin-sitrep.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBulletinFigure } from '../src/apis/sources/bulletin-sitrep.mjs';

test('Devanagari numerals become a number', () => {
  assert.deepEqual(parseBulletinFigure('७८८'), { value: 788, suffix: undefined });
  assert.deepEqual(parseBulletinFigure('२,५०२'), { value: 2502, suffix: undefined });
});

test('a trailing plus is meaning, not formatting', () => {
  assert.deepEqual(parseBulletinFigure('२००+'), { value: 200, suffix: '+' });
});

test('a word instead of a count is dropped', () => {
  assert.equal(parseBulletinFigure('अलग'), null);
  assert.equal(parseBulletinFigure(''), null);
});
