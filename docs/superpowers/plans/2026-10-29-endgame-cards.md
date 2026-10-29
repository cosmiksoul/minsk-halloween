# Эндгейм: колода, рука боссов, XP, квесты, жетоны, проезжая часть — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рейтинг становится колодой из 52 карт, каждый час игроку сдаётся рука из пяти боссов вокруг него, победы дают XP, собранная рука — покерный бонус, жетон и слот скелета; новичка ведёт цепочка из шести квестов; жетоны фармятся; проезжая часть быстрее, но заметнее; попутно арканы читаются из профиля и HUD.

**Architecture:** Числа и чистые функции (карта места, час по Минску, сдача, бонусы, квесты, слоты, жетоны, розыск на дороге) в `src/rules.js` без импортов; покерный ранг и названия карт в новом `src/poker.js`; граф получает флаг `major` на рёбрах, `ring` и штраф толпе в `route`/`path`. Сцена и состояние боссов в новом `src/cards.js` (класс `Cards`), квесты в новом `src/quests.js` (класс `Quests`); оба подключаются из `main.js` и получают ссылки на `sim`, `game`, `hunters`, `remote`, `local`. `game.duel` получает ветку `h.card`, остальная игра меняется точечными хуками.

**Tech Stack:** ES‑модули без сборки, three.js из importmap, тесты `node --test tests/*.test.mjs` (Node 22), Supabase через PostgREST (`src/store.js`), `tools/version.py` для версии модулей.

**Spec:** `docs/superpowers/specs/2026-10-29-endgame-cards-design.md`

## Global Constraints

- База: `main` после PR #9 (6d1f3c3): срезки, проходимые проезжие части, `src/graph.js`, `?v=` в importmap.
- `src/rules.js` и `src/poker.js` без импортов three и без DOM: они гоняются в node.
- Все тексты интерфейса, комментарии и сообщения коммитов по‑русски; тексты журнала в именительном падеже, как уже сделано в `logText`.
- Числа только из спеки: `CARD`, `HAND_MULT`, `TOKEN = { perHand: 1, price: 12, cap: 3 }`, `ROAD = { speed: 1.2, heatPer: 4, crowdCost: 4 }`, `HEAT.boss = 10`, `HEAT.road = 1`, бонус босса `2–5: 0, 6–9: 1, 10–K: 2, A: 3`, `bossXp = 2 × старшинство`, `HAND_XP = 20 × множитель`, откат 60 с, слотов не больше 5.
- Новых колонок в Supabase нет: XP — это `score`; `remote.top(52)` только расширяет `select`.
- Час по Минску `floor((Date.now() / 1000 + 3 × 3600) / 3600)`, без летнего времени.
- Команды для проверки: `node --test tests/*.test.mjs` (сейчас 27 тестов проходят), в конце `python tools/version.py`.
- Коммиты с трейлерами `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` и `Claude-Session: …`, как в истории репозитория.

## Review Focus

1. **Рейтинг не ответил или ответил позже трёх секунд.** Рука сдаётся из упырей и на этот час не пересдаётся, когда ответ всё же пришёл; следующий час берёт свежую колоду. Тест на детерминизм сдачи в задаче 1, ожидание ≤ 3 с в задаче 7, браузерный пункт 1.
2. **Узлов в кольце меньше пяти даже на 1600 м** (край карты, остров графа). `Graph.pickSpaced` дополняет выбор ближайшими по прямой проходимыми узлами, рука всегда из пяти. Тест в задаче 3.
3. **Смена часа посреди боя.** `Cards.update` не трогает руку, пока `game.busy` или есть `game.pendingBoss`; бой доигрывается в старую руку, бонус за пятую карту начисляется, потом боссы уходят. Браузерный пункт 5.
4. **Сохранённая рука ссылается на узел, которого нет** (переразметка графа) или на заведение. При восстановлении узел проверяется (`node < graph.x.length && graph.ok[node]`), иначе берётся `graph.nearest(x, z, 300)` из сохранённых координат; совсем без узла карта переставляется в кольцо. Браузерный пункт 6.
5. **Своя строка и упокоенные в топ‑52.** Строки с `device === deviceId()` и `dead` занимают место в колоде упырём: собственный скелет в руке не появляется, мёртвый с нулём XP тоже. Тест `cardsFromDeck` в задаче 7.

---

### Задача 1: числа и чистые функции в `rules.js`

**Files:**
- Modify: `src/rules.js`
- Test: `tests/rules.test.mjs`

**Interfaces:**
- Produces: `CARD`, `HAND_MULT`, `TOKEN`, `ROAD`, `QUESTS`, `HEAT.boss`, `HEAT.road`; `cardOfSlot(r)`, `minskHour(ms)`, `hourLeft(ms)`, `handSeed(hour, device, seed)`, `rngOf(seed)`, `dealHand(hour, device, seed)`, `bossBonus(rank)`, `bossXp(rank)`, `questBonus(xp)`, `nextQuest(done)`, `questFor(done, kind)`, `slotsOf(stored, alive)`, `canBuyToken(g)`, `buyToken(g)`, `roadHeat(acc, dt)`; `migrate`/`newProgress` с `hand: null, hands: 0, bestHand: null`; `statsOf` с `hands`, `bestHand`.

- [ ] **Шаг 1: падающие тесты**

