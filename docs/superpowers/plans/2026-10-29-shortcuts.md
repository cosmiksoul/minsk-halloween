# Срезки и попутные мелочи: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Управляемый скелет идёт к близкой цели напрямик, когда дорожка ведёт вокруг, а прямая свободна от зданий, воды и проезжих частей; клик по газону доводит до точки клика; плюс восемь мелочей из спеки (кладбища, улица «во дворах», охотник внутри 150 м, уровень лишнего охотника, имена в журнале, версия модулей, конфеты по клику, кубик 2–7).

**Architecture:** Граф и чистая геометрия выезжают из `sim.js`/`city.js`/`tiles.js` в модули без three.js (`graph.js`, `geo.js`), чтобы расчёт маршрута, точка на ребре и проверка отрезка покрывались тестами в node. `Sim.moveTo` делится на расчёт плана (`planRoute` в `graph.js`, без побочных эффектов) и применение; поверх него ветка срезки, последний отрезок к точке вне графа и возврат на ребро. Препятствия для проверки прямой тайл оставляет в `userData.obst`, `TileManager.blockedAt(x, z)` отвечает на вопрос «точка закрыта?», `Sim` получает эту функцию из `main.js`.

**Tech Stack:** ES‑модули без сборки, three.js 0.170 (только в `city.js`, `tiles.js`, `sim.js`, `game.js`, `main.js`), `node --test`, Python 3 для `tools/version.py`.

**Spec:** `docs/superpowers/specs/2026-10-29-shortcuts-design.md`

## Global Constraints

- База: `main` после PR #7 и PR #8 (e116126); ветка `claude/shortcuts` уже содержит спеку и этот план.
- Числа спеки: `CUT = { maxDist: 60, ratio: 2.5, onPath: 3, step: 2, riverHalf: 13, snapR: 140, say: 0.25 }`; `PURSUIT.spreadNear = 1.5`; радиус подбора конфет `max(3, 0.45 H)`; клик в 12 м от конфеты — цель в её точке; кубик: 1 крит‑провал, 2–7 провал, 8–19 успех, 20 крит.
- Срезает только управляемый игрок по явной цели: `moveTo` получает `{ cut: true }` только из `game.js` (клик по карте, прохожему, конфете, заведению, магазину). Толпа, автопилот, друзья и охотники зовут `moveTo` без опций и не срезают.
- Точка закрыта: внутри здания (с дырками), внутри воды тайла или `big.json`, ближе 13 м к реке, ближе половины ширины к дороге `k === 'major'`; тайл есть в `index.json`, но не загружен → закрыта; тайла нет в `index.json` → открыта.
- Новые модули без импорта three: `src/geo.js`, `src/graph.js`. Тесты: `node --test tests/*.test.mjs`.
- Тексты и комментарии по‑русски, в стиле кода проекта: строки через `'…'`, одна строка на короткую функцию, комментарий над блоком объясняет «зачем».
- Коммиты с трейлерами проекта (`Co-Authored-By`, `Claude-Session`), как в истории.

## Review Focus

1. Клик в точку, где скелет уже стоит (`d = 0`, или ближе досягаемости): ничего не двигается и срезка не начинается. Тест `shouldCut(0, 0) === false` (Task 1).
2. Клик по крыше: конец отрезка внутри здания. Срезки нет, скелет идёт по графу до `T`, последний отрезок закрыт, стоит в `T`. Тест «конец отрезка в здании → закрыт» (Task 2).
3. Узкая проезжая часть (ширина 6 м, половина 3) при шаге выборки 2 м не проскакивает между точками. Тест «лента полуширины 3 поперёк отрезка → закрыт» (Task 2).
4. Свободная точка, рядом с которой нет ребра в 140 м (теоретически невозможно, скелет пришёл с графа, но данные бывают странные): `nearestEdgePoint` даёт `null`, скелет возвращается в точку начала срезки. Тест `nearestEdgePoint` → `null` (Task 4), проверка возврата в браузере (Task 5).
5. Смерть или телепорт посреди срезки (охотник догнал на газоне, респаун у заведения): после `teleport` агент на графе, `free` и `cut` сняты, следующий клик работает по графу. Проверка в браузере (Task 5, шаг «смерть на газоне»).

