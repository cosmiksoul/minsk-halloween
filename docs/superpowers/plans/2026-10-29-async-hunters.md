# Охотники, стак, журнал и счёт: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Чужие скелеты приходят охотниками с кладбищ по шкале угрозы, бой с ними встречный бросок, прогресс игрока становится стаком из сердец и хвоста, коллекция журналом, счёт накопителем; результаты набегов ходят через Supabase.

**Architecture:** Все числа и чистые правила (уровни, дуэль, стак, очки, миграция, выбор кладбища) живут в новом модуле `src/rules.js` без DOM и three.js и покрыты тестами на `node --test`. Логика охотников в новом `src/hunters.js`, который водит агентов через существующие методы симуляции и зовёт дуэль в `game.js`. В `game.js` меняются правила боя с прохожими, появляются стак, счёт, журнал и дуэль; `dice.js` получает «тихий» бросок без ярлыка и экран сравнения; `store.js` новые колонки и таблицу `encounters`.

**Tech Stack:** ES‑модули без сборки, three.js, Node 24 только для тестов (`node --test`), Supabase через PostgREST, Python 3 для выпечки данных.

**Spec:** `docs/superpowers/specs/2026-10-29-async-hunters-design.md`

## Как читать этот план

- Код проекта на момент написания плана: `origin/main` после PR #3. Параллельная ветка переписывает `sim.js`, `game.js`, `main.js`, `index.html`, `style.css` (толпа, автопилот, новый UI). Этот план ссылается на функции по именам из `main`, они должны пережить переписывание: `Game.setPlayer/restore/resolve/damage/die/respawn/visit/collect/buy/renderHUD/update`, `Sim.moveTo/teleport/remove/say/streetOf/spawnCustom/befriend/unfriend/ghostify/stop`, `Remote.upsert/others/top`, `rollDice/hideDice`. Если в новой ветке что‑то переименовано, план применяется к преемнику.
- Задачи 1 и 2 не зависят от параллельной ветки. Задачи 3–8 ложатся поверх неё.
- Порядок задач выбран так, чтобы после задачи 3 игра была выпускаемой (новые правила боя без охотников), после задачи 5 выпускаемой с охотниками без базы, после задачи 7 с полной петлёй.
- Проверку в браузере делает локальная сессия по чек‑листу в конце: у неё Chrome и `window.__app`. Облачная сессия обязана прогнать `node --test tests/` и убедиться, что страница грузится без ошибок там, где это возможно.
- Все пользовательские строки на русском, в стиле существующих пузырей: коротко, без точки в конце, эмодзи в начале.

## Global Constraints