```js
test('CARD, TOKEN, ROAD, HEAT из спеки', () => {
  assert.deepEqual(CARD, { slots: 52, hand: 5, ringMin: 200, ringMax: 700, ringStep: 300, ringCap: 1600, spacing: 150, cooldown: 60, xpPerRank: 2, handBase: 20, bonus: { low: 0, mid: 1, high: 2, ace: 3 } });
  assert.deepEqual(HAND_MULT, { high: 1, pair: 2, twoPair: 3, three: 4, straight: 6, flush: 8, fullHouse: 10, four: 15, straightFlush: 30 });
  assert.deepEqual(TOKEN, { perHand: 1, price: 12, cap: 3 }); assert.deepEqual(ROAD, { speed: 1.2, heatPer: 4, crowdCost: 4 });
  assert.equal(HEAT.boss, 10); assert.equal(HEAT.road, 1); assert.equal(QUESTS.length, 6); assert.deepEqual(QUESTS.map(q => q.id), ['trick', 'treat', 'candy', 'coin', 'ghost', 'card']);
});
test('cardOfSlot: масти по четвертям, старшинство сверху вниз', () => {
  assert.deepEqual(cardOfSlot(1), { rank: 14, suit: '♠' }); assert.deepEqual(cardOfSlot(13), { rank: 2, suit: '♠' });
  assert.deepEqual(cardOfSlot(14), { rank: 14, suit: '♥' }); assert.deepEqual(cardOfSlot(27), { rank: 14, suit: '♦' }); assert.deepEqual(cardOfSlot(52), { rank: 2, suit: '♣' });
});
test('minskHour и hourLeft', () => {
  const t = Date.UTC(2026, 9, 31, 20, 30); assert.equal(minskHour(t), Math.floor((t / 1000 + 3 * 3600) / 3600));
  assert.equal(minskHour(Date.UTC(2026, 9, 31, 21, 0)), minskHour(t) + 1); assert.equal(minskHour(Date.UTC(2026, 9, 31, 20, 59, 59)), minskHour(t));
  assert.equal(hourLeft(t), 1800); assert.equal(hourLeft(Date.UTC(2026, 9, 31, 20, 59, 59)), 1);
});
test('dealHand: пять разных мест, детерминирована, зависит от часа, устройства и скелета', () => {
  const a = dealHand(497000, 'dev-1', 42); assert.equal(a.length, 5); assert.equal(new Set(a).size, 5); for (const s of a) assert.ok(s >= 1 && s <= 52);
  assert.deepEqual(dealHand(497000, 'dev-1', 42), a);
  assert.notDeepEqual(dealHand(497001, 'dev-1', 42), a); assert.notDeepEqual(dealHand(497000, 'dev-2', 42), a); assert.notDeepEqual(dealHand(497000, 'dev-1', 43), a);
});
test('bossBonus и bossXp', () => { assert.equal(bossBonus(2), 0); assert.equal(bossBonus(5), 0); assert.equal(bossBonus(6), 1); assert.equal(bossBonus(9), 1); assert.equal(bossBonus(10), 2); assert.equal(bossBonus(13), 2); assert.equal(bossBonus(14), 3); assert.equal(bossXp(2), 4); assert.equal(bossXp(10), 20); assert.equal(bossXp(14), 28); });
test('questBonus, nextQuest, questFor', () => {
  assert.equal(questBonus(2), 2); assert.equal(questBonus(0), 5); assert.equal(questBonus(28), 28);
  assert.equal(nextQuest([]).id, 'trick'); assert.equal(nextQuest(['trick']).id, 'treat'); assert.equal(nextQuest(QUESTS.map(q => q.id)), null);
  assert.equal(questFor(['trick'], 'friend').id, 'treat'); assert.equal(questFor(['trick'], 'kill'), null); assert.equal(questFor([], 'card'), null);
});
test('slotsOf: не меньше одного и живых, не больше пяти', () => { assert.equal(slotsOf(0, 0), 1); assert.equal(slotsOf(undefined, 3), 3); assert.equal(slotsOf(2, 1), 2); assert.equal(slotsOf(9, 1), 5); });
test('canBuyToken и buyToken: цена 12, потолок 3', () => {
  assert.equal(canBuyToken({ coins: 12, tokens: 2 }), true); assert.equal(canBuyToken({ coins: 11, tokens: 0 }), false); assert.equal(canBuyToken({ coins: 50, tokens: 3 }), false);
  const g = { coins: 12, tokens: 2 }; assert.equal(buyToken(g), true); assert.deepEqual(g, { coins: 0, tokens: 3 }); assert.equal(buyToken(g), false);
});
test('roadHeat: очко за каждые 4 с, остаток переносится', () => { assert.deepEqual(roadHeat(3.5, 1), { acc: 0.5, points: 1 }); assert.deepEqual(roadHeat(0, 9), { acc: 1, points: 2 }); assert.deepEqual(roadHeat(1, 1), { acc: 2, points: 0 }); });
test('migrate и statsOf: рука и собранные руки', () => {
  const g = migrate({ v: 2, score: 1, tail: [], log: [], visits: [], tarot: [] }); assert.equal(g.hand, null); assert.equal(g.hands, 0); assert.equal(g.bestHand, null);
  const n = newProgress(); assert.equal(n.hand, null); assert.equal(n.hands, 0);
  assert.equal(statsOf({ v: 2, hands: 2, bestHand: { key: 'pair', mult: 2 }, log: [] }).hands, 2); assert.equal(statsOf(null).hands, 0);
});
```

- [ ] **Шаг 2: убедиться, что тесты падают**

Run: `node --test tests/rules.test.mjs`
Expected: FAIL, `CARD`/`cardOfSlot`… не экспортированы.

- [ ] **Шаг 3: реализовать в `src/rules.js`**

Константы литералами из спеки. `HEAT` дополняется полями `boss: 10, road: 1`. `QUESTS` — шесть записей `{ id, title, hint, kind }`: `trick` «первая гадость» / «кликни по прохожему и выбери гадость» / `kill`; `treat` «первая сладость» / «кликни по прохожему и выбери сладость» / `friend`; `candy` «конфета» / «конфеты лежат на дорожках, подойди» / `candy`; `coin` «монетка» / «монетки блестят у дорог» / `coin`; `ghost` «призрак» / «за шалости приходят призраки с кладбищ» / `win`; `card` «карта» / «на карте стоят пять карт часа, бей слабую» / `card`.

Сигнатуры: `cardOfSlot(r) → { rank, suit }` (`rank = 14 − ((r − 1) mod 13)`, масть `['♠', '♥', '♦', '♣'][floor((r − 1) / 13)]`); `minskHour(ms)`; `hourLeft(ms)` → `3600 − ((floor(ms / 1000) + 3 × 3600) mod 3600)`; `handSeed(hour, device, seed)` → `hostSeed('hand', hour + '|' + device + '|' + seed)`; `rngOf(seed)` — mulberry32 без импортов; `dealHand(hour, device, seed)` → пять разных чисел 1…52 из `rngOf(handSeed(…))`, в порядке вытягивания; `bossBonus(rank)` по `CARD.bonus`; `bossXp(rank) = CARD.xpPerRank × rank`; `questBonus(xp) = max(5, num(xp))`; `nextQuest(done)` — первая запись `QUESTS`, чьего `id` нет в `done`, иначе `null`; `questFor(done, kind)` — `nextQuest(done)`, если его `kind` совпал, иначе `null`; `slotsOf(stored, alive) = min(5, max(1, num(stored), num(alive)))`; `canBuyToken(g)`, `buyToken(g)` (возвращает `true`, когда купил); `roadHeat(acc, dt) → { acc, points }`. `newProgress` и обе ветки `migrate` добавляют `hand: null, hands: 0, bestHand: null` (в v2‑ветке только если полей нет). `statsOf` возвращает ещё `hands: num(g.hands)` и `bestHand: g.bestHand || null`.

- [ ] **Шаг 4: тесты проходят**

Run: `node --test tests/*.test.mjs`
Expected: PASS, все тесты, включая прежние 27.

