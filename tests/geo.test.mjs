import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPoly, polyBBox, pointBlocked, segmentClear, segDist2 } from '../src/geo.js';
const sq = (x0, z0, x1, z1) => [x0, z0, x1, z0, x1, z1, x0, z1];
const obst = { buildings: [{ p: sq(10, -5, 20, 5), bb: polyBBox(sq(10, -5, 20, 5)) }], water: [{ p: sq(40, -5, 50, 5), bb: polyBBox(sq(40, -5, 50, 5)) }], ribbons: [{ p: [70, -50, 70, 50], half: 3 }] };
const blocked = (x, z) => pointBlocked(x, z, obst);
test('pointInPoly, polyBBox, segDist2', () => { assert.equal(pointInPoly(15, 0, sq(10, -5, 20, 5)), true); assert.equal(pointInPoly(25, 0, sq(10, -5, 20, 5)), false); assert.deepEqual(polyBBox(sq(10, -5, 20, 5)), [10, -5, 20, 5]); assert.equal(segDist2(0, 3, -10, 0, 10, 0), 9); });
test('pointBlocked: здание, вода, лента, дырка', () => {
  assert.equal(blocked(15, 0), true); assert.equal(blocked(5, 0), false);
  assert.equal(blocked(45, 0), true); assert.equal(blocked(72, 0), true); assert.equal(blocked(74, 0), false);
  const withHole = { buildings: [{ p: sq(0, 0, 30, 30), holes: [sq(10, 10, 20, 20)], bb: polyBBox(sq(0, 0, 30, 30)) }], water: [], ribbons: [] };
  assert.equal(pointBlocked(15, 15, withHole), false); assert.equal(pointBlocked(5, 5, withHole), true);
  assert.equal(pointBlocked(5, 5, null), false);
});
test('segmentClear: мимо здания свободно, сквозь здание, воду и ленту закрыто, конец в здании закрыт', () => {
  assert.equal(segmentClear(0, 10, 30, 10, 2, blocked), true);
  assert.equal(segmentClear(0, 0, 30, 0, 2, blocked), false);
  assert.equal(segmentClear(30, 0, 60, 0, 2, blocked), false);
  assert.equal(segmentClear(60, 0, 80, 0, 2, blocked), false);     // лента полуширины 3 при шаге 2
  assert.equal(segmentClear(0, 0, 15, 0, 2, blocked), false);      // конец внутри здания
  assert.equal(segmentClear(0, 0, 0, 0, 2, blocked), true);
  assert.equal(segmentClear(0, 0, 30, 10, 2, () => true), false);  // незагруженный тайл: всё закрыто
});
