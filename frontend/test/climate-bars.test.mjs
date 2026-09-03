// Linear scale for the cumulative CO₂ bars. A log scale would hide the finding.

import test from 'node:test';
import assert from 'node:assert/strict';
import { barPercent, barWidth, sortMetricRows } from '../src/lib/climate-bars.ts';

test('Nepal is a sliver next to the United States on a linear scale', () => {
  const nepal = barPercent(0.01, 24);
  const us = barPercent(24, 24);
  assert.equal(us, 100);
  assert.ok(nepal < 0.05);
  assert.ok(nepal > 0);
});

test('a zero max produces no bar rather than Infinity', () => {
  assert.equal(barPercent(0.01, 0), 0);
  assert.equal(barWidth(0.01, 0), '0px');
});

test('true width is not clamped above 1px', () => {
  assert.equal(barWidth(24, 24), 'max(1px, 100%)');
  const nepal = barWidth(0.01, 24);
  assert.ok(nepal.startsWith('max(1px, '));
  assert.ok(nepal.endsWith('%)'));
  const pct = Number(nepal.slice('max(1px, '.length, -2));
  assert.ok(pct < 0.05);
  assert.ok(pct > 0);
});

test('rows re-sort descending and Nepal stays in the list', () => {
  const sorted = sortMetricRows([
    { id: 'nepal', value: 0.01 },
    { id: 'unitedStates', value: 24 },
    { id: 'china', value: 15 },
  ]);
  assert.deepEqual(sorted.map(row => row.id), ['unitedStates', 'china', 'nepal']);
});