- [ ] **Шаг 5: коммит**

```bash
git add src/rules.js tests/rules.test.mjs
git commit -m "Правила эндгейма: карта места, час по Минску, сдача, бонусы босса, квесты, слоты, жетоны, розыск на дороге"
```

---

### Задача 2: покер и названия карт в `src/poker.js`

**Files:**
- Create: `src/poker.js`
- Test: `tests/poker.test.mjs`

**Interfaces:**
- Consumes: `HAND_MULT` из `rules.js`.
- Produces: `RANK_LABEL`, `cardLabel(rank, suit)` → `'A♠'`, `'10♥'`, `'J♦'`; `isRed(suit)`; `cardName(rank, suit)` → «туз пик», «семёрка бубен», «дама червей», «десятка треф»; `beaten(rank)` → «бит» для валета, короля и туза, «бита» для остальных; `handRank(cards)` → `{ key, name, mult }` по `HAND_MULT`, где `cards` — массив `{ rank, suit }` из пяти.

- [ ] **Шаг 1: падающие тесты**

```js
import { cardLabel, cardName, beaten, isRed, handRank } from '../src/poker.js';
const c = (rank, suit) => ({ rank, suit });
test('cardLabel, cardName, beaten, isRed', () => {
  assert.equal(cardLabel(14, '♠'), 'A♠'); assert.equal(cardLabel(10, '♥'), '10♥'); assert.equal(cardLabel(11, '♦'), 'J♦'); assert.equal(cardLabel(13, '♣'), 'K♣');
  assert.equal(cardName(14, '♠'), 'туз пик'); assert.equal(cardName(7, '♦'), 'семёрка бубен'); assert.equal(cardName(12, '♥'), 'дама червей'); assert.equal(cardName(10, '♣'), 'десятка треф');
  assert.equal(beaten(14), 'бит'); assert.equal(beaten(12), 'бита'); assert.equal(beaten(7), 'бита'); assert.equal(isRed('♥'), true); assert.equal(isRed('♠'), false);
});
test('handRank: все ранги', () => {
  assert.deepEqual(handRank([c(2, '♠'), c(5, '♥'), c(9, '♦'), c(11, '♣'), c(13, '♠')]), { key: 'high', name: 'старшая карта', mult: 1 });
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(2, '♦'), c(5, '♣'), c(13, '♠')]).key, 'pair');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(2, '♦'), c(2, '♣'), c(13, '♠')]).key, 'twoPair');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(2, '♣'), c(13, '♠')]).key, 'three');
  assert.equal(handRank([c(5, '♠'), c(6, '♥'), c(7, '♦'), c(8, '♣'), c(9, '♠')]).key, 'straight');
  assert.equal(handRank([c(14, '♠'), c(2, '♥'), c(3, '♦'), c(4, '♣'), c(5, '♠')]).key, 'straight');
  assert.equal(handRank([c(10, '♠'), c(11, '♥'), c(12, '♦'), c(13, '♣'), c(14, '♠')]).key, 'straight');
  assert.equal(handRank([c(2, '♠'), c(5, '♠'), c(9, '♠'), c(11, '♠'), c(13, '♠')]).key, 'flush');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(2, '♣'), c(2, '♠')]).key, 'fullHouse');
  assert.equal(handRank([c(8, '♠'), c(8, '♥'), c(8, '♦'), c(8, '♣'), c(2, '♠')]).key, 'four');
  assert.deepEqual(handRank([c(5, '♥'), c(6, '♥'), c(7, '♥'), c(8, '♥'), c(9, '♥')]), { key: 'straightFlush', name: 'стрит-флеш', mult: 30 });
  assert.equal(handRank([c(14, '♥'), c(2, '♥'), c(3, '♥'), c(4, '♥'), c(5, '♥')]).mult, 30);
});
```

- [ ] **Шаг 2: убедиться, что падают** — Run: `node --test tests/poker.test.mjs`. Expected: FAIL, модуля нет.

- [ ] **Шаг 3: реализовать `src/poker.js`**

Имена рангов для `handRank`: `high` «старшая карта», `pair` «пара», `twoPair` «две пары», `three` «тройка», `straight` «стрит», `flush` «флеш», `fullHouse` «фулл-хаус», `four` «каре», `straightFlush` «стрит-флеш». Стрит считается по отсортированным рангам без повторов, туз дополнительно как 1. Названия для `cardName`: ранги «двойка … десятка, валет, дама, король, туз», масти в родительном «пик, червей, бубен, треф».

- [ ] **Шаг 4: тесты проходят** — Run: `node --test tests/*.test.mjs`. Expected: PASS.

- [ ] **Шаг 5: коммит**

```bash
git add src/poker.js tests/poker.test.mjs
git commit -m "Покер: ранг руки, названия и подписи карт"
```

---

### Задача 3: граф знает проезжую часть, кольцо и разброс

**Files:**
- Modify: `src/graph.js`
- Test: `tests/graph.test.mjs`

**Interfaces:**
- Consumes: `ROAD` из `rules.js`.
- Produces: рёбра `{ to, len, major }`; `isMajor(from, to)`; `allMajor(node)`; `route(from, to, { maxExpand = 450000, crowd = false } = {})` — при `crowd` цена ребра `major` умножается на `ROAD.crowdCost`; `path(from, to, maxHops = 110, { crowd = false } = {})` — при `crowd` первый проход без рёбер `major`, при неудаче обычный; `ring(node, minCost, maxCost)` → массив узлов с ценой пути в `[minCost, maxCost]`, без старта; `pickSpaced(nodes, n, spacing, rng, fallbackX, fallbackZ)` → `n` узлов попарно не ближе `spacing` м, при нехватке дополняется ближайшими к `(fallbackX, fallbackZ)` проходимыми узлами вне списка.

- [ ] **Шаг 1: падающие тесты**

```js
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
```

- [ ] **Шаг 2: убедиться, что падают** — Run: `node --test tests/graph.test.mjs`. Expected: FAIL.

- [ ] **Шаг 3: реализовать в `src/graph.js`**

В конструкторе ребро получает `major: r.k === 'major'`. `route` меняет сигнатуру на объект опций: проверить вызовы `grep -n "\.route(" src/` и привести их (сейчас `planRoute` зовёт `this.route(start, node)` без третьего аргумента). `ring` — Дейкстра с кучей `Heap`, остановка при `dist > maxCost`, использует те же массивы `dist/stamp/closed`, что `route` (своё поколение `gen`). `pickSpaced`: перемешать кандидатов `rng`, брать по одному, отбрасывая ближе `spacing` к уже взятым; если набрано меньше `n`, добирать из `this.walkable` по возрастанию расстояния до `(fallbackX, fallbackZ)` с тем же условием разброса, в самом конце без условия.