- Никакой сборки и зависимостей: `src/rules.js` и `src/hunters.js` импортируют только модули проекта; `rules.js` не импортирует ничего и не трогает `document`, `window`, `performance`.
- Капы: сердец 10, друзей в хвосте 10, начальный максимум сердец 3.
- Очки: победа +2, поражение −1, аркана +5 один раз, первое посещение заведения +1, остальное 0; счёт не ниже нуля.
- Угроза 0..100, уровень = `min(5, floor(heat / 20))`; прирост: череп +15, друг +8, аркана +10, охотник побеждён +12, минута управления с движением +1; спад −1 за 20 с после 30 с без прироста; сброс в заведении не чаще раза в 180 с; охотники ближе 200 м сброс игнорируют; покупка костюма сбрасывает всех без ограничения.
- Таблица уровней (охотников · дистанция · скорость от игрока · пауза · бонус): 1: 1 · 2500 · 0.85 · 90 · 0; 2: 2 · 2000 · 0.95 · 75 · 0; 3: 3 · 1600 · 1.05 · 60 · +1; 4: 4 · 1200 · 1.15 · 45 · +2; 5: 5 · 900 · 1.25 · 30 · +3.
- Дуэль: d20 против d20, больше выиграл, ничья переброс обоих, 20 у победителя крит, 1 у проигравшего крит‑провал; бонус игрока +1 за каждые 5 друзей в хвосте, максимум +2.
- Охотник ест сначала последнего друга из хвоста, потом сердце: максимум −1 (не ниже 3) и текущее −1; крит ест две позиции. Щиты 🎃 поглощают укусы.
- Охота только на управляемого скелета (`game.player` при `game.selected`); при отпущенном управлении новые не выходят, старые уходят через 60 с.
- Позиция игрока (`x`, `z`) в Supabase не пишется.
- Журнал локально до 200 записей, новые сверху.
- Коммиты с трейлером `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, сообщения на русском.

## Review Focus

- Старый прогресс (до 6 сердец, десятки друзей и черепов в массивах `skulls`/`friends`) при первом входе должен превратиться в v2 без потери места в рейтинге: счёт по старой формуле, в хвост первые 10 друзей, остальные в журнал. Тест в задаче 1 (`migrate`).
- Охотник доходит, когда открыт магазин, идёт другой бросок или игрок мёртв: дуэль не должна открыть кубик поверх модалки и не должна стартовать дважды. Шаг проверки в задаче 4 и условие `busy`/`shop` в `Game.duel`.
- Угроза при входе после долгого отсутствия или с `heatAt` из будущего (сбитые часы) не должна стать отрицательной или NaN. Тест в задаче 1 (`decayed`).
- Игрок у края карты или кладбища без проходимого узла в 300 м: выбор кладбища возвращает `null`, охотник не появляется, ошибок нет. Тест в задаче 1 (`pickCemetery`).
- Укус до нуля здоровья: смерть внутри дуэли должна сбросить угрозу и снять охотников, а дуэль не должна после этого начислять что‑то ещё и писать `bit` вместо `killed`. Шаг проверки в задаче 4.

---

### Task 1: Чистые правила `src/rules.js` и тесты

**Files:**
- Create: `src/rules.js`
- Create: `tests/rules.test.mjs`
- Modify: `src/dice.js` (функция `outcomeOf` переезжает в `rules.js`, `dice.js` импортирует и реэкспортирует её)
- Modify: `src/store.js` (функция `scoreOf` переезжает в `rules.js`, `store.js` реэкспортирует)

**Interfaces:**
- Produces (всё `export` из `src/rules.js`):
  - `CAPS = { hearts: 10, tail: 10, baseHearts: 3 }`
  - `POINTS = { win: 2, loss: -1, tarot: 5, visit: 1 }`
  - `HEAT = { kill: 15, friend: 8, tarot: 10, raidWin: 12, minute: 1, decayPer: 20, idleAfter: 30, resetCooldown: 180, max: 100 }`
  - `LEVELS: Array<{ hunters, dist, speed, pause, bonus }>` длиной 6, индекс = уровень, значения из Global Constraints, нулевой уровень все нули
  - `PURSUIT = { repathEvery: 25, repathDist: 150, nearWarn: 300, nearSay: 80, seenDist: 200, farFactor: 1.5, farAfter: 90, uncontrolledAfter: 60, leaveAfter: 60, cemNodeR: 300 }`
  - `LOG_MAX = 200`
  - `outcomeOf(n: number): 'critfail' | 'fail' | 'success' | 'crit'` (1; 2–10; 11–19; 20)
  - `levelOf(heat: number): 0..5`
  - `decayed(heat: number, seconds: number): number` = `max(0, heat − seconds / HEAT.decayPer)`, при `seconds < 0` или нечисле возвращает `heat` без изменений, результат всегда конечное число в 0..100
  - `tailBonus(tailLen: number): 0 | 1 | 2`
  - `hunterBonus(level: number): number` = `LEVELS[level].bonus`
  - `duel(foe: number, foeBonus: number, me: number, meBonus: number): { winner: 'me' | 'foe' | 'tie', crit: boolean, eat: 0 | 1 | 2 }` — сравниваются `foe + foeBonus` и `me + meBonus`; `crit` истинно, если натуральный кубик победителя 20 или натуральный кубик проигравшего 1; `eat` = 0 при победе игрока, 1 при победе охотника, 2 при победе охотника с `crit`
  - `newProgress(): object` — `{ v: 2, hp: 3, maxHp: 3, score: 0, wins: 0, losses: 0, tail: [], log: [], visits: [], tarot: [], coins: 0, tokens: 0, deaths: 0, kills: 0, heat: 0, heatAt: 0, resetAt: -1e9, shared: null }`
  - `migrate(g: object | null | undefined): object` — возвращает объект v2 (тот же объект, дополненный, либо новый при пустом входе). Если `g.v === 2`, возвращает как есть. Иначе: `score = skulls.length*3 + friends.length*3 + tarot.length*5 + visits.length`, `wins = skulls.length + friends.length`, `losses = 0`, `tail = friends.slice(0, 10)`, `log` = записи `{ kind: 'kill', ...s }` из `skulls` и `{ kind: 'friend', ...f }` из `friends` (включая тех, кто не попал в хвост), `maxHp = clamp(maxHp, 3, 10)`, `hp = clamp(hp, 1, maxHp)`, поля `skulls` и `friends` удаляются, остальные поля сохраняются, недостающие берутся из `newProgress()`
  - `addPoints(g, n: number): number` — `g.score = max(0, g.score + n)`, возвращает новый счёт
  - `growHearts(g, healToo = true): boolean` — `maxHp = min(10, maxHp + 1)`; если `healToo`, `hp = min(maxHp, hp + 1)`; возвращает `true`, если максимум вырос
  - `eatStack(g, n: number): Array<{ kind: 'friend', who: object } | { kind: 'heart' }>` — по одной позиции: если `tail.length > 0`, снимает последний элемент хвоста; иначе `maxHp = max(3, maxHp − 1)`, `hp = max(0, min(hp − 1, maxHp))`. Возвращает список снятого по порядку
  - `logPush(g, entry: object): object` — `entry.at ||= new Date().toISOString()`, `unshift`, обрезка до `LOG_MAX`, возвращает запись
  - `scoreOf(g): number` — `g ? (g.v === 2 ? g.score : score по старой формуле) : 0`
  - `intentOf(kills: number, friends: number, rng: () => number): 'kill' | 'friend'` — больше черепов `kill`, больше друзей `friend`, равно по `rng() < 0.5`
  - `pickCemetery(items: Array<{ x, z, node }>, px, pz, level): object | null` — `want = LEVELS[level].dist`; кандидаты с `node >= 0` и расстоянием `d >= want / 2`; возвращает кандидата с минимальным `|d − want|`, иначе `null`; при `level === 0` всегда `null`
  - `canReset(g, now: number): boolean` — `now − g.resetAt >= HEAT.resetCooldown`

- [ ] **Step 1: Написать падающие тесты `tests/rules.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPS, POINTS, HEAT, LEVELS, outcomeOf, levelOf, decayed, tailBonus, duel, newProgress, migrate, addPoints, growHearts, eatStack, logPush, scoreOf, intentOf, pickCemetery, canReset } from '../src/rules.js';