---

### Task 1: Правила: `CUT`, `shouldCut`, кубик 2–7, кладбища в центре

**Files:**
- Modify: `src/rules.js` (строки 21 `PURSUIT`, 34 `outcomeOf`, 134–144 `pickCemetery`; новый блок `CUT` и `shouldCut` рядом с `RPS`)
- Test: `tests/rules.test.mjs`

**Interfaces:**
- Produces: `export const CUT = { maxDist: 60, ratio: 2.5, onPath: 3, step: 2, riverHalf: 13, snapR: 140, say: 0.25 }`; `export function shouldCut(d, routeCost)` → boolean; `PURSUIT.spreadNear = 1.5`; `outcomeOf` с порогом 7; `pickCemetery` с расширенным пулом.

- [ ] **Step 1: Тесты**

```js
test('outcomeOf пороги', () => { assert.equal(outcomeOf(1), 'critfail'); assert.equal(outcomeOf(2), 'fail'); assert.equal(outcomeOf(7), 'fail'); assert.equal(outcomeOf(8), 'success'); assert.equal(outcomeOf(19), 'success'); assert.equal(outcomeOf(20), 'crit'); });
test('shouldCut: близко и по графу вдвое с половиной дальше', () => {
  assert.equal(shouldCut(20, 50), true); assert.equal(shouldCut(20, 49), false);
  assert.equal(shouldCut(60, 150), true); assert.equal(shouldCut(61, 1000), false);
  assert.equal(shouldCut(20, null), true); assert.equal(shouldCut(0, 0), false); assert.equal(shouldCut(0, null), false);
});
test('pickCemetery: в центре свободное кладбище берётся и в полутора расстояниях до ближайшего', () => {
  const a = { x: 0, z: 2292, node: 1 }, b = { x: 0, z: 3373, node: 2 };
  assert.equal(pickCemetery([a, b], 0, 0, 3, [a]), b);           // 3373 ≤ 1.5 × 2292
  assert.equal(pickCemetery([a, { x: 0, z: 3500, node: 3 }], 0, 0, 3, [a]), a); // 3500 > 3438: берём занятое
  assert.equal(pickCemetery([a], 0, 0, 3, [a]), a);
});
```
Существующий тест «outcomeOf пороги» заменить (там `outcomeOf(10) === 'fail'`).

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `node --test tests/rules.test.mjs`
Expected: FAIL: `shouldCut is not a function`, `outcomeOf(8)` даёт `fail`, второе кладбище не выбрано.

- [ ] **Step 3: Реализовать**

