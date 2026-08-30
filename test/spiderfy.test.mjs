// Circle / spiral leaf placement for the flood-corridor map.
//
// Run: node --experimental-strip-types --test test/spiderfy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIRCLE_SPIRAL_SWITCHOVER,
  circleOffsets,
  fitLeaves,
  separateLeaves,
  spiderOffsets,
  spiralOffsets,
} from '../src/lib/spiderfy.ts';

test('a small cluster sits on a ring, a large one on a spiral', () => {
  assert.equal(spiderOffsets(3).length, 3);
  assert.equal(spiderOffsets(CIRCLE_SPIRAL_SWITCHOVER).length, CIRCLE_SPIRAL_SWITCHOVER);
  const ring = circleOffsets(4, 70);
  assert.ok(ring.every(p => Math.abs(Math.hypot(p.x, p.y) - 70) < 1e-6));
  const spiral = spiralOffsets(12);
  const radii = spiral.map(p => Math.hypot(p.x, p.y));
  assert.ok(radii[radii.length - 1] > radii[0]);
});

test('fitLeaves keeps every photograph inside the map', () => {
  const origin = { x: 380, y: 40 };
  const offsets = spiderOffsets(13, 44);
  const fitted = fitLeaves(origin, offsets, {
    w: 400,
    h: 320,
    pad: 28,
    padLeft: 120,
    padRight: 44,
    padBottom: 36,
  });
  for (const p of fitted) {
    const x = origin.x + p.x;
    const y = origin.y + p.y;
    assert.ok(x >= 120 && x <= 400 - 44, `x ${x} left the stage`);
    assert.ok(y >= 28 && y <= 320 - 36, `y ${y} left the stage`);
  }
});

test('separateLeaves pulls stacked photographs apart', () => {
  const apart = separateLeaves(
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 1 },
    ],
    40,
  );
  assert.ok(Math.hypot(apart[1].x - apart[0].x, apart[1].y - apart[0].y) >= 40 - 1e-6);
  assert.ok(Math.hypot(apart[2].x - apart[1].x, apart[2].y - apart[1].y) >= 40 - 1e-6);
});