test('outcomeOf пороги', () => { assert.equal(outcomeOf(1), 'critfail'); assert.equal(outcomeOf(2), 'fail'); assert.equal(outcomeOf(10), 'fail'); assert.equal(outcomeOf(11), 'success'); assert.equal(outcomeOf(19), 'success'); assert.equal(outcomeOf(20), 'crit'); });
test('levelOf', () => { assert.equal(levelOf(0), 0); assert.equal(levelOf(19.9), 0); assert.equal(levelOf(20), 1); assert.equal(levelOf(99), 4); assert.equal(levelOf(100), 5); assert.equal(levelOf(140), 5); assert.equal(levelOf(-5), 0); });
test('LEVELS из спеки', () => { assert.equal(LEVELS.length, 6); assert.deepEqual(LEVELS[1], { hunters: 1, dist: 2500, speed: 0.85, pause: 90, bonus: 0 }); assert.deepEqual(LEVELS[5], { hunters: 5, dist: 900, speed: 1.25, pause: 30, bonus: 3 }); assert.equal(LEVELS[3].bonus, 1); });
test('decayed: спад и защита от мусора', () => { assert.equal(decayed(50, 200), 40); assert.equal(decayed(10, 1e9), 0); assert.equal(decayed(30, -100), 30); assert.equal(decayed(30, NaN), 30); assert.ok(Number.isFinite(decayed(30, Infinity))); });
test('tailBonus', () => { assert.equal(tailBonus(0), 0); assert.equal(tailBonus(4), 0); assert.equal(tailBonus(5), 1); assert.equal(tailBonus(10), 2); assert.equal(tailBonus(25), 2); });
test('duel: сравнение с бонусами', () => {
  assert.deepEqual(duel(14, 2, 15, 0), { winner: 'foe', crit: false, eat: 1 });
  assert.deepEqual(duel(14, 0, 15, 0), { winner: 'me', crit: false, eat: 0 });
  assert.equal(duel(12, 3, 15, 0).winner, 'tie');
  assert.deepEqual(duel(20, 0, 5, 2), { winner: 'foe', crit: true, eat: 2 });
  assert.deepEqual(duel(9, 0, 1, 0), { winner: 'foe', crit: true, eat: 2 });
  assert.deepEqual(duel(3, 0, 20, 0), { winner: 'me', crit: true, eat: 0 });
  assert.equal(duel(1, 0, 20, 0).crit, true);
});
test('migrate: старый прогресс не теряет место', () => {
  const friends = Array.from({ length: 13 }, (_, i) => ({ uid: 100 + i, name: 'Д' + i }));
  const skulls = Array.from({ length: 8 }, (_, i) => ({ uid: 200 + i, name: 'Ч' + i }));
  const g = migrate({ hp: 2, maxHp: 6, skulls, friends, visits: [{ id: 1 }, { id: 2 }], tarot: [{ id: 'tower' }], deaths: 1, kills: 8, coins: 7, tokens: 1 });
  assert.equal(g.v, 2); assert.equal(g.score, 13 * 3 + 8 * 3 + 5 + 2); assert.equal(g.wins, 21); assert.equal(g.losses, 0);
  assert.equal(g.tail.length, 10); assert.equal(g.tail[0].uid, 100); assert.equal(g.log.length, 21);
  assert.equal(g.log.filter(e => e.kind === 'friend').length, 13); assert.equal(g.maxHp, 6); assert.equal(g.hp, 2); assert.equal(g.coins, 7);
  assert.equal(g.skulls, undefined); assert.equal(g.friends, undefined); assert.equal(g.heat, 0);
  assert.equal(migrate(g), g); assert.equal(migrate(null).v, 2); assert.equal(migrate({ maxHp: 6, hp: 0 }).hp, 1);
});
test('addPoints не ниже нуля', () => { const g = newProgress(); assert.equal(addPoints(g, POINTS.loss), 0); assert.equal(addPoints(g, POINTS.win), 2); assert.equal(addPoints(g, -1), 1); });
test('growHearts с капом', () => { const g = newProgress(); g.hp = 1; assert.equal(growHearts(g), true); assert.equal(g.maxHp, 4); assert.equal(g.hp, 2); g.maxHp = CAPS.hearts; g.hp = 9; assert.equal(growHearts(g), false); assert.equal(g.maxHp, 10); assert.equal(g.hp, 10); });
test('eatStack: хвост, потом сердца, не ниже трёх', () => {
  const g = newProgress(); g.maxHp = 5; g.hp = 5; g.tail = [{ uid: 1 }, { uid: 2 }];
  assert.deepEqual(eatStack(g, 1), [{ kind: 'friend', who: { uid: 2 } }]); assert.equal(g.tail.length, 1);
  assert.deepEqual(eatStack(g, 2), [{ kind: 'friend', who: { uid: 1 } }, { kind: 'heart' }]); assert.equal(g.maxHp, 4); assert.equal(g.hp, 4);
  g.maxHp = 3; g.hp = 1; assert.deepEqual(eatStack(g, 1), [{ kind: 'heart' }]); assert.equal(g.maxHp, 3); assert.equal(g.hp, 0);
});
test('logPush: сверху, не больше 200, с датой', () => { const g = newProgress(); for (let i = 0; i < 205; i++) logPush(g, { kind: 'visit', i }); assert.equal(g.log.length, 200); assert.equal(g.log[0].i, 204); assert.ok(g.log[0].at); });
test('scoreOf: v2 и старый', () => { assert.equal(scoreOf(null), 0); assert.equal(scoreOf({ v: 2, score: 17 }), 17); assert.equal(scoreOf({ skulls: [1], friends: [1, 1], tarot: [1], visits: [1, 1, 1] }), 3 + 6 + 5 + 3); });
test('intentOf', () => { assert.equal(intentOf(5, 2, () => 0.9), 'kill'); assert.equal(intentOf(1, 2, () => 0.1), 'friend'); assert.equal(intentOf(2, 2, () => 0.1), 'kill'); assert.equal(intentOf(2, 2, () => 0.9), 'friend'); });
test('pickCemetery: ближайшее к дистанции уровня, не ближе половины, null без узлов', () => {
  const items = [{ x: 0, z: 900, node: 1 }, { x: 0, z: 2400, node: 2 }, { x: 0, z: 5000, node: 3 }, { x: 0, z: 2500, node: -1 }];
  assert.equal(pickCemetery(items, 0, 0, 1).z, 2400);
  assert.equal(pickCemetery(items, 0, 0, 5).z, 900);
  assert.equal(pickCemetery([{ x: 0, z: 100, node: 1 }], 0, 0, 5), null);
  assert.equal(pickCemetery([], 0, 0, 3), null); assert.equal(pickCemetery(items, 0, 0, 0), null);
});
test('canReset', () => { const g = newProgress(); assert.equal(canReset(g, 10), true); g.resetAt = 100; assert.equal(canReset(g, 200), false); assert.equal(canReset(g, 280), true); });
test('HEAT из спеки', () => { assert.deepEqual(HEAT, { kill: 15, friend: 8, tarot: 10, raidWin: 12, minute: 1, decayPer: 20, idleAfter: 30, resetCooldown: 180, max: 100 }); });
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `node --test tests/`
Expected: все тесты FAIL с `Cannot find module '.../src/rules.js'`

- [ ] **Step 3: Реализовать `src/rules.js` по сигнатурам из Interfaces**

Файл начинается с комментария на русском, что это все числа и правила игры в одном месте, без DOM. Никаких импортов.

- [ ] **Step 4: Перенести `outcomeOf` и `scoreOf`**

В `src/dice.js` убрать локальное определение `outcomeOf`, добавить `import { outcomeOf } from './rules.js'; export { outcomeOf };`. В `src/store.js` убрать определение `scoreOf`, добавить `import { scoreOf } from './rules.js'; export { scoreOf };` (у `main.js` импорт `scoreOf` из `store.js` остаётся рабочим).

- [ ] **Step 5: Прогнать тесты**

Run: `node --test tests/`
Expected: `# pass 16`, `# fail 0`

- [ ] **Step 6: Коммит**

```bash
git add src/rules.js tests/rules.test.mjs src/dice.js src/store.js
git commit -m "rules.js: правила стака, дуэли, угрозы и счёта в одном месте, с тестами"
```

---

### Task 2: Кладбища `data/map/cemeteries.json`

Сделано автором плана, потому что кэш Overpass (`tools/cache/`, 180 МБ, в git не входит) есть только на локальной машине. В ветке уже лежат изменение `tools/bake_osm.py` и сам `data/map/cemeteries.json`. Исполнителю: проверить, что файл есть, и ничего не перепекать.

**Files:**
- Modify (сделано): `tools/bake_osm.py` — в ветке `else` для зелени, при `tags.get('landuse') == 'cemetery'`, самое большое кольцо даёт центроид и площадь в `data['cemeteries']`; после `write_outputs` список фильтруется по площади ≥ 3000 м², сортируется по убыванию площади, координаты переводятся обратно в широту и долготу и пишутся в `cemeteries.json`.
- Create (сделано): `data/map/cemeteries.json` вида `{ "center": [lat, lon], "items": [{ "name"?, "lat", "lon", "x", "z", "area" }] }`.