- [ ] **Шаг 4: тесты проходят** — Run: `node --test tests/*.test.mjs`. Expected: PASS.

- [ ] **Шаг 5: коммит**

```bash
git add src/graph.js tests/graph.test.mjs
git commit -m "Граф: флаг проезжей части на рёбрах, штраф толпе, кольцо и разброс узлов"
```

---

### Задача 4: толпа держится тротуаров, игрок на дороге быстрее и заметнее

**Files:**
- Modify: `src/sim.js` (`arrive`, `goDrink`, новый `onRoad(a)`)
- Modify: `src/game.js` (`update`, `threatHtml`, конструктор: `roadAcc`, `roadSaid`, `onRoadLast`)
- Modify: `style.css` (`.road`)

**Interfaces:**
- Consumes: `isMajor`, `path(…, { crowd: true })` из задачи 3; `ROAD`, `roadHeat`, `HEAT.road` из задачи 1; `hunters.gain(kind)` (прибавляет `HEAT[kind]`, обновляет `heatAt`, только под управлением).
- Produces: `Sim.onRoad(a)` → `a.state === 'walk' && !a.free && a.from !== a.to && graph.isMajor(a.from, a.to)`.

- [ ] **Шаг 1: `sim.js`**

В `arrive` при выборе следующего ребра без пути: из `opts` сначала берутся рёбра без `major`, и только если таких нет — все (ветка «тянет домой» тоже выбирает из отфильтрованного списка). В `goDrink`: `g.path(a.to, v.node, 110, { crowd: true })`. Добавить `onRoad(a)`.

- [ ] **Шаг 2: `game.js`**

В `update(dt, t)` рядом с множителем «штормит»: `const road = this.selected && this.sim.onRoad(p)`; `this.speedMul = (tipsy ? RPS.tipsy.speed : 1) * (road ? ROAD.speed : 1)`; если `road`: `const r = roadHeat(this.roadAcc, dt); this.roadAcc = r.acc;` и `r.points` раз `this.hunters?.gain('road')`; первый раз за сессию (`!this.roadSaid`) пузырь «по проезжей части быстрее, но заметнее» на 2.6 с; если не `road` — `this.roadAcc = 0`. При смене `road !== this.onRoadLast` — запомнить и `renderHUD()`. В `threatHtml` после надгробий при `this.onRoadLast` добавить `<span class="road" title="проезжая часть: скорость ×1.2, розыск +1 за 4 с">🚗</span>`.

- [ ] **Шаг 3: проверка в браузере** (серверу нужен `python -m http.server`): скелет под управлением, клик на проспект — идёт по нему, в консоли `__app.game.speedMul` равен 1.2, `__app.game.g.heat` растёт на 1 каждые 4 с ходьбы и стоит на месте, когда скелет остановился; у 🪦 появляется 🚗; прохожие (`__app.sim.agents.filter(a => !a.custom && __app.sim.onRoad(a)).length`) на проспекте единицы, не десятки. Тесты: `node --test tests/*.test.mjs` PASS.

- [ ] **Шаг 4: коммит**

```bash
git add src/sim.js src/game.js style.css
git commit -m "Проезжая часть: толпа держится тротуаров, игрок на дороге быстрее, розыск растёт"
```

---

### Задача 5: XP вместо ★, ноль при пермасмерти, жетоны в магазине, слоты за руки

**Files:**
- Modify: `src/game.js` (`renderHUD`, `cardHtml`, `profileHtml`, пузыри `★ +…`, `perish`, `renderShop`, `buy`, `SCORE`‑подсказки)
- Modify: `src/main.js` (`guestStats`, `boardRow`, `SCORE_HINT`, `shareText`, слоты вместо `MAX_OWN`, `renderMine`, `openMine`, `mineForm.onsubmit`, `__app.slots`)
- Modify: `src/share.js` (подпись счёта → «XP»), `index.html` (кнопка «★ Лидеры» → «🏆 Лидеры», текст `#mnLimit`), `README.md` (★ → XP в тексте)

**Interfaces:**
- Consumes: `TOKEN`, `canBuyToken`, `buyToken`, `slotsOf` из задачи 1.
- Produces: `main.js`: `slots()` и `addSlot()` (возвращает `true`, когда слот добавлен); `game.o.slots` — та же функция, передаётся в `new Game`; `__app.slots`, `__app.addSlot`.

- [ ] **Шаг 1: переименование**

`grep -n "★" src/*.js index.html README.md` — каждое вхождение в интерфейсе заменить на `XP` (`XP ${g.score}`, пузыри `XP +2`, `XP −1`, подсказка `title="XP: победа +2, поражение −1, аркана +5, новое заведение +1, босс 2 × старшинство"`); кнопку вкладки — «🏆 Лидеры». В `share.js` подпись счёта «XP». В README раздел «Лидеры» начинать словами «**XP и лидеры.** XP — накопитель…». После замены `grep -c "★" src/*.js index.html` даёт нули.

- [ ] **Шаг 2: пермасмерть**

В `perish()` перед `this.save()` поставить `g.score = 0`. Проверка: `__app.game.perish()` у тестового скелета → в `mine()` у него `game.score === 0`, строка в базе (`remote.top`) с `dead: true, score: 0`.

- [ ] **Шаг 3: жетоны в магазине и на HUD**

`renderShop`: после кнопок одежды кнопка `<button data-kind="token" ${canBuyToken(g) ? '' : 'disabled'}>🎟 спас-бросок · ${TOKEN.price} 🪙${g.tokens >= TOKEN.cap ? ` · ${g.tokens}/${TOKEN.cap}` : ''}</button>`. `buy(kind)` в начале: если `kind === 'token'` — `buyToken(g)`; при отказе `shMsg` «жетонов уже три» или «не хватает монет»; при покупке `shMsg` «спас-бросок в кармане (−12 🪙)», пузырь «🎟 +1», `this.log('buy', { kind: 'token', item: 'спас-бросок' })`, `save`, `renderHUD`, `renderShop`, `showCard`; дальше не идти. На HUD в ряду счётчиков `🎟 ${g.tokens}` показывать всегда (сейчас только при `> 0`), `title="спас-броски: переброс d20 после провала или проигранной дуэли"`.

- [ ] **Шаг 4: слоты на устройстве**

