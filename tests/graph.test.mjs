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

// --- эндгейм (план 2026-10-29-endgame-cards, задача 3): проезжая часть на рёбрах, штраф толпе, кольцо и разброс
// проспект (major) 0→200 по оси x и тротуар (path) 0→(0,30)→(200,30)→200: тротуар длиннее на 60 м, но короче проспекта вчетверо
const road = new Graph([{ p: [0, 0, 200, 0], k: 'major', n: 'проспект' }, { p: [0, 0, 0, 30, 200, 30, 200, 0], k: 'path' }]);
test('рёбра major помечены, isMajor и allMajor', () => {
  const a = road.nearest(0, 0, 1), b = road.nearest(200, 0, 1), s = road.nearest(0, 30, 1);
  assert.equal(road.isMajor(a, b), true); assert.equal(road.isMajor(a, s), false); assert.equal(road.allMajor(a), false);
  const only = new Graph([{ p: [0, 0, 100, 0, 200, 0], k: 'major' }]); assert.equal(only.allMajor(only.nearest(100, 0, 1)), true);
});
test('route: толпа идёт тротуаром, игрок по проспекту', () => {
  const a = road.nearest(0, 0, 1), b = road.nearest(200, 0, 1);
  assert.ok(Math.abs(road.route(a, b).cost - 200) < 1e-6);
  const r = road.route(a, b, { crowd: true }); assert.equal(r.nodes.includes(road.nearest(0, 30, 1)), true);
  assert.equal(road.path(a, b, 110, { crowd: true }).includes(road.nearest(0, 30, 1)), true); assert.equal(road.path(a, b).length >= 1, true);
});
test('ring: узлы по цене пути в интервале, без старта', () => {
  const line = new Graph([{ p: [0, 0, 100, 0, 200, 0, 300, 0, 400, 0], k: 'minor' }]); const s = line.nearest(0, 0, 1);
  assert.deepEqual(line.ring(s, 150, 350).map(n => line.x[n]).sort((p, q) => p - q), [200, 300]); assert.deepEqual(line.ring(s, 500, 900), []);
});
test('pickSpaced: разброс и добор ближайшими', () => {
  const line = new Graph([{ p: [0, 0, 100, 0, 200, 0, 300, 0, 400, 0], k: 'minor' }]); const rng = () => 0.5;
  const picked = line.pickSpaced(line.ring(line.nearest(0, 0, 1), 100, 400), 2, 150, rng, 0, 0); assert.equal(picked.length, 2); assert.ok(Math.abs(line.x[picked[0]] - line.x[picked[1]]) >= 150);
  const more = line.pickSpaced([line.nearest(400, 0, 1)], 3, 150, rng, 0, 0); assert.equal(more.length, 3); assert.equal(new Set(more).size, 3);
});

test('pickSpaced: добор только по предикату (достижимые узлы своей компоненты)', () => {
  // две несвязанные улицы: добор не берёт узлы чужой компоненты, даже если они ближе к игроку
  const two = new Graph([{ p: [0, 0, 200, 0, 400, 0, 600, 0], k: 'minor' }, { p: [0, 40, 200, 40, 400, 40], k: 'minor' }]);
  const start = two.nearest(0, 0, 1); const reach = new Set(two.ring(start, 0, 1e4)); assert.ok(reach.size >= 3 && reach.size < two.x.length);
  const picked = two.pickSpaced([], 3, 150, () => 0.5, 0, 0, n => reach.has(n));
  assert.equal(picked.length, 3); assert.equal(new Set(picked).size, 3); for (const n of picked) assert.ok(reach.has(n));
});