**Interfaces:**
- Produces: `data/map/cemeteries.json`; поле `name` может отсутствовать; `x`, `z` в метрах в той же проекции, что тайлы (центр `index.center`).

- [ ] **Step 1: Проверить файл**

Run: `node -e "const d=require('./data/map/cemeteries.json');console.log(d.items.length, d.items.filter(i=>i.name).length, d.items.find(i=>/Кальвар/.test(i.name||'')))"`
Expected: 29 элементов, 26 с именем (по‑русски, из `name:ru`), «Кальварийское кладбище» в `x ≈ -4207, z ≈ -422` (это настоящее кладбище у Кальварийской улицы и Притыцкого; координаты арканы «Повешенный» в `tarot.js` стоят в 1,4 км восточнее и требуют отдельной правки, в этот план не входит). Мемориалы Тростенца и воинские захоронения исключены списком `CEM_SKIP` в `bake_osm.py`.

---

### Task 3: Стак, счёт, журнал и новый бой с прохожими в `game.js`

**Files:**
- Modify: `src/game.js` (константы, `setPlayer`, `restore`, `resolve`, `damage`, `die`, `respawn`, `visit`, `collect`, `buy`, `renderHUD`, `cardHtml`, `save`)
- Modify: `src/main.js` (импорт `scoreOf` уже есть; локальная доска читает `g.score`, `g.maxHp`, `g.tail.length`)
- Modify: `style.css` (классы `.tl`, `.pts`, `.thr`, `.thr.hot`, `.boss`)

**Interfaces:**
- Consumes: всё из `src/rules.js` (Task 1).
- Produces:
  - `Game.g` теперь всегда объект v2 (после `migrate` в `setPlayer`).
  - `Game.points(n: number)` — `addPoints` плюс `save` и `renderHUD`.
  - `Game.log(kind: string, extra: object = {})` — `logPush(this.g, { kind, street: this.sim.streetOf(this.player), ...extra })`, затем `this.o.onLog && this.o.onLog()`; возвращает запись.
  - `Game.eat(n: number, by: string, tailOnly = false): 'alive' | 'dead'` — при `tailOnly` снимает только из хвоста и останавливается, когда хвост пуст; иначе `eatStack`. Для каждого снятого друга находит агента по `uid` среди `this.player.followers` и зовёт `sim.unfriend`, пузырь «💚 Петя убежал» над игроком и «ай» над другом; для сердца пузырь «❤ −1 насовсем»; если `hp <= 0`, зовёт `die()` и возвращает `'dead'`. Щиты: перед `eatStack` работает та же логика, что в `damage` (каждый щит поглощает одну позицию).
  - `Game.hunters` — поле, которое ставит `main.js` (Task 5); все вызовы `this.hunters?.gain(...)` и `this.hunters?.resetAtVenue(...)` через `?.`, чтобы задача 3 работала и без охотников.
  - Запись журнала для прохожего: `{ kind: 'kill' | 'friend' | 'fail', uid, name, age, gender, job, arch, roll, action: 'kill' | 'friend', at, street }`. Для `friend` поле `inTail: boolean`.
  - Виды записей: `kill, friend, fail, spawn, bit, win, lost, raid_bit, raid_beaten, raid_lost, tarot, visit, buy, death`.

- [ ] **Step 1: Константы и миграция**

В `game.js`: `MAX_HP` заменить на `CAPS.hearts`, `BASE_HP` на `CAPS.baseHearts` (экспорт `BASE_HP`/`MAX_HP` оставить как алиасы, если на них кто‑то ссылается). В `setPlayer`: вместо ручной инициализации `a.def.game` — `a.def.game = migrate(a.def.game)`; ограничения `hp`/`maxHp` берутся из `migrate`.

- [ ] **Step 2: `restore` по журналу и хвосту**

Призраки: `for (const e of g.log) if (e.kind === 'kill')` — та же проверка по `uid` и имени, что сейчас для `skulls`. Друзья: по `g.tail` вместо `g.friends`. Записи журнала с `boss: true` пропускаются.

- [ ] **Step 3: `resolve` по таблице из спеки**

Успех/крит, гадость: `ghostify`, `growHearts(g)`, `g.kills++`, `g.wins++`, монеты 2 (крит 4), при крите ещё `heal(1)`, `points(POINTS.win)`, `log('kill', info)`, `hunters?.gain('kill')`. Успех/крит, сладость: если `g.tail.length < CAPS.tail` — `befriend` и `g.tail.push(info)`, `inTail: true`; иначе пузырь «💚 друзей уже десять, помашет из толпы» без `befriend`, `inTail: false`; остальное как у гадости, но `hunters?.gain('friend')` и `log('friend', ...)`. Провал: `damage(1)`, `g.losses++`, `points(POINTS.loss)`, `log('fail', info)`. Крит‑провал: `damage(2)`, `g.losses++`, `points(POINTS.loss)`, `log('fail', info)`, плюс если хвост не пуст — `eat(1, 'critfail')` только по хвосту (сердце при крит‑провале не отнимается: передать флаг `tailOnly`). Старое «−1 череп» убрать.

- [ ] **Step 4: Смерть, возрождение, посещение, аркана, покупка**

`die`: до существующего кода — всех `followers` `unfriend`, `g.tail = []`, `g.maxHp = max(3, g.maxHp − 2)`, `log('death')`, `hunters?.reset()`. `respawn`: `g.hp = g.maxHp`. `visit(v)`: `const first = !g.visits.some(x => x.id === v.id)`; при `first` — `points(POINTS.visit)` и `log('visit', { name: v.name, id: v.id })`; затем `hunters?.resetAtVenue('venue')`. `collect`: после `g.tarot.push` — `points(POINTS.tarot)`, `log('tarot', { id, name })`, `hunters?.gain('tarot')`. `buy` после успешной покупки: `log('buy', { kind, item })`, `hunters?.resetAtVenue('costume')`.

- [ ] **Step 5: HUD и карточка**

`renderHUD`: ряд сердец как есть (до 10), затем `<span class="tl">💚 ${g.tail.length}/${CAPS.tail}</span>`, `<span class="pts">★ ${g.score}</span>`, `<span class="thr${near ? ' hot' : ''}">${'🪦'.repeat(lvl)}${'·'.repeat(5 − lvl)}</span>` где `lvl = this.hunters?.level ?? 0`, `near = this.hunters?.nearest() && расстояние < PURSUIT.nearWarn`. Счётчик черепов — `g.kills`, друзей — число записей `friend` в журнале. Тултипы по `g.log` вместо `g.skulls`/`g.friends` (ограничить последними 30). В `cardHtml` для своего скелета строка «★ счёт · ❤ max · 💚 хвост».