В `main.js` вместо `const MAX_OWN = 5`: `const slots = () => slotsOf(local.get('slots', 0), mine.filter(d => !d.guest && !d.dead).length);` и сразу `local.set('slots', slots())` (миграция старых устройств). `const addSlot = () => { const s = slots(); if (s >= 5) return false; local.set('slots', s + 1); renderMine(); game.renderHUD(); return true; }`. Все места с `MAX_OWN` переходят на `slots()`; заголовок списка «ваши скелеты · `${alive}/${slots()}`» плюс при `slots() < 5` « · следующий слот за собранную руку»; `#mnLimit` текст «слоты заняты: новый слот даёт собранная рука из пяти карт часа». В `new Game(...)` передать `slots`, в `renderHUD` вместо `own.length < 5` — `own.length < (this.o.slots ? this.o.slots() : 5)`. В `__app` добавить `slots, addSlot`.

- [ ] **Шаг 5: проверка** — `node --test tests/*.test.mjs` PASS; в браузере: новая вкладка в приватном окне (чистый localStorage) — «мои скелеты» показывает «0/1», второй скелет создать нельзя; `__app.addSlot()` → «/2»; в магазине после партии кнопка жетона, при 11 монетах неактивна (`__app.game.g.coins = 11; __app.game.renderShop()`), при трёх жетонах неактивна с «3/3».

- [ ] **Шаг 6: коммит**

```bash
git add src/game.js src/main.js src/share.js index.html README.md
git commit -m "XP вместо звёздочки, ноль при пермасмерти, жетон в магазине с потолком, слоты скелетов на устройстве"
```

---

### Задача 6: попутно — арканы из HUD, профиля и журнала; реплика толпы

**Files:**
- Modify: `src/game.js` (`openDeck(g = this.g)`, `showTarot(a, isNew, g = this.g)`, `renderHUD`, `profileHtml`, `collect`: `at` в ISO)
- Modify: `src/main.js` (клик по HUD, `renderProfile`: `pfDeck` у любого своего, клик по фишкам, клик по записи `tarot` в журнале)
- Modify: `src/bio.js` (`LINES.chat`), `style.css` (`.arc`, `#hud .deck`)

- [ ] **Шаг 1: `bio.js`** — заменить «Как там Куропаты?» на «Как там на кладбище?». Проверка: `grep -c Куропат src/bio.js` → 0.

- [ ] **Шаг 2: колода и карта от любого прогресса**

`openDeck(g = this.g)`: `have` из переданного `g`, запомнить `this.deckG = g`; клик по `.slot.on` и кнопка `tDeck` используют `this.deckG`. `showTarot(a, isNew, g = this.g)`: запись `rec` ищется в `g.tarot`; кикер «найдена `${fmtAt(rec.at)}`». В `collect` писать `at: new Date().toISOString()` вместо `clock()` (старые записи с «ЧЧ:ММ» `fmtAt` показывает как есть).

- [ ] **Шаг 3: входы**

`renderHUD`: счётчик арканов становится `<button class="deck tc" title="арканы: открыть колоду">🃏 ${n}/${ARCANA.length}</button>`; в `$('hud').onclick` первой проверкой `if (e.target.closest('.deck')) { game.openDeck(); return; }`. `profileHtml`: строка «арканы:» показывает все собранные фишками `<span class="arc" data-arc="${id}">${roman} ${name}</span>`; в `main.js` обработчик клика на `#pfGame`: по `.arc` → `game.showTarot(ARCANA_BY_ID[id], false, migrate(profileAgent.def.game))`. `renderProfile`: `$('pfDeck').hidden = !ownAgent`; `pfDeck.onclick` → `game.openDeck(migrate(profileAgent.def.game))`. Журнал: записи `kind === 'tarot'` с `e.id` получают класс `clickable`, клик открывает `showTarot(ARCANA_BY_ID[e.id], false, g)`, не закрывая профиль.

- [ ] **Шаг 4: проверка в браузере** — скелет гуляет сам (без управления): клик по 🃏 на HUD открывает колоду; профиль другого своего или упокоенного скелета показывает «колода» и фишки, клик по фишке открывает карту с текстами; в журнале клик по «аркана …» открывает карту. Тесты PASS.

- [ ] **Шаг 5: коммит**

```bash
git add src/bio.js src/game.js src/main.js style.css
git commit -m "Арканы открываются из HUD, профиля и журнала у любого своего скелета; нейтральная реплика толпы"
```

---

### Задача 7: `src/cards.js` — колода, сдача, боссы в городе, рука в прогрессе, смена часа

**Files:**
- Create: `src/cards.js`
- Modify: `src/store.js` (`top(limit = 52)`, `select` плюс `gender,age,seed,costume`), `src/hunters.js` (кандидаты без `def.boss`), `src/main.js` (создание `Cards`, `game.cards`, вызов `cards.update(sdt)` в `frame`, `__app.cards`), `src/game.js` (`setPlayer`/`clearPlayer`/`perish` → `this.cards?.onPlayerChange()`), `tests/rules.test.mjs` (тест `cardsFromDeck`), `src/rules.js` (`cardsFromDeck`)

**Interfaces:**
- Consumes: `dealHand`, `cardOfSlot`, `minskHour`, `handSeed`, `rngOf`, `CARD` (задача 1); `cardLabel`, `isRed` (задача 2); `Graph.ring`, `pickSpaced`, `allMajor` (задача 3); `sim.spawnCustom(def, x, z)`, `sim.drive(a, true)`, `sim.teleport(a, node)`, `sim.remove(a)`, `sim.say`; `makeBio`, `pickArchetype`, `makeRng` из `bio.js`; `deviceId()` и `local` из `store.js`.
- Produces: чистая `cardsFromDeck(slots, rows, hour, device)` в `rules.js` → массив карт `{ slot, rank, suit, owner: id | null, name?, gender?, age?, job?, arch?, seed?, costume?, ghoul: bool }` (упырю имя даёт `cards.js`, так как `makeBio` живёт в `bio.js`); класс `Cards` с `constructor({ sim, game, scene, remote, hunters, addSlot, flyTo, showCard })` (последние три из `main.js`, задача 5 и существующие `flyTo`/`showCard`), `get hand()` (= `game.g?.hand`), `start()`, `update(dt)`, `deal(hour)`, `spawnBosses()`, `clearBosses(say)`, `cardOf(agent)` → карта или `null`, `agentOf(card)`, `onPlayerChange()`, `deck` (строки `top(52)` или `[]`), `myCard()` → `{ slot, rank, suit }` или `null`, `labelForRank(i)` (1‑based место на доске; `null`, если `i > 52`).
- Формат карты в `g.hand.cards[i]`: `{ slot, rank, suit, name, gender, age, job, arch, seed, costume, owner, ghoul, node, x, z, state: 'up' | 'cool' | 'down', coolUntil }`; `g.hand = { hour, cards, dealtAt }`.

- [ ] **Шаг 1: падающий тест `cardsFromDeck`** в `tests/rules.test.mjs`

