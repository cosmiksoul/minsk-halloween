import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../src/graph.js';
// маленький граф: улица Ленина по оси x, два безымянных отростка
const g = new Graph([{ p: [0, 0, 100, 0], k: 'minor', n: 'Ленина' }, { p: [100, 0, 100, 100], k: 'minor' }, { p: [0, 0, 0, 100], k: 'minor' }]);
test('nearest, within, route', () => { const a = g.nearest(0, 0), b = g.nearest(100, 0); assert.ok(a >= 0 && b >= 0 && a !== b); assert.equal(g.within(50, 0, 60).length, 2); assert.ok(Math.abs(g.route(a, b).cost - 100) < 1e-6); });
test('edgePoint: точка на ребре у узла, null в самом узле', () => { const b = g.nearest(100, 0); const ep = g.edgePoint(b, 60, 0); assert.equal(ep.to, g.nearest(0, 0)); assert.ok(Math.abs(ep.t - 0.4) < 1e-6); assert.equal(g.edgePoint(b, 100, 1), null); });
test('nearestEdgePoint: проекция на середину ребра и null далеко', () => {
  const ep = g.nearestEdgePoint(50, 7); assert.ok(Math.abs(ep.t - 0.5) < 1e-6); assert.ok(Math.abs(ep.d - 7) < 1e-6); assert.ok(Math.abs(ep.x - 50) < 1e-6); assert.ok(Math.abs(ep.z) < 1e-6);
  assert.equal(g.nearestEdgePoint(50, 500, 140), null);
});
test('проезжие части в графе: major-дорога даёт рёбра и имя', () => {
  const g2 = new Graph([{ p: [0, 0, 100, 0], k: 'major', n: 'праспект Незалежнасці' }, { p: [100, 0, 100, 50], k: 'path' }]);
  const a = g2.nearest(0, 0, 1), b = g2.nearest(100, 50, 1); assert.ok(a >= 0 && b >= 0); assert.ok(Math.abs(g2.route(a, b).cost - 150) < 1e-6); assert.equal(g2.names[a], 'праспект Незалежнасці');
});

test('nearestEdgePoint: длинное ребро, концы которого дальше радиуса (проспект, мост)', () => {
  // проспект 1000 м одним ребром, тротуар возвращается к его середине на 50 м; точка в 10 м от проспекта и в 40 м от тротуара
  const g3 = new Graph([{ p: [0, 0, 1000, 0], k: 'major', n: 'праспект' }, { p: [1000, 0, 1000, 50, 500, 50], k: 'path' }]);
  const P = g3.nearestEdgePoint(500, 10, 140); assert.ok(P); assert.ok(Math.abs(P.d - 10) < 1e-6); assert.ok(Math.abs(P.x - 500) < 1e-6); assert.ok(Math.abs(P.z) < 1e-6);
  assert.ok(g3.names[P.from] === 'праспект' && g3.names[P.to] === 'праспект');
  const plan = g3.planRoute({ from: g3.nearest(0, 0, 1), to: g3.nearest(0, 0, 1), t: 0, len: 1 }, 500, 10);
  assert.ok(plan && Math.abs(plan.cost - 500) < 1e-6 && Math.abs(plan.endX - 500) < 1e-6 && Math.abs(plan.endZ) < 1e-6);
});

test('targetPoint: точка на ребре, узел у его концов, null без сети', () => {
  const T = g.targetPoint(60, 5); assert.ok(Math.abs(T.x - 60) < 1e-6 && Math.abs(T.z) < 1e-6 && Math.abs(T.d - 5) < 1e-6);
  const N = g.targetPoint(1, 4); assert.equal(N.node, g.nearest(0, 0, 1)); assert.equal(N.x, 0);
  assert.equal(g.targetPoint(50, 500, 140), null);
});

test('nearestAny: ближайший узел с любого расстояния', () => { assert.equal(g.nearestAny(5000, 4900), g.nearest(100, 100, 1)); assert.equal(g.nearestAny(-3, 2), g.nearest(0, 0, 1)); });

test('nearestNamed: имя соседней улицы, null далеко', () => { assert.equal(g.nearestNamed(100, 60, 150), 'Ленина'); assert.equal(g.nearestNamed(100, 1000, 150), null); });
test('planRoute: до точки на ребре с stopT и ценой', () => {
  const pos = { from: g.nearest(0, 0), to: g.nearest(0, 0), t: 0, len: 1 };
  const pl = g.planRoute(pos, 60, 0); assert.ok(pl); assert.ok(Math.abs(pl.cost - 60) < 1e-6); assert.ok(Math.abs(pl.endX - 60) < 1e-6); assert.ok(pl.stopT != null);
  assert.equal(g.planRoute(pos, 5000, 5000), null);
});
test('planRoute: цель на текущем ребре позади — разворот', () => {
  const a = g.nearest(0, 0), b = g.nearest(100, 0); const pl = g.planRoute({ from: a, to: b, t: 0.8, len: 100 }, 30, 0);
  assert.equal(pl.onEdge, true); assert.equal(pl.swap, true); assert.ok(Math.abs(pl.cost - 50) < 1e-6); assert.ok(Math.abs(pl.endX - 30) < 1e-6);
});
test('planRoute: до узла без точки на ребре', () => { const pos = { from: g.nearest(0, 0), to: g.nearest(0, 0), t: 0, len: 1 }; const pl = g.planRoute(pos, 100, 100); assert.equal(pl.ep, null); assert.ok(Math.abs(pl.cost - 200) < 1e-6); assert.equal(pl.stopT, null); assert.equal(pl.nodes.length, 2); });