- [ ] **Step 6: `save` без позиции в сеть**

`save` оставляет `g.x`/`g.z` для локального возрождения на месте; из `Remote.upsert` они убираются в Task 6.

- [ ] **Step 7: Проверка**

Run: `node --test tests/` → pass. Открыть игру локально, в консоли:
```js
const g = __app.game; g.debugRoll = 20; // создать скелета, выбрать прохожего, гадость
// ожидание: ❤ стало 4/4, ★ 2, 🪙 +4, запись kill сверху в g.g.log
g.debugRoll = 1; // сладость с другим прохожим → ❤ −2, ★ 1, запись fail
g.g.score = 0; g.debugRoll = 15; // 11 сладостей подряд → в хвосте 10, одиннадцатый «помашет из толпы», ★ растёт по 2
```
Ожидание: ошибок в консоли нет, `localStorage` после перезагрузки даёт `v: 2`, хвост снова идёт следом.

- [ ] **Step 8: Коммит**

```bash
git add src/game.js src/main.js style.css
git commit -m "Стак из сердец и хвоста, журнал вместо коллекции, счёт-накопитель +2/−1"
```

---

### Task 4: Кубик без ярлыка и дуэль `Game.duel`

**Files:**
- Modify: `src/dice.js` (`rollDice` получает `opts`, новая `showDuelResult`)
- Modify: `src/game.js` (`duel`, `debugRollFoe`)
- Modify: `style.css` (`#dice.plain`, `#dice .vs`)

**Interfaces:**
- Produces:
  - `rollDice(title, result, hold, opts = {})` — при `opts.plain === true` после остановки не пишет ярлык исхода и красит число нейтральным `#e9dff7`, класс `done plain`; возвращает `{ n, kind }` как раньше.
  - `showDuelResult(text: string, kind: 'success' | 'crit' | 'fail' | 'critfail' | 'tie', hold = false)` — показывает оверлей кубика с `diceTitle` = text, без канваса (`diceCv` скрыт), классом `done ${kind}`; при `hold === false` прячет через 2600 мс.
  - `Game.duel(h: { a, intent: 'kill' | 'friend', bonus: number, owner: null | { id, device, name } }): Promise<'skull' | 'heart' | 'bit' | 'killed' | null>` — `null`, если дуэль сейчас нельзя начать (`this.busy`, игрок `dead`, открыт магазин `!$('shop').hidden`, открыта колода `!$('deck').hidden`): охотник ждёт и повторит в следующем кадре.
  - `Game.debugRollFoe: number | null` — принудительный кубик охотника для отладки.

- [ ] **Step 1: `rollDice` с `opts.plain` и `showDuelResult`**

Минимальная правка существующей функции: ветка `else` после анимации смотрит `opts.plain`.

- [ ] **Step 2: `Game.duel(h)`**

Алгоритм (единственное место, где он задан):
1. Проверки из Interfaces → `null`. Иначе `this.busy = true`, `dropPending()`, `closeDialog()`, `sim.stop(player)`.
2. `const name = h.a.bio.name, tb = tailBonus(g.tail.length)`; заголовок охотника `h.intent === 'kill' ? '⚔ ' : '🤝 '` + имя + (`h.bonus ? ' +' + h.bonus : ''`), заголовок игрока `'ты' + (tb ? ' +' + tb : '')`.
3. Цикл до 10 раз: `foe = (await rollDice(titleFoe, this.debugRollFoe ?? undefined, true, { plain: true })).n`; `me = (await rollDice(titleMe, this.debugRoll ?? undefined, true, { plain: true })).n`; `r = duel(foe, h.bonus, me, tb)`; при `tie` — `showDuelResult('ничья, ещё раз', 'tie', true)`, пауза 900 мс, продолжить. После 10 ничьих считать победу игрока.
4. Если `r.winner === 'foe'` и `g.tokens > 0` — `offerSave` как в `roll()`: при согласии `g.tokens--`, перебросить только `me`, пересчитать `r`.
5. Текст сравнения: `${foe}${h.bonus ? '+' + h.bonus : ''} против ${me}${tb ? '+' + tb : ''}` + (`r.winner === 'me' ? ' · ты выиграл' : ' · ' + name + ' выиграл'`); `showDuelResult(text, r.winner === 'me' ? (r.crit ? 'crit' : 'success') : (r.crit ? 'critfail' : 'fail'))`.
6. Победа игрока: `const outcome = h.intent === 'kill' ? 'skull' : 'heart'`; `growHearts(g)`; при `r.crit` ещё `heal(1)`; `g.coins += 4`; `g.wins++`; `points(POINTS.win)`; `log('win', { uid: h.a.uid, name, age, gender, job, arch, boss: true, intent: h.intent, owner: h.owner?.id ?? null, foe, bonus: h.bonus, roll: me, level: this.hunters.level })`; `hunters.gain('raidWin')`; пузыри «👑💀 босс‑череп» или «👑💚 босс‑сердечко» и «🪙 +4».
7. Победа охотника: `g.losses++`; `points(POINTS.loss)`; `const state = this.eat(r.eat, 'hunter')`; `log('bit', { ...те же поля, ate: r.eat })`; `outcome = state === 'dead' ? 'killed' : 'bit'`; пузырь охотника «ам» или `LINES.mock`.
8. `save(); renderHUD(); this.busy = false;` вернуть `outcome`. Если за время дуэли игрок умер, никаких начислений после `eat`.

- [ ] **Step 3: Проверка вручную (без охотников, через консоль)**

```js
const g = __app.game, a = __app.sim.agents.find(x => !x.custom && !x.ghost);
g.debugRollFoe = 14; g.debugRoll = 15; await g.duel({ a, intent: 'kill', bonus: 2, owner: null }); // → 'bit', ❤ max −1 или друг убежал, ★ −1
g.debugRollFoe = 3; g.debugRoll = 20; await g.duel({ a, intent: 'friend', bonus: 0, owner: null }); // → 'heart', ❤ max +1 и +1 hp, 🪙 +4, ★ +2
g.debugRollFoe = 20; g.debugRoll = 5; g.g.maxHp = 3; g.g.hp = 1; g.g.tail = []; await g.duel({ a, intent: 'kill', bonus: 0, owner: null }); // → 'killed', смерть, респаун
document.getElementById('shop').hidden = false; await g.duel({ a, intent: 'kill', bonus: 0, owner: null }); // → null, кубик не открылся; затем вернуть hidden = true
```
Ожидание: кубики показывают числа без «провал/успех», сравнение читается, ошибок нет.