```js
test('cardsFromDeck: владелец по месту, свои, мёртвые и пустые места — упыри', () => {
  const rows = [{ id: 'a:1', device: 'a', name: 'Туз', seed: 1 }, { id: 'me:2', device: 'me', name: 'Я', seed: 2 }, { id: 'd:3', device: 'd', name: 'Мёртвый', seed: 3, dead: true }];
  const cards = cardsFromDeck([1, 2, 3, 30, 52], rows, 497000, 'me');
  assert.equal(cards.length, 5); assert.deepEqual(cards.map(c => c.slot), [1, 2, 3, 30, 52]);
  assert.equal(cards[0].owner, 'a:1'); assert.equal(cards[0].ghoul, false); assert.equal(cards[0].rank, 14);
  assert.equal(cards[1].ghoul, true); assert.equal(cards[2].ghoul, true); assert.equal(cards[3].ghoul, true); assert.equal(cards[3].suit, '♦');
  assert.equal(cards[1].seed, cardsFromDeck([2], rows, 497000, 'me')[0].seed); assert.notEqual(cards[1].seed, cardsFromDeck([2], rows, 497001, 'me')[0].seed);
});
```

Run: `node --test tests/rules.test.mjs` — FAIL.

- [ ] **Шаг 2: `cardsFromDeck` в `rules.js`**

Для каждого места: `rows[slot − 1]` с `device !== device` и без `dead` даёт владельца (копируются `owner: row.id, name, gender, age, job, arch, seed, costume`), иначе упырь: `ghoul: true, seed: hostSeed('ghoul', hour + '|' + slot), job: 'упырь с карточного стола'`, имя дорисует `cards.js`. Тест PASS.

- [ ] **Шаг 3: `store.js` и `hunters.js`**

`top(limit = 52)`, в `select` добавить `gender,age,seed,costume`. В `Hunters.spawn` фильтр кандидатов получает `&& !x.def.boss`.

- [ ] **Шаг 4: класс `Cards`**

`start()`: если нет `game.g` — выход. Текущий `hour = minskHour(Date.now())`. Если `g.hand && g.hand.hour === hour` — проверить узлы (Review Focus 4) и `spawnBosses()`; иначе `deal(hour)`. Перед первой сдачей с `remote` ждать `remote.top(52)` не дольше 3 с (`Promise.race` с таймером), результат в `this.deck`; без `remote` — `[]`.

`deal(hour)`: `slots = dealHand(hour, deviceId(), player.def.seed)`; `cards = cardsFromDeck(slots, this.deck, hour, deviceId())`; упырям `name/gender/age/arch` из `makeBio(makeRng(seed), pickArchetype(makeRng(seed)))`. Расстановка: `start = sim.nodeOf(player)`; `rng = rngOf(handSeed(hour, deviceId(), seed) ^ 0x9e3779b9)`; кандидаты `graph.ring(start, CARD.ringMin, max)` с `max` от `CARD.ringMax` шагами `ringStep` до `ringCap`, пока отфильтрованных (не `sim.venueNode`, не `game.shops.byNode`, не `graph.allMajor`) меньше пяти; среди них сначала именованные (`graph.names[n]`), если их хватает; `graph.pickSpaced(cands, 5, CARD.spacing, rng, player.x, player.z)`. Карта получает `node, x, z`, `state: 'up'`. Записать `g.hand`, `game.save()`, `spawnBosses()`, `game.renderHUD()`.

`spawnBosses()`: для каждой карты `def = { name, gender, age, job, arch, seed, costume, guest: true, boss: true, slot }`; `a = sim.spawnCustom(def, x, z); sim.drive(a, true); sim.teleport(a, node); a.state = 'idle'; a.path = null;` плюс спрайт карты над головой: `THREE.Sprite` с канвасом 32×44 (номинал и масть, красные масти `#ff3a5c`, рубашка для `down`), `sprite.center.set(0.5, 0)`, позиция `(x, H × 1.05, z)`, масштаб от `sim.H`; хранить `this.bosses = [{ card, a, sprite }]`.

`clearBosses(say)`: `say` → `sim.say(a, 'карта бита', '', 2)`, через 2 с `sim.remove(a)` и `scene.remove(sprite)`; без `say` — сразу. `onPlayerChange()`: `clearBosses(false)`, затем `start()`.

`update(dt)`: накапливать секунду; раз в секунду: смена часа (`minskHour(Date.now()) !== hand.hour` и `!game.busy && !game.pendingBoss` → `clearBosses(true); deal(hour)`); откаты (`state === 'cool' && Date.now() >= coolUntil` → `'up'`, перерисовать спрайт, `game.renderHUD()`); позиции и масштаб спрайтов от `sim.H`; таймер и секунды отката на HUD через `querySelector` без полного рендера (разметка в задаче 8).

- [ ] **Шаг 5: подключение**

`main.js`: после `hunters` — `const cards = new Cards({ sim, game, scene, remote, hunters, addSlot, flyTo, showCard }); game.cards = cards;` затем `cards.start()` после выбора стартового скелета; в `frame()` после `hunters.update(sdt)` — `cards.update(sdt)`; `__app.cards = cards`. `game.js`: в конце `setPlayer` и `clearPlayer`, и в `perish` после `this.player = null` — `this.cards?.onPlayerChange()`.

- [ ] **Шаг 6: проверка в браузере** — без `config.js` (пустая конфигурация) и с базой: после входа `__app.cards.hand.cards.length === 5`, пять агентов с `def.boss`, карты над головами, расстояния по графу в 200–700 м (`__app.sim.graph.route(start, c.node).cost`), ни один не на заведении; перезагрузка — те же `node`; `Date.now = () => реальное + 3600e3` в консоли → через секунду «карта бита», боссы исчезают, новая рука. Тесты PASS.

- [ ] **Шаг 7: коммит**

```bash
git add src/cards.js src/rules.js src/store.js src/hunters.js src/main.js src/game.js tests/rules.test.mjs
git commit -m "Карты часа: колода из рейтинга, сдача руки, боссы на узлах, рука в прогрессе, смена часа"
```

---

### Задача 8: бой с боссом, откат, бонус за руку, HUD‑полоса, доска и карточки

