// Sparkline geometry for the climate What Arrived panel.

import test from 'node:test';
import assert from 'node:assert/strict';
import { sparkDot, sparkPoints, sparkPolylines } from '../src/lib/climate-spark.ts';

test('a rising series ends at the top-right', () => {
  const points = sparkPoints([0, 10], 100, 20);
  assert.equal(points, '0.0,20.0 100.0,0.0');
});

test('null years break the line rather than connecting across the gap', () => {
  const lines = sparkPolylines([2, null, 2], 100, 20);
  assert.equal(lines.length, 2);
  assert.equal(sparkPoints([2, null, 2], 100, 20).split(' ').length, 1);
});

test('an empty series produces no points', () => {
  assert.equal(sparkPoints([], 100, 20), '');
  assert.equal(sparkPoints([null, null], 100, 20), '');
  assert.equal(sparkDot([null, null], 100, 20), null);
});

test('the latest numeric year is the orange dot', () => {
  const dot = sparkDot([1, null, 4], 100, 20);
  assert.deepEqual(dot, { x: 100, y: 0 });
});