- [ ] **Step 4: Коммит**

```bash
git add src/dice.js src/game.js style.css
git commit -m "Дуэль: встречный бросок d20 с бонусами, тихий кубик и экран сравнения"
```

---

### Task 5: Охотники `src/hunters.js`, ведомые агенты в `sim.js`, подключение и индикатор

**Files:**
- Create: `src/hunters.js`
- Modify: `src/sim.js` (ветка ведомого агента, пропуск в `free` и `party`)
- Modify: `src/main.js` (загрузка кладбищ, создание `Hunters`, кадр, гости с данными, метка, `__app`)
- Modify: `index.html` (элемент метки `#hmark`)
- Modify: `style.css` (`#hmark`)

**Interfaces:**
- Consumes: `rules.js` (`LEVELS`, `PURSUIT`, `HEAT`, `levelOf`, `decayed`, `hunterBonus`, `intentOf`, `pickCemetery`, `canReset`), `Game.duel`, `Game.log`, `Sim.moveTo(a, x, z): boolean`, `Sim.teleport(a, node)`, `Sim.remove(a)`, `Sim.say(a, text, kind, dur)`, `Sim.streetOf(a)`, `Sim.spawnCustom(def, nearX, nearZ)`, `Sim.stop(a)`, `Sim.graph.nearest(x, z, r)`, `bio.js`: `makeRng, pick, pickArchetype, makeBio`.
- Produces:
  - `Sim`: агент с `a.driven === true` обновляется той же веткой, что игрок (`if (a.player || a.driven) this.updatePlayer(a, dt)`), не участвует в `free` для разговоров и в `party`, автопилот своих скелетов его пропускает. Скорость ставится снаружи.
  - Гость из сети получает `def.rid` (id строки), `def.device`, `def.stats = { kills, friends }`, `def.costume` (если есть в строке), как и раньше `guest: true, remote: true`.
  - `class Hunters`:
    - `constructor({ sim, game, cemeteries, remote })` — `cemeteries`: элементы `cemeteries.json` с добавленным `node` (вычисляет `main.js`: `sim.graph.nearest(x, z, PURSUIT.cemNodeR)`, элементы с `node < 0` отброшены).
    - `update(dt)` — раз в кадр после `game.update`.
    - `gain(kind: 'kill' | 'friend' | 'tarot' | 'raidWin' | 'minute')` — `heat = min(100, heat + HEAT[kind])`, `heatAt = sim.time` (для `minute` `heatAt` не трогается, чтобы ходьба не останавливала спад), при росте уровня пузырь «🪦 угроза N» и `game.renderHUD()`; работает только при управляемом скелете.
    - `resetAtVenue(kind: 'venue' | 'costume'): boolean` — для `venue` требует `canReset(g, sim.time)` и управляемого скелета; ставит `heat = 0`, `resetAt = sim.time`; охотники дальше `PURSUIT.seenDist` (или все при `costume`) переходят в `leave` с записью `lost`; пузырь «🪦 залёг на дно» или «🎭 не узнают»; возвращает, сработало ли.
    - `reset()` — `heat = 0`, всех в `leave` без записей (смерть).
    - `get heat(): number`, `get level(): number`, `get list(): Array<Hunter>`, `nearest(): Hunter | null` (ближайший активный к игроку).
    - `spawn(): Hunter | null` — отладка, немедленное появление по текущему уровню (если уровень 0, берёт уровень 1).
    - `setHeat(n: number)` — отладка.
    - `Hunter = { a, intent, bonus, owner: null | { id, device, name }, cem, state: 'hunt' | 'wait' | 'duel' | 'leave', repathAt, tx, tz, farSince, lostSince, leaveAt }`.
  - Состояние угрозы живёт в `game.g` (`heat`, `heatAt`, `resetAt`): при смене скелета охотники сбрасываются (`reset()` без записи), угроза берётся из нового `g`.

- [ ] **Step 1: `sim.js`: ведомые агенты**

Три правки по Interfaces. Проверка: `node --check src/sim.js` и игра грузится.

- [ ] **Step 2: `hunters.js`: угроза**

`update(dt)`: если нет `game.player` или `!game.selected` — режим «без управления»: не копить, спад по обычной ставке, активным охотникам `lostSince ||= sim.time`, через `PURSUIT.uncontrolledAfter` → `leave`. Иначе: минута с движением (`player.state === 'walk'` накапливает секунды, каждые 60 → `gain('minute')` через общий код с `HEAT.minute`); спад: если `sim.time − heatAt > HEAT.idleAfter`, каждые `HEAT.decayPer` секунд `heat −1` до нуля. При загрузке скелета (первый `update` с новым `g`): `heat = decayed(heat, (Date.now() − (g.heatWall || Date.now())) / 1000)`, где `g.heatWall` — настенное время последнего сохранения угрозы (писать его в `gain` и при спаде раз в 10 с). Уровень 0 → все активные в `leave`.

- [ ] **Step 3: `hunters.js`: появление**

Когда активных меньше `LEVELS[level].hunters` и с последнего появления прошло больше `LEVELS[level].pause` (первый выходит через `pause / 3`): `cem = pickCemetery(cemeteries, player.x, player.z, level)`; без кладбища — ничего. Кандидат: случайный гость (`a.custom && a.def.remote && !a.def.hunter && !a.def.raided`) с весом `1 + (score || 0) / 10`; если гостей нет — упырь: `seed = Math.floor(rng() * 1e9)`, `arch = pickArchetype(rng)`, `bio = makeBio(makeRng(seed), arch)`, `job = 'упырь с ' + (cem.name || 'кладбища у ' + улицы узла)`, `sim.spawnCustom({ name: bio.name, gender: bio.gender, age: bio.age, job, arch: arch.id, seed, guest: true, hunter: true, ghoul: true }, x, z)`. Гостя — `sim.teleport(a, cem.node)`, `a.def.hunter = true`. Общее: `a.driven = true; a.state = 'idle'; a.path = null; a.speed = player.speed * LEVELS[level].speed`; `intent = owner ? intentOf(stats.kills, stats.friends, rng) : (level >= 3 ? 'kill' : rng() < 0.7 ? 'kill' : 'friend')`; `bonus = hunterBonus(level)`; `owner = def.remote ? { id: def.rid, device: def.device, name: def.name } : null`. Пузырь над игроком «🪦 с ${cem.name || 'кладбища у ' + street} вылез ${name}», `game.log('spawn', { name, uid, cem: cem.name, intent })`.