**Files:**
- Modify: `src/cards.js` (`fight`, `settle`, `completeHand`, `hudHtml`, `redraw(card)`, `flyTo(slot)`)
- Modify: `src/game.js` (`duel` с веткой `h.card`, `update` с `pendingBoss`, сброс `pendingBoss` в `clickGround/clickVenue/clickShop/choose/die/perish/setPlayer`, `renderHUD` с полосой и своей картой, `cardHtml` для босса)
- Modify: `src/main.js` (`showCard`: кнопка `bFight`, мета «босс часа»; `boardRow`/`renderBoard` с картами и `top(52)`; `LOG_ICON`/`logText` для `card`, `cardBit`, `hand`; клик по полосе на HUD)
- Modify: `index.html` (кнопка `bFight` в карточке, строка легенды), `style.css` (`.hand`, `.hc`, `.hc.cool`, `.hc.down`, `.hc.red`, `.handT`, `.handR`, `.myCard`, `.bcard`)
- Modify: `src/share.js` (`statsOf` → `hands`, строка «лучшая рука», своя карта через опцию)

**Interfaces:**
- Consumes: `bossBonus`, `bossXp`, `CARD`, `HAND_MULT`, `TOKEN`, `POINTS`, `HEAT.boss` (задача 1); `handRank`, `cardLabel`, `cardName`, `beaten`, `isRed` (задача 2); `addSlot` из `main.js` (задача 5), передаётся в `Cards` как `addSlot`; `game.duel(h)` существующий контракт: `h.a` агент, `h.intent`, `h.bonus`, возвращает исход или `null`.
- Produces: `game.pendingBoss = { card, a }`; `Cards.fight(card)`; `Cards.settle(h, r, { foe, fb, my, tb })` → `'card' | 'cardBit' | 'killed' | 'rip'`; `Cards.hudHtml()`; записи журнала `card`, `cardBit`, `hand`.

- [ ] **Шаг 1: бой**

`Cards.fight(card)`: если `card.state !== 'up'` — пузырь игроку «отдышись» (`cool`) или «эта карта уже бита» (`down`), выход; иначе `game.pendingBoss = { card, a: this.agentOf(card) }`, `game.dropPending()`, `sim.moveTo(player, a.x, a.z, { cut: true })`, при `false` — «не дойти» и сброс. В `Game.update` после блока `pending`: `const pb = this.pendingBoss; if (pb && !this.busy && p.state !== 'dead') { if (!this.sim.agents.includes(pb.a) || pb.card.state !== 'up') this.pendingBoss = null; else if (this.inReach(pb.a, PURSUIT.reach)) { this.pendingBoss = null; this.duel({ a: pb.a, intent: 'kill', bonus: bossBonus(pb.card.rank), card: pb.card }); } }`. Сбрасывать `pendingBoss` там же, где `pendingVenue`.

`duel(h)`: заголовок босса `'🃏 ' + cardLabel + ' · ' + name` (+ бонус); после `showDuelResult` при `h.card`: `outcome = this.cards.settle(h, r, { foe, fb, my, tb })`; если `this.player !== me` — `busy = false`, вернуть `outcome`; иначе `save`, `renderHUD`, `busy = false`, `showCard(me, true)`, вернуть `outcome`. Существующая ветка охотника без изменений.

`settle`: `base = { uid: a.uid, name, age, gender, job, arch, ck, slot, rank, suit, card: cardLabel(rank, suit), cardName: cardName(rank, suit), owner, ghoul, foe, bonus: fb, roll: my, meBonus: tb }`. Победа: `card.state = 'down'`, `redraw(card)`, при крите `game.heal(1)`, `g.coins += 4`, `g.wins++`, `xp = bossXp(rank)`, `game.points(xp)`, `game.log('card', base)`, `hunters.gain('boss')`, `game.quests?.onEvent('card', xp)`, пузырь `🃏 ${cardName} ${beaten(rank)} · XP +${xp}`, через 2.6 с «🪙 +4»; если все пять `down` — `completeHand()`; вернуть `'card'`. Поражение: `g.losses++`, `game.points(POINTS.loss)`, `game.log('cardBit', { ...base, ate: r.eat })`, `card.state = 'cool'; card.coolUntil = Date.now() + CARD.cooldown × 1000`, `redraw(card)`, пузырь босса «ам»/«АМ-АМ», `res = game.eat(r.eat, 'boss')`; вернуть `res === 'dead' ? (game.player !== me && me.def.dead ? 'rip' : 'killed') : 'cardBit'`. В обоих случаях `game.save()`.

`completeHand()`: `hr = handRank(cards)`, `xp = CARD.handBase × hr.mult`, `game.points(xp)`, `g.hands = (g.hands | 0) + 1`, `g.bestHand` обновляется при большем `mult` (`{ key, name, mult }`), `g.tokens += TOKEN.perHand`, `slotNew = this.addSlot()`, `game.log('hand', { hand: hr.key, name: hr.name, mult: hr.mult, xp, cards: cards.map(c => cardLabel(c.rank, c.suit)) })`, пузырь на 5 с `🃏 рука собрана: ${hr.name} · +${xp} XP · 🎟 +1${slotNew ? ' · 🦴 новый слот' : ''}`, `save`, `renderHUD`.

- [ ] **Шаг 2: карточка босса и кнопка**

`index.html`: в `.cardBtns` добавить `<button id="bFight" hidden>⚔ сразиться</button>`. `showCard`: `const bc = cards.cardOf(a)`; `cMeta` для босса « · босс часа»; `$('bFight').hidden = !bc || !game.player || a.def.dead`; текст по состоянию: `up` «⚔ сразиться», `cool` «отдышись · N с» (`disabled`), `down` «бита» (`disabled`); клик: если `!game.selected` — `takeControl(game.player)`, затем `cards.fight(bc)`. `cardHtml(a)` для `a.def.boss`: `<div class="gm"><div class="line">карта часа <b class="bcard${isRed ? ' red' : ''}">${label}</b> · бонус +${bossBonus} · за победу XP ${bossXp}</div></div>` плюс строка владельца «копия скелета из рейтинга» или «упырь с карточного стола».

- [ ] **Шаг 3: HUD, доска, журнал, шаринг**

`Cards.hudHtml()`: `<div class="hand">` + пять `<span class="hc ${state}${isRed ? ' red' : ''}" data-slot="${slot}" title="${name}">` с текстом `label` (у `down` — `🂠`), у `cool` вложенный `<small class="cd">${секунды}</small>`; затем `<span class="handR">${hr.name} ×${hr.mult}</span><span class="handT">⏳ ${mm:ss до конца часа}</span></div>`. `renderHUD` вставляет полосу после ряда счётчиков и в ряд счётчиков `myCard()` как `<span class="myCard" title="твоя карта в колоде часа">карта ${label}</span>` (только с базой и когда скелет в топ‑52). `Cards.update` раз в секунду обновляет `.handT` и `.cd` текстом. Клик по `.hc` в `$('hud').onclick` (до взятия управления): `cards.flyTo(+hc.dataset.slot)` — камера к боссу и его карточка.

