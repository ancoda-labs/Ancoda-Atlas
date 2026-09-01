// Circle / spiral leaf placement for the flood-corridor map.
//
// Run: node --experimental-strip-types --test test/spiderfy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CIRCLE_SPIRAL_SWITCHOVER,
  MAX_SPIDER_LEAVES,
  circleOffsets,
  clusterByPlace,
  clusterByTopic,
  fitLeaves,
  pickSpiderItems,
  separateLeaves,
  spiderLayout,
  spiderLeafBudget,
  spiderOffsets,
  spiralOffsets,
} from '../src/lib/spiderfy.ts';

test('pickSpiderItems prefers photographs and respects the budget', () => {
  const items = [
    { id: 'a' },
    { id: 'b', url: '/b.jpg' },
    { id: 'c', url: '/c.jpg' },
    { id: 'd' },
    { id: 'e', url: '/e.jpg' },
  ];
  assert.deepEqual(pickSpiderItems(items, 2).map(i => i.id), ['b', 'c']);
  assert.equal(pickSpiderItems(items, 0).length, 0);
  assert.equal(pickSpiderItems(items, 9).length, 3);
});

test('spiderLeafBudget never fans a crowded press stack', () => {
  const tight = spiderLeafBudget({ w: 420, h: 300, pad: 24, padTop: 44, padRight: 48, padBottom: 28, padLeft: 286 }, 36, 48);
  assert.ok(tight <= MAX_SPIDER_LEAVES);
  assert.ok(tight < 24);
  const roomy = spiderLeafBudget({ w: 800, h: 500, pad: 24 }, 36, 48);
  assert.equal(roomy, MAX_SPIDER_LEAVES);
});

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

test('spiderLayout keeps a large press cluster inside a narrow stage', () => {
  const origin = { x: 200, y: 40 };
  const bounds = { w: 420, h: 300, pad: 24, padTop: 44, padRight: 48, padBottom: 120 };
  const fitted = spiderLayout(origin, 24, bounds, 40, 48);
  assert.equal(fitted.length, 24);
  for (const p of fitted) {
    const x = origin.x + p.x;
    const y = origin.y + p.y;
    assert.ok(x >= 24 && x <= 420 - 48, `x ${x} left the stage`);
    assert.ok(y >= 44 && y <= 300 - 120, `y ${y} left the stage`);
  }
});

test('clusterByTopic does not merge a DHM station with a headline', () => {
  const groups = clusterByTopic(
    [
      { x: 10, y: 10, layer: 'gauge' },
      { x: 12, y: 11, layer: 'news' },
      { x: 80, y: 80, layer: 'gauge' },
    ],
    40,
  );
  assert.equal(groups.length, 3);
  assert.ok(groups.every(g => g.every(p => p.layer === g[0].layer)));
});

test('clusterByPlace keeps Rasuwa and Nuwakot headlines on their districts', () => {
  const groups = clusterByPlace(
    [
      { x: 10, y: 10, layer: 'news', place: 'Rasuwa' },
      { x: 18, y: 12, layer: 'news', place: 'Rasuwa' },
      { x: 22, y: 14, layer: 'news', place: 'Nuwakot' },
      { x: 11, y: 11, layer: 'gauge', place: 'Rasuwa' },
    ],
    80,
  );
  const news = groups.filter(g => g[0].layer === 'news');
  assert.equal(news.length, 2);
  assert.equal(news.find(g => g[0].place === 'Rasuwa')?.length, 2);
  assert.equal(news.find(g => g[0].place === 'Nuwakot')?.length, 1);
  assert.equal(groups.filter(g => g[0].layer === 'gauge').length, 1);
});