- [ ] **Step 4: `hunters.js`: преследование и потеря следа**

`hunt`: если `sim.time − repathAt > PURSUIT.repathEvery` или игрок дальше `PURSUIT.repathDist` от `(tx, tz)` — `sim.moveTo(a, player.x, player.z)`, запомнить цель; при `false` (нет пути) — `leave`. Дистанция до игрока `d`: при `d < PURSUIT.nearSay` раз в 6 с пузырь «👀 ищет тебя» / «🤝 идёт знакомиться»; при `d > LEVELS[level].dist * PURSUIT.farFactor` копить `farSince`, через `PURSUIT.farAfter` → `leave` с `lost`; при `game.inReach(a)` → `state = 'duel'`, `game.duel(h).then(outcome => outcome === null ? (state = 'hunt') : this.finish(h, outcome))`. `leave`: `sim.moveTo(a, cem.x, cem.z)`, `leaveAt = sim.time`; через `PURSUIT.leaveAfter` или по прибытии (`a.state === 'idle'`) — `done(h)`: гостя `sim.remove(a)` и `def.raided = true`, упыря `sim.remove(a)`. `finish(h, outcome)`: охотник говорит «ушёл в туман», `leave`; запись в базу — Task 7 (`this.remote?.logEncounter`), здесь оставить вызов `this.onFinish?.(h, outcome)`.

- [ ] **Step 5: `main.js`: подключение**

В `Promise.all` добавить `j(BASE + 'cemeteries.json').catch(() => ({ items: [] }))`. После `sim`: `const cems = …items.map(c => ({ ...c, node: sim.graph.nearest(c.x, c.z, PURSUIT.cemNodeR) })).filter(c => c.node >= 0)`. После `game`: `const hunters = new Hunters({ sim, game, cemeteries: cems, remote }); game.hunters = hunters;`. В кадре после `game.update(dt, t)` — `hunters.update(dt)`. Гости: в `others` передавать `rid: r.id, device: r.device, stats: { kills: r.kills, friends: r.friends }, costume: r.costume || undefined, score: r.score`. В `window.__app` добавить `hunters`. В `console.log` при старте добавить число кладбищ с узлами.

- [ ] **Step 6: Метка направления**

`index.html`: `<div id="hmark" hidden>🪦</div>`. В цикле пузырей: `const h = hunters.nearest()`; если есть и его проекция вне экрана — показать `#hmark` на краю экрана в направлении охотника (отступ 24 px), класс `hot` при `d < PURSUIT.nearWarn`; клик по метке — `flyTo(h.a.x, h.a.z)`. Если охотник в кадре — метку спрятать (его видно). Проекция та же, что в `drawBubbles`.

- [ ] **Step 7: Карточка охотника**

В `showCard`/`cardHtml` для агента с `def.hunter`: строка «охотник · идёт к тебе · 👀 убивать» или «🤝 дружить»; для `def.ghoul` вместо «гость из сети» — «упырь».

- [ ] **Step 8: Проверка (без базы, упыри)**

```js
const h = __app.hunters; h.setHeat(45); // уровень 2, индикатор 🪦🪦···
const u = h.spawn(); u.a.bio, u.cem.name; // упырь на кладбище, пузырь «вылез», метка на краю
for (let i = 0; i < 600; i++) { __app.sim.update(0.1); __app.game.update(0.1, i * 0.1); h.update(0.1); } // идёт к игроку, перестраивает путь
__app.game.debugRollFoe = 2; __app.game.debugRoll = 19; // дойдёт → дуэль → 'skull'/'heart', упырь уходит и исчезает
h.setHeat(30); __app.game.visit(__app.venues.find(v => v.node >= 0)); h.heat; // 0, охотники дальше 200 м уходят
```
Ожидание: при снятом выделении (`game.select(false)`) новых не выходит, старые уходят через 60 с; ошибок нет.

- [ ] **Step 9: Коммит**

```bash
git add src/hunters.js src/sim.js src/main.js index.html style.css
git commit -m "Охотники с кладбищ: шкала угрозы, преследование, упыри без базы, метка и индикатор"
```

---

### Task 6: Supabase: колонки, костюм, доска и README

**Files:**
- Modify: `src/store.js` (`upsert`, `others`, `top`, новые `logEncounter`, `raids`)
- Modify: `src/main.js` (`boardRow`, локальные строки доски)
- Modify: `README.md` (раздел «База», раздел «Игра»)

**Interfaces:**
- Produces:
  - `Remote.upsert(def, game)` пишет строку `{ id, device, name, gender, age, job, arch, seed, costume: def.costume ?? null, hp, kills, friends: число записей friend в журнале, visits, deaths, tarot, coins, score: scoreOf(game), wins, losses, hearts: game.maxHp, tail: game.tail.length, updated_at }`; полей `x`, `z` нет.
  - `Remote.others(limit)` выбирает дополнительно `device, costume, score`.
  - `Remote.top(limit)` выбирает дополнительно `hearts, tail, wins, losses`.
  - `Remote.logEncounter(row): Promise` — `POST encounters` с `Prefer: return=minimal`; `row = { hunter, hunter_device, hunter_name, victim, victim_device, victim_name, outcome, rolls, level, place, at }`.
  - `Remote.raids(sinceIso: string, limit = 50): Promise<Array | null>` — `GET encounters?or=(hunter_device.eq.ME,victim_device.eq.ME)&at=gt.SINCE&order=at.desc&limit=N` (значение `ME` через `encodeURIComponent`).
  - Строка доски: после счёта `<span class="st">❤ ${r.hearts ?? '?'} · 💚 ${r.tail ?? 0}</span>`.

- [ ] **Step 1: `store.js`**

По Interfaces. `scoreOf` импортируется из `rules.js` (реэкспорт из Task 1 остаётся).

- [ ] **Step 2: Доска в `main.js`**

`boardRow` и локальные строки (`localRows`) читают `score`, `maxHp` → `hearts`, `tail.length` → `tail`; подсказка `SCORE_HINT` = «счёт: победа +2, поражение −1, аркана +5, новое заведение +1».

- [ ] **Step 3: README**

Раздел «База»: в `create table skeletons` убрать `x int, z int`, добавить `costume jsonb, wins int default 0, losses int default 0, hearts int default 3, tail int default 0`; блок `alter table skeletons add column if not exists …` для этих колонок; новая таблица:
```sql
create table encounters (
  id bigserial primary key,
  hunter text, hunter_device text, hunter_name text,
  victim text, victim_device text, victim_name text,
  outcome text not null, rolls int[], level int, place text,
  at timestamptz default now()
);
alter table encounters enable row level security;
create policy "read all" on encounters for select using (true);
create policy "insert any" on encounters for insert with check (true);
```
Раздел «Игра»: абзацы про стак, угрозу, охотников, дуэль, журнал и счёт, кратко, по спеке.