Доска: `renderBoard` зовёт `remote.top(52)`; `boardRow(r, i, me)` добавляет `<span class="bcard${red}">${cards.labelForRank(i + 1) || ''}</span>` для живых строк. Легенда: строка «<b>Карта над головой</b> — босс часа из рейтинга: клик, «сразиться», XP по старшинству; пять карт за час — покерный бонус, жетон и новый слот скелета.»

Журнал: `LOG_ICON` — `card: '🎴', cardBit: '🩸', hand: '🏆'`; `logText`: `card` → `${e.cardName} ${beaten(e.rank)}: ${nm}, ${vs}`; `cardBit` → `${nm} (${e.card}) укусил${his}, ${vs}`; `hand` → `рука собрана: ${e.name} ×${e.mult}, +${e.xp} XP`. Шаринг: `statsOf` уже даёт `hands` и `bestHand`; в `renderShareCard` строка «рук собрано N · лучшая: …» и своя карта, если есть (`opts.myCard`).

- [ ] **Шаг 4: проверка в браузере** — `__app.game.debugRoll = 20; __app.game.debugRollFoe = 1` → «сразиться» с двойкой даёт XP +4 и 🪙 +4, карта на полосе перевёрнута; с тузом +28; `debugRoll = 1; debugRollFoe = 20` → укус, карта серая, кнопка «отдышись», через 60 с снова «сразиться», клик рядом с боссом без кнопки боя не начинает; пять побед — плашка руки, `g.hands === 1`, `g.tokens` +1, `__app.slots()` +1; доска показывает карты у строк; журнал пишет три вида записей. Тесты PASS.

- [ ] **Шаг 5: коммит**

```bash
git add src/cards.js src/game.js src/main.js src/share.js index.html style.css
git commit -m "Бой с боссом часа, откат карты, бонус за руку с жетоном и слотом, полоса руки на HUD, карты на доске"
```

---

### Задача 9: `src/quests.js` — цепочка онбординга на устройство

**Files:**
- Create: `src/quests.js`
- Modify: `src/game.js` (хуки `onEvent`, `renderHUD` строка квеста), `src/main.js` (создание, `game.quests`, `__app.quests`, `LOG_ICON.quest`, `logText` для `quest`), `style.css` (`.hudQuest`)

**Interfaces:**
- Consumes: `QUESTS`, `questFor`, `nextQuest`, `questBonus` (задача 1); `local.get/set` из `store.js`; `game.points`, `game.log`, `sim.say`.
- Produces: `class Quests { constructor({ game, sim }); get done(); current(); onEvent(kind, xp); hudHtml() }`, хранение `local.get('quests', [])`.

- [ ] **Шаг 1: класс**

`onEvent(kind, xp)`: `q = questFor(this.done, kind)`; без `q` — выход; `done.push(q.id); local.set('quests', done)`; `bonus = questBonus(xp)`; `game.points(bonus)`; `game.log('quest', { id: q.id, title: q.title, bonus })`; пузырь `🎯 ${q.title} · +${bonus} XP за квест` на 3 с; если `nextQuest(done) === null` — `g.tokens++`, пузырь «🎯 цепочка пройдена · 🎟 +1» на 3.5 с; `game.save(); game.renderHUD()`. `hudHtml()`: текущий квест → `<div class="hudQuest">🎯 ${title} · ${hint}</div>`, иначе `''`.

- [ ] **Шаг 2: хуки в `game.js`**

В `resolve`: после `this.log('kill', info)` — `this.quests?.onEvent('kill', POINTS.win)`; после `this.log('friend', …)` — `onEvent('friend', POINTS.win)`. В колбэке конфет: монета → `onEvent('coin', 0)`, конфета (и «сыт») → `onEvent('candy', 0)`. В ветке победы над охотником в `duel` — `onEvent('win', POINTS.win)`. Победа над боссом уже вызывает `onEvent('card', xp)` в `Cards.settle`. `renderHUD`: строка квеста перед `hudHint`. `main.js`: `const quests = new Quests({ game, sim }); game.quests = quests;` до `cards.start()`; `LOG_ICON.quest = '🎯'`; `logText` `quest` → `квест «${e.title}»: +${e.bonus} XP`.

- [ ] **Шаг 3: проверка в браузере** — чистое устройство: HUD показывает «🎯 первая гадость · кликни по прохожему…»; гадость даёт XP +2 и ещё +2 с пузырём квеста, HUD переключается на сладость; конфета даёт +5; после победы над боссом шестой квест закрывается, `g.tokens` +1, строка исчезает; у второго скелета на том же устройстве цепочка не повторяется (`local.get('quests')` общий). Тесты PASS.

- [ ] **Шаг 4: коммит**

```bash
git add src/quests.js src/game.js src/main.js style.css
git commit -m "Квесты онбординга на устройство: шесть шагов с бонусом XP и жетоном за цепочку"
```

---

### Задача 10: README, версия модулей, финальная проверка

**Files:**
- Modify: `README.md`, `index.html` (через `tools/version.py`)

- [ ] **Шаг 1: README**

В разделе «Игра» добавить пункты: «**Карты часа.**» (колода из топ‑52 по XP, масти по четвертям, рука из пяти по минскому часу вокруг игрока, боссы пассивны, бой по «сразиться», бонус босса и XP по старшинству, укус и минута отката, бонус за руку по покеру, жетон и слот за руку); «**Квесты.**» (шесть шагов на устройство, бонус `max(5, XP действия)`, жетон за цепочку); «**Слоты скелетов.**» (один по умолчанию, слот за собранную руку, до пяти, старые устройства не теряют живых); «**Жетоны 🎟.**» (первая публикация, собранная рука, магазин за 12 🪙, потолок 3 для покупки); «**Проезжая часть.**» (×1.2 скорость, +1 розыска за 4 с ходьбы, толпа держится тротуаров, срезки через дорогу разрешены). Раздел «Арканы таро» дополнить: колода и тексты открываются из HUD, профиля и журнала. Раздел «Как устроено» — `cards.js`, `quests.js`, `poker.js`. Тесты: `node --test tests/*.test.mjs` в README уже упомянут, число тестов не указывать.

- [ ] **Шаг 2: версия и тесты**

Run: `python tools/version.py && node --test tests/*.test.mjs`
Expected: importmap с `?v=<текущий короткий хеш>`, тесты PASS.

- [ ] **Шаг 3: коммит и PR**

```bash
git add README.md index.html
git commit -m "README про карты часа, квесты, слоты, жетоны и проезжую часть; версия модулей"
```

PR в `main` с названием «Эндгейм: карты часа из рейтинга, XP, квесты, жетоны и проезжая часть», в описании ссылка на спеку и план и чек‑лист спеки «Проверка в браузере» (пункты 1–14) для локальной сессии.