`outcomeOf`: `n <= 7 ? 'fail'`. `shouldCut(d, routeCost)`: `d > 0 && d <= CUT.maxDist && (routeCost == null || routeCost >= CUT.ratio * d)`. `pickCemetery`: `dNear` — минимальное `d` среди всех `items` с `node >= 0`; `pool = free.some(x => x.d <= Math.max(want * PURSUIT.spread, dNear * PURSUIT.spreadNear)) ? free : cand`. В `PURSUIT` добавить `spreadNear: 1.5` и слово в комментарии над ним.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test tests/*.test.mjs`
Expected: все PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/rules.js tests/rules.test.mjs
git commit -m "Правила срезок, кубик 2–7 и кладбища в центре"
```

---

### Task 2: `geo.js`: геометрия без three и проверка отрезка

**Files:**
- Create: `src/geo.js`
- Modify: `src/city.js` (убрать `pointInPoly`, строка 112; импортировать и ре‑экспортировать из `geo.js`), `src/tiles.js` (убрать `segDist2`, строка 101; импорт из `geo.js`)
- Test: `tests/geo.test.mjs`

**Interfaces:**
- Produces: `pointInPoly(x, z, p)` и `segDist2(px, pz, ax, az, bx, bz)` (перенесены как есть; `p` — плоский массив `[x0, z0, x1, z1, …]`); `polyBBox(p)` → `[minX, minZ, maxX, maxZ]`; `pointBlocked(x, z, obst)` → boolean, где `obst = { buildings: [{ p, holes, bb }], water: [{ p, bb }], ribbons: [{ p, half }] }` (`holes` — массив контуров или undefined, `ribbons.p` — полилиния плоским массивом); `segmentClear(ax, az, bx, bz, step, isBlocked)` → boolean, `isBlocked(x, z)` → boolean.

- [ ] **Step 1: Тесты**

```js
import { pointInPoly, polyBBox, pointBlocked, segmentClear } from '../src/geo.js';
const sq = (x0, z0, x1, z1) => [x0, z0, x1, z0, x1, z1, x0, z1];
const obst = { buildings: [{ p: sq(10, -5, 20, 5), bb: polyBBox(sq(10, -5, 20, 5)) }], water: [{ p: sq(40, -5, 50, 5), bb: polyBBox(sq(40, -5, 50, 5)) }], ribbons: [{ p: [70, -50, 70, 50], half: 3 }] };
const blocked = (x, z) => pointBlocked(x, z, obst);
test('pointBlocked: здание, вода, лента, дырка', () => {
  assert.equal(blocked(15, 0), true); assert.equal(blocked(5, 0), false);
  assert.equal(blocked(45, 0), true); assert.equal(blocked(72, 0), true); assert.equal(blocked(74, 0), false);
  const withHole = { buildings: [{ p: sq(0, 0, 30, 30), holes: [sq(10, 10, 20, 20)], bb: polyBBox(sq(0, 0, 30, 30)) }], water: [], ribbons: [] };
  assert.equal(pointBlocked(15, 15, withHole), false); assert.equal(pointBlocked(5, 5, withHole), true);
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
```

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `node --test tests/geo.test.mjs`
Expected: FAIL: модуль `../src/geo.js` не найден.

- [ ] **Step 3: Реализовать `src/geo.js`**

`pointInPoly` и `segDist2` перенести дословно из `city.js:112` и `tiles.js:101`. `pointBlocked`: здания — bbox, потом `pointInPoly(p)` и ни в одной из `holes`; вода — bbox и `pointInPoly`; ленты — `segDist2` до каждого звена `< half²`. `segmentClear`: точки `t = 0, step/len, …, 1` (конец включительно, при `len = 0` одна точка); `false` при первой закрытой. В `city.js`: `import { pointInPoly } from './geo.js'; export { pointInPoly };` (на `pointInPoly` из `city.js` ссылается `tiles.js`, оставить рабочим); в `tiles.js` импорт `segDist2` из `geo.js`.

- [ ] **Step 4: Прогнать тесты и загрузку страницы**

Run: `node --test tests/*.test.mjs` → PASS. Открыть страницу локально: клик по зданию по‑прежнему показывает карточку здания (использует `pointInPoly`).

- [ ] **Step 5: Коммит**

```bash
git add src/geo.js src/city.js src/tiles.js tests/geo.test.mjs
git commit -m "geo.js: геометрия без three и проверка отрезка на препятствия"
```

---

### Task 3: Препятствия тайлов и `TileManager.blockedAt`

**Files:**
- Modify: `src/city.js` (`buildBig` строки 180–187, `buildTile` 190–225), `src/tiles.js` (конструктор 8–19, `loadBig` 20–22, новый метод `blockedAt`), `src/main.js` (после создания `tiles` и `sim`: `sim.blockedAt = (x, z) => tiles.blockedAt(x, z)`)

**Interfaces:**
- Consumes: `polyBBox`, `pointBlocked` из Task 2.
- Produces: `group.userData.obst` у каждого тайла и у группы `big` в формате `obst` из Task 2; `TileManager.blockedAt(x, z)` → boolean по правилам Global Constraints; `sim.blockedAt` — та же функция, которую Task 5 зовёт из `moveTo`.

- [ ] **Step 1: `buildTile`: собрать `obst`**

`buildings: (t.buildings || []).map(b => ({ p: b.p, holes: b.holes, bb: polyBBox(b.p) }))` — все здания, включая пропущенные при отрисовке (`skip`, `SKIP_NAMES`): стоять они не мешают, но проходить сквозь них нельзя; `water: (t.water || []).map(w => ({ p: w.p, bb: polyBBox(w.p) }))`; `ribbons`: река `half: 13` (CUT.riverHalf, импорт из `rules.js`), дороги `k === 'major'` с `half: (r.w ? Math.min(r.w, 24) : W.major) / 2`. `buildBig`: `userData.obst = { buildings: [], water: big.water…, ribbons: [] }`; `loadBig` сохраняет группу в `this.big`.

- [ ] **Step 2: `blockedAt(x, z)`**

`key = this.key(x, z)`; если `!this.keys.has(key)` → `false`; если `!this.loaded.has(key)` → `true`; иначе проверить `pointBlocked` по `obst` тайла и загруженных соседей (8 соседей, незагруженные пропускаются: здания лежат по центроиду и могут заходить в соседний тайл), затем `obst` группы `big`.

- [ ] **Step 3: Проверка в браузере**

В консоли: `__app.tiles.blockedAt(x, z)` для точки внутри крыши здания (клик по зданию даёт `hit` в карточке) → `true`; для точки на дороге → `false`; для точки на реке у Немиги → `true`; для точки за городом (например, `x = 50000`) → `false`. `perf()` без изменений.

- [ ] **Step 4: Коммит**

```bash
git add src/city.js src/tiles.js src/main.js
git commit -m "Препятствия тайлов: здания, вода, река и проезжие части для проверки прямой"
```

---

### Task 4: `graph.js`: граф отдельно, план маршрута, точка на ребре, ближайшая улица

**Files:**
- Create: `src/graph.js` (перенос `Heap` и `Graph` из `src/sim.js` строк 7–99 дословно, плюс новые методы)
- Modify: `src/sim.js` (импорт `Graph` из `./graph.js`; `edgePoint` 312–320 становится делегатом `this.graph.edgePoint`; `streetOf` 226)
- Test: `tests/graph.test.mjs`

**Interfaces:**
- Produces в `Graph`:
  - `edgePoint(node, x, z)` → `{ to, t } | null` (перенос из `Sim.edgePoint`, та же логика: рёбра узла, `t` в 0.03–0.97, не дальше 20 м);
  - `nearestEdgePoint(x, z, maxR = 140)` → `{ from, to, t, x, z, d } | null`: среди узлов сетки в радиусе `maxR` и их рёбер ближайшая проекция на отрезок (`t` зажат в [0, 1]), `d` — расстояние до неё;
  - `nearestNamed(x, z, maxR = 150)` → `string | null`: имя ближайшего узла с `names[n]`;
  - `planRoute(pos, x, z)` → `{ node, ep, swap, nodes, cost, stopT, endX, endZ } | null`, где `pos = { from, to, t, len }` — положение агента на графе. Чистая функция: повторяет вычисления `Sim.moveTo` (PR #8) без записи в агента: выбор старта с разворотом, маршрут, точка на ребре (`stopT`, добавление `ep.to` в `nodes`), `cost` — длина пути до конечной точки (как `routeCost`), `endX/endZ` — координаты конца (точка на ребре или узел). Случай «цель на текущем ребре» возвращается как `{ onEdge: true, swap, stopT, cost, endX, endZ, node }`.
- `Sim.streetOf(a)` → `names[from] || names[to] || graph.nearestNamed(a.x, a.z, 150) || 'во дворах'`.

- [ ] **Step 1: Тесты**

Маленький граф: дороги `[{ p: [0, 0, 100, 0], k: 'minor', n: 'Ленина' }, { p: [100, 0, 100, 100], k: 'minor' }, { p: [0, 0, 0, 100], k: 'minor' }]`.

```js
test('nearestEdgePoint: проекция на середину ребра и null далеко', () => {
  const ep = g.nearestEdgePoint(50, 7); assert.ok(Math.abs(ep.t - 0.5) < 1e-6); assert.ok(Math.abs(ep.d - 7) < 1e-6); assert.ok(Math.abs(ep.x - 50) < 1e-6); assert.ok(Math.abs(ep.z) < 1e-6);
  assert.equal(g.nearestEdgePoint(50, 500, 140), null);
});
test('nearestNamed: имя соседней улицы, null далеко', () => { assert.equal(g.nearestNamed(100, 60, 150), 'Ленина'); assert.equal(g.nearestNamed(100, 1000, 150), null); });
test('planRoute: до точки на ребре с stopT и ценой', () => {
  const pos = { from: g.nearest(0, 0), to: g.nearest(0, 0), t: 0, len: 1 };
  const pl = g.planRoute(pos, 60, 0); assert.ok(pl); assert.ok(Math.abs(pl.cost - 60) < 1e-6); assert.ok(Math.abs(pl.endX - 60) < 1e-6); assert.ok(pl.stopT != null);
});
test('planRoute: цель на текущем ребре позади — разворот', () => {
  const a = g.nearest(0, 0), b = g.nearest(100, 0); const pl = g.planRoute({ from: a, to: b, t: 0.8, len: 100 }, 30, 0);
  assert.equal(pl.onEdge, true); assert.equal(pl.swap, true); assert.ok(Math.abs(pl.cost - 50) < 1e-6);
});
```
Индексы узлов брать через `g.nearest`, не угадывать.

- [ ] **Step 2: Запустить, убедиться, что падают**

Run: `node --test tests/graph.test.mjs` → FAIL: модуль не найден.

- [ ] **Step 3: Реализовать `graph.js`, переключить `sim.js`**

Перенос `Heap`/`Graph` без изменений, затем новые методы. `planRoute` писать как чистую копию логики `Sim.moveTo` строк 319–345 (включая ветку «цель на текущем ребре»), `Sim.moveTo` пока не трогать — его переделывает Task 5. `Sim.edgePoint` оставить тонкой обёрткой, `streetOf` расширить.

- [ ] **Step 4: Прогнать тесты и страницу**

Run: `node --test tests/*.test.mjs` → PASS. Страница грузится, скелет ходит по клику как раньше. В журнале запись во дворе получает улицу или «во дворах»: `__app.sim.streetOf(__app.game.player)` на безымянном узле не пустая.

- [ ] **Step 5: Коммит**

```bash
git add src/graph.js src/sim.js tests/graph.test.mjs
git commit -m "graph.js: граф отдельным модулем, план маршрута, ближайшее ребро и улица"
```

---

### Task 5: Срезка в `Sim`: решение, ход, последний отрезок, возврат на ребро

**Files:**
- Modify: `src/sim.js` (`moveTo` 319–345, `stop` 347, `teleport` 228, `place` 219–222, `setAuto` 290–298, `ghostify` 254+, `updatePlayer` 353–378), `src/bio.js` (`LINES.cut`), `src/rules.js` только импорт `CUT`
- Test: нет модульных (three в `sim.js`); проверка в браузере ниже

**Interfaces:**
- Consumes: `Graph.planRoute`, `nearestEdgePoint` (Task 4), `segmentClear` (Task 2), `sim.blockedAt` (Task 3), `shouldCut`, `CUT` (Task 1).
- Produces: `Sim.moveTo(a, x, z, opts = {})` с `opts.cut` (boolean, по умолчанию false); поля агента `a.free` (стоит вне графа), `a.cut = { x, z, then }` при `a.state === 'cut'`; `then`: `{ kind: 'graph', from, to, t, node }` (встать на граф и `onArrive(a, node)`), `{ kind: 'free' }` (остановиться, `free = true`), `{ kind: 'plan', plan }` (встать на `P` и применить план маршрута), `{ kind: 'auto' }` (встать на `P` и `setAuto(a, true)`); `Sim.snap(a)` — мгновенно поставить свободного агента на ближайшее ребро (для призраков и запасного случая); `Sim.clear(ax, az, bx, bz)` → `segmentClear(…, CUT.step, this.blockedAt || (() => false))`.

- [ ] **Step 1: `moveTo(a, x, z, opts)`**

Порядок:
1. Снятие охотника с `approach` как сейчас (строка 322).
2. `node = g.nearest(x, z, 140)`; если `< 0` и не `opts.cut` → `false`.
3. Положение старта: если `a.free` — `P = g.nearestEdgePoint(a.x, a.z, CUT.snapR)`; нет `P` → `this.snap(a)` в точку начала срезки (`a.cutFrom`, запомненную при старте срезки) и дальше как с графа; `pos` = `P` или текущие `from, to, t, len`.
4. `plan = g.planRoute(pos, x, z)`; `d = |a → цель|`; `L = plan ? |(endX, endZ) → цель| : 0`; `R = plan ? plan.cost + L + (a.free ? |a → P| : 0) : null`.
5. Если `opts.cut && shouldCut(d, R) && this.clear(a.x, a.z, x, z)`: старт срезки прямо к цели: `then` = `plan && L <= CUT.onPath ? { kind: 'graph', …конец плана… } : { kind: 'free' }`; при `kind: 'graph'` `node` = `plan.node`, если конец плана — узел заведения, иначе `-1` (как `onArrive(a, -1)` в PR #8). Вернуть `true`.
6. Иначе, если `a.free`: если `this.clear(a.x, a.z, P.x, P.z)` — срезка к `P` с `then = { kind: 'plan', plan }`; иначе `snap(a)` в точку начала и применить план оттуда (пересчитать от неё).
7. Иначе применить план как сегодняшний `moveTo` (перенос записи `from/to/t/path/stopT/routeCost`), и если `opts.cut && L > CUT.onPath && L <= CUT.maxDist` — запомнить последний отрезок: `a.lastLeg = { x, z }`; при приходе в конец маршрута (`onArrive` в `updatePlayer`, обе ветки: `stopT` и узел) если `a.lastLeg` и `this.clear(a.x, a.z, lx, lz)` → старт срезки с `then: { kind: 'free' }` вместо `onArrive`; иначе `onArrive` как обычно. `lastLeg` сбрасывается в `stop`, `teleport`, `setAuto`, при новом `moveTo`.
8. При старте любой срезки: `a.cutFrom = { x: a.x, z: a.z }` (если агент был на графе), `a.state = 'cut'`, `a.path = null; a.stopT = null; a.dest = null`, и с вероятностью `CUT.say` пузырь `pick(a.rng, LINES.cut)` без звука на 1,6 с — только когда `opts.cut` (игрок), не при возврате на ребро.

- [ ] **Step 2: Ход и приход в `updatePlayer`**

Ветка `a.state === 'cut'`: шаг `min(d, a.speed * (a.speedMul || 1) * dt)` к `(cut.x, cut.z)`, `face` по направлению, след в `a.trail` как в `walk`, `sprite.position`. При `d < 0.5`: `a.x = cut.x; a.z = cut.z`, затем по `then.kind`: `graph` → `from/to/t/len` из `then`, `free = false`, `state = 'idle'`, `place`, `onArrive(a, then.node)`; `free` → `free = true`, `state = 'idle'`; `plan` → встать на `P` (`from/to/t/len` из `P`), `free = false`, применить план (общая функция применения из Step 1), состояние `walk`; `auto` → встать на `P`, `free = false`, `setAuto(a, true)`.

- [ ] **Step 3: Остальные точки**

`place(a)`: при `a.free || a.state === 'cut'` только `sprite.position` без пересчёта `x, z`. `stop(a)`: при `cut` → `state = 'idle'`, `free = true`, `cut = null`, `lastLeg = null`. `teleport`: `free = false; cut = null; lastLeg = null`. `setAuto(a, true)`: если `a.free` — вместо немедленного включения запустить срезку к `P` с `then: { kind: 'auto' }` (сам `a.auto` остаётся `false` до прихода, чтобы агент шёл веткой `updatePlayer`); если `a.state === 'cut'` при любом `setAuto` — `stop` сначала. `ghostify`: если `a.free || a.state === 'cut'` → `snap(a)`. `snap(a)`: `P = nearestEdgePoint(a.x, a.z, CUT.snapR)`; есть → `from/to/t/len`, `place`; нет → `teleport(a, g.nearest(a.x, a.z, 1e9))`; в обоих случаях `free = false; cut = null`.

- [ ] **Step 4: `LINES.cut` в `bio.js`**

`cut: ['срежу', 'тут ближе', 'по газону, но тихонько', 'дорожка подождёт', 'я культурно, но быстро']`.

- [ ] **Step 5: Проверка в браузере** (пока без `{ cut: true }` из игры: временно вызвать `__app.sim.moveTo(p, x, z, { cut: true })` руками)

1. Во дворе точка на несвязанной дорожке в 20–40 м: `state` становится `cut`, скелет приходит, встаёт на ребро (`a.free === false`, `a.from !== a.to` или на узле), `onArrive` сработал (например, цель — узел бара даёт визит).
2. Точка через дом: `moveTo` с `cut` идёт по графу (`state === 'walk'`).
3. Клик по газону в 30 м: приходит в точку, `a.free === true`; следующий `moveTo` в дальнюю цель: сначала `cut` к ребру, потом `walk`, без рывка (координаты непрерывны между кадрами); `setAuto(p, true)` из газона: `cut` к ребру, потом гуляет сам.
4. Охотник догоняет на газоне: дуэль, проигрыш до смерти → респаун у заведения, `free` снят, клик по карте работает.
5. Хвост из друзей идёт за срезающим.
6. Консоль без ошибок.

- [ ] **Step 6: Коммит**

```bash
git add src/sim.js src/bio.js
git commit -m "Срезки: прямой ход к близкой цели, последний отрезок до газона, возврат на ребро"
```

---

### Task 6: Игра: срезка по явной цели, конфеты по клику, охотники, имена в журнале

**Files:**
- Modify: `src/game.js` (`Candies.update` 55; `clickGround` 160–166; `clickVenue` 177–183; `clickShop` 184–190; `choose` 199–209; `onArrive` 219–220 повтор к прохожему; `playRps` 281–283), `src/hunters.js` (`step` 118–124, `extra` 166), `src/main.js` (`logText` 239–256)

**Interfaces:**
- Consumes: `Sim.moveTo(a, x, z, { cut: true })` (Task 5).
- Produces: `Hunters.extra(level = Math.max(1, this.level))`.

- [ ] **Step 1: Явная цель срезает**

Все вызовы `this.sim.moveTo(this.player, …)` в `clickGround`, `clickVenue`, `clickShop`, `choose` и в повторе `onArrive` (строка 220) получают `{ cut: true }`. Вызовы из `hunters.js` и `respawn` остаются без опций.

- [ ] **Step 2: Конфеты**

В `clickGround` после снапа к аркане: ближайшая из `this.candies.items` в 12 м от клика → `x, z` конфеты. В `Candies.update`: радиус `Math.max(3, H * 0.45)`.

- [ ] **Step 3: Охотники**

`hunters.js` `step`: в ветке `d < PURSUIT.direct` условие `a.state === 'idle' || a.state === 'walk' || (a.state === 'approach' && …)`. `extra(level = Math.max(1, this.level))` → `spawn(Math.max(1, level), { half: true, extra: true })`. В `playRps`: `const lvl0 = this.hunters ? this.hunters.level : 0;` до `resetAtVenue`, затем `this.hunters.extra(lvl0)`.

- [ ] **Step 4: Имена в именительном падеже (`logText`)**

Точные строки (`nm` — имя, `v(m, f)` — окончание по полу игрока, `his` — по полу гостя, как в файле):
- `kill`: `гадость удалась: ${nm}, d20 ${e.roll ?? '?'}`
- `friend`: `сладость удалась: ${nm}` + прежний хвост «· машет из толпы»
- `fail`: `провал (${e.action === 'kill' ? 'гадость' : 'сладость'}): ${nm}, d20 ${e.roll ?? '?'}`
- `win`: `победа над охотником: ${nm}, ${e.boss ? 'босс-' : ''}${e.intent === 'kill' ? 'череп' : 'сердечко'}, ${vs}`
- `raid_bit`: `твой скелет упокоил навсегда гостя: ${nm}…` / `твой скелет укусил гостя: ${nm}…` (хвосты `place`, `rr` как были)
- `raid_lost`: `твой скелет потерял гостя: ${nm}…`
- `bit`, `lost`, `spawn`, `raid_beaten` не меняются: имя там подлежащее.

- [ ] **Step 5: Проверка в браузере**

1. Клик по конфете на дороге с 10–40 м подбирает её; клик по конфете в 5 м от стоящего скелета подбирает; конфета на соседней дорожке через газон берётся срезкой.
2. Клик по прохожему во дворе через газон: срезка, диалог, бросок. Клик по тыкве бара через двор: срезка в узел, визит и плашка.
3. Автопилот минуту во дворе: ни одного `cut` (`__app.game.player.state` в цикле не равен `'cut'`).
4. Охотник, идущий по графу, в 150 м сразу в `approach`.
5. Проигрыш в магазине при уровне 3 (`hunters.setHeat(60)`): лишний охотник `level === 3`, `bonus === 2`.
6. Журнал: записи с именами читаются без склонения.
7. Консоль без ошибок, `perf()` как до PR.

- [ ] **Step 6: Коммит**

```bash
git add src/game.js src/hunters.js src/main.js
git commit -m "Срезка по явной цели, конфеты по клику, охотник внутри 150 м, имена в журнале"
```

---

### Task 7: Версия модулей, README

**Files:**
- Create: `tools/version.py`
- Modify: `index.html` (карта импортов строки 11–16 и тег `<script type="module" src="src/main.js">`), `README.md` (строки 20–21 про кубик; раздел про движение: срезки; раздел «Выкладка»: шаг версии)

**Interfaces:**
- Produces: `python tools/version.py [rev]` — переписывает `index.html`: в `imports` для каждого `src/*.js` запись `"./src/<name>.js": "./src/<name>.js?v=<rev>"` (прежние такие записи заменяются, записи `three` остаются), `src="src/main.js?v=<rev>"`; `rev` по умолчанию `git rev-parse --short HEAD`. Идемпотентен.

- [ ] **Step 1: Скрипт**

Читать `index.html` как utf‑8, найти блок `<script type="importmap">…</script>`, разобрать JSON, пересобрать `imports` (сначала существующие ключи без `./src/`, потом модули по алфавиту), записать с отступами как сейчас (две строки на запись не обязательны, важна валидность). Обновить `src="src/main.js…"` регулярным выражением.

- [ ] **Step 2: Проверка**

Run: `python tools/version.py abc1234 && python tools/version.py abc1234 && git diff --stat` → только `index.html`; `node -e "const h=require('fs').readFileSync('index.html','utf8');JSON.parse(h.match(/<script type=\"importmap\">([\s\S]*?)<\/script>/)[1])"` без ошибки. Страница открывается, в сетевой панели модули с `?v=abc1234`, относительные импорты внутри модулей тоже (карта применяется к разрешённым URL).

- [ ] **Step 3: README**

Кубик: `2–7 — провал`, `8–19 — успех`. Движение: абзац «срезки» (60 м, в 2,5 раза дальше по дорожкам, свободно от зданий, воды и проспектов; клик по газону доводит до точки; толпа и охотники не срезают). Выкладка: «перед выкладкой `python tools/version.py`, чтобы браузеры игроков взяли новые модули». Мелочи: «во дворах», кладбища в центре.

- [ ] **Step 4: Коммит**

```bash
git add tools/version.py index.html README.md
git commit -m "Версия модулей в карте импортов, README про срезки и кубик"
```

---

## Проверка в браузере перед слиянием (локальная сессия)

1. `node --test tests/*.test.mjs` зелёный; страница грузится с базой и без, консоль чистая.
2. Пункты «Проверка в браузере» спеки 1–8 и Review Focus 4–5.
3. Регресс PR #7 и PR #8: прохожий посреди ребра, охотник с 120 м до дуэли и ухода, бар с плашкой, отпустить управление на полпути.
4. `perf()`: кадр не хуже, чем на main; клик по карте без заметной паузы (`console.time` вокруг `moveTo` < 5 мс).