- [ ] **Step 4: Проверка**

`node --test tests/` → pass; в браузере без базы доска показывает `★ · ❤ · 💚` для своих скелетов.

- [ ] **Step 5: Коммит**

```bash
git add src/store.js src/main.js README.md
git commit -m "Supabase: костюм, стак и счётчики в skeletons, таблица encounters, доска со стаком"
```

---

### Task 7: Петля набегов через базу

**Files:**
- Modify: `src/hunters.js` (`finish` пишет `encounters`)
- Modify: `src/main.js` (чтение набегов при старте, уведомление)

**Interfaces:**
- Consumes: `Remote.logEncounter`, `Remote.raids` (Task 6), `Game.log` (Task 3), `local.get/set` (`store.js`).
- Produces:
  - Запись в `encounters` при `finish(h, outcome)` только если `h.owner`: `{ hunter: owner.id, hunter_device: owner.device, hunter_name: owner.name, victim: deviceId() + ':' + player.def.seed, victim_device: deviceId(), victim_name: player.def.name, outcome, rolls: [foe, bonus, me + tailBonus] или null для 'lost', level, place: sim.streetOf(player) }`.
  - При старте, если есть `remote`: `raids(local.get('raids.seen', '1970-01-01T00:00:00Z'))`; для строк с `hunter_device === deviceId()` найти `def` в `mine` по `deviceId() + ':' + def.seed === row.hunter` и `logPush(def.game ||= newProgress(), { kind: outcome in ('bit','killed') ? 'raid_bit' : outcome in ('skull','heart') ? 'raid_beaten' : 'raid_lost', name: row.victim_name, place: row.place, rolls: row.rolls, level: row.level, at: row.at })`; строки, где я жертва, пропустить (они уже в журнале с момента дуэли). `saveMine()`, `local.set('raids.seen', new Date().toISOString())`, при `n > 0` пузырь над игроком «📜 пока тебя не было: N набегов» (или «1 набег»), `renderLog()`.

- [ ] **Step 1: Реализовать по Interfaces**

- [ ] **Step 2: Проверка**

Без базы: ничего не вызывается, ошибок нет. С базой (когда появится `config.js`): два браузера или два профиля с разными `device`; в первом создать скелета, во втором дождаться гостя‑охотника, выиграть; в первом перезагрузить — пузырь «пока тебя не было: 1 набег» и запись `raid_beaten` в журнале.

- [ ] **Step 3: Коммит**

```bash
git add src/hunters.js src/main.js
git commit -m "Набеги: запись стычек в encounters и доклад хозяину при входе"
```

---

### Task 8: Журнал в интерфейсе

**Files:**
- Modify: `src/main.js` (`renderLog`)
- Modify: `index.html` (контейнер `#journal` там, где новый UI держит профиль скелета; если профиля ещё нет — внутри карточки своего скелета под статистикой)
- Modify: `style.css` (`#journal .e`, `.e.boss`, `.e.bad`)

**Interfaces:**
- Consumes: `game.g.log`, `showCard`, `sim.agents` (поиск по `uid`).
- Produces: `renderLog()` — последние 50 записей `game.g.log` в `#journal`, каждая строка: эмодзи по виду (`kill 💀, friend 💚, fail 💢, spawn 🪦, bit 🩸, win 👑, lost 🌫, raid_bit 🩸, raid_beaten 👑, raid_lost 🌫, tarot 🃏, visit 🎃, buy 🛍, death ☠`), текст по шаблонам ниже, время `HH:MM`; клик по записи с `uid` — `showCard` агента, если он есть в городе. `game.o.onLog = renderLog`.

Шаблоны текста (вид → строка): `kill` «убил {name}, d20 {roll}»; `friend` «подружился с {name}» + (`inTail ? '' : ' · машет из толпы'`); `fail` «провалил {action === 'kill' ? 'гадость' : 'сладость'} с {name}, d20 {roll}»; `spawn` «с {cem} вылез {name}»; `bit` «{name} укусил, {foe}+{bonus} против {roll}»; `win` «побил {name}, {boss ? 'босс‑' : ''}{intent === 'kill' ? 'череп' : 'сердечко'}, {foe}+{bonus} против {roll}»; `lost` «{name} потерял след»; `raid_bit` «твой скелет укусил {name} на {place}»; `raid_beaten` «{name} побил твоего скелета на {place}»; `raid_lost` «твой скелет потерял {name}»; `tarot` «аркана {name}»; `visit` «заведение {name}»; `buy` «купил {item}»; `death` «рассыпался».

- [ ] **Step 1: Реализовать `renderLog` и контейнер**

- [ ] **Step 2: Проверка**

После действий из задач 3–5 журнал показывает записи сверху вниз по времени, клик по «убил …» открывает карточку призрака.

- [ ] **Step 3: Коммит**

```bash
git add src/main.js index.html style.css
git commit -m "Журнал персонажа: лента боёв, набегов и находок"
```

---

## Проверка в браузере перед релизом (локальная сессия)

1. `node --test tests/` зелёный.
2. Свежий браузер без `localStorage`: создать скелета, `★ 0`, `❤ 3/3`, `💚 0/10`, `🪦 ·····`.
3. Старый прогресс: вставить в `localStorage` запись v1 с 13 друзьями и 8 черепами, перезагрузить: счёт `69`, хвост 10, журнал 21 запись.
4. Гадость с `debugRoll = 20` → `❤ 4/4`, `★ 2`; сладость ×10 → хвост 10, одиннадцатая «машет из толпы».
5. `hunters.setHeat(100)` → `🪦🪦🪦🪦🪦`, через паузу пять упырей; дуэль с `debugRollFoe = 20, debugRoll = 1` съедает две позиции; с полным хвостом подпись «ты +2».
6. Посещение бара при угрозе 60 → 0, далёкие уходят, ближний продолжает; повторное посещение через минуту не сбрасывает.
7. Смерть от укуса: хвост разбежался, `maxHp −2`, угроза 0, охотники ушли, запись `death`.
8. Снять выделение: новых нет, старые уходят через 60 с.
9. Консоль без ошибок на всём протяжении, `perf()` без заметной просадки с пятью охотниками.
10. С базой (если `config.js` заполнен к релизу): таблицы созданы по README, гость приходит в своём костюме, после победы над ним во втором профиле появляется запись `raid_beaten`.
