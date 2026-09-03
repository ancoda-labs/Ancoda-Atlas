import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanNewsTitle } from '../src/lib/climate-news.ts';

test('strips a Google RSS outlet suffix that matches the source field', () => {
  assert.equal(
    cleanNewsTitle(
      'Video shows Arctic glacier calving, not trigger for catastrophic Nepal-Tibet floods - Yahoo',
      'Yahoo',
    ),
    'Video shows Arctic glacier calving, not trigger for catastrophic Nepal-Tibet floods',
  );
});

test('leaves the title alone when the source is not a suffix', () => {
  assert.equal(
    cleanNewsTitle('Glaciers in the Hindu Kush Himalaya lost area', 'ICIMOD'),
    'Glaciers in the Hindu Kush Himalaya lost area',
  );
});

test('collapses extra whitespace', () => {
  assert.equal(cleanNewsTitle('  A   glacier  ', 'PBS'), 'A glacier');
});
