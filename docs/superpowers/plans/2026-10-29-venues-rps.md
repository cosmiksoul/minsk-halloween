# Заведения с хозяином, щиты, цена смерти и правки охотников: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести охотников до редакции 3 спеки (цена смерти и пермасмерть, бессрочные щиты, охотники за кадром, одно поле модалки) и сделать заведения ставкой: игра с хозяином в камень‑ножницы‑бумагу за монеты по уровню розыска с бонусом, сбросом розыска и дебаффами.

**Architecture:** Все числа и чистые правила по‑прежнему в `src/rules.js` с тестами. Хозяева заведений в новом `src/hosts.js` (детерминированная биография от названия и адреса). Игра с хозяином, щиты, дебаффы, смерть и единое поле `game.modal` в `game.js`; охотники в `hunters.js` получают скорость за кадром, паузу спада, разные кладбища, ожидание без управления и лишнего охотника; `sim.js` получает прямой подход вне графа и множитель скорости игрока. Пермасмерть проходит через `store.js` (колонка `dead`) и списки в `main.js`.

**Tech Stack:** ES‑модули без сборки, three.js, Node 24 для тестов (`node --test tests/*.test.mjs`), Supabase через PostgREST.

**Spec:** `docs/superpowers/specs/2026-10-29-venues-rps-design.md` (редакция 2) и `docs/superpowers/specs/2026-10-29-async-hunters-design.md` (редакция 3, раздел «Редакция 3: что изменилось относительно PR #6»).

## Как читать этот план

- Код на момент написания: PR #6 (ветка `claude/minsk-skeleton-game-logic-137cbh`, коммит `092c374`) поверх `main` после PR #5. Если PR #6 ещё не влит, работать в его ветке или в ветке от неё.
- Имена из PR #6, на которые опирается план: `rules.js` (`HEAT, LEVELS, PURSUIT, CAPS, POINTS, newProgress, migrate, statsOf, eatStack, growHearts, duel, pickCemetery, canReset`), `game.js` (`Game.modal` нет, есть проверки `$('shop').hidden` и т. п.; `visit, buy, damage, eat, die, respawn, duel, roll, openDialog/closeDialog, openShop/renderShop, onArrive, inReach, renderHUD, threatHtml, profileHtml, log, points, save`), `hunters.js` (`Hunters.update/step/spawn/finish/leave/record/done/gain/resetAtVenue/reset/onLoad/setHeat`, поля `h.state/level/bonus/cem/owner/stubborn/rolls`), `sim.js` (`drive, updatePlayer, moveTo, teleport, stop, say, ghostify, recostume, spawnCustom, unsetPlayer, setAuto`), `store.js` (`upsert, others, top, logEncounter, raids`), `main.js` (`takeControl, pickPlayer, renderMine, boardRow, renderBoard, logText, LOG_ICON, renderLog, showVenue, showShopPopup, showCard, renderProfile`).
- Задачи 1–4 правят охотников и бой, задача 5 добавляет заведения, задача 6 пермасмерть в интерфейсе и базе. После задачи 4 игра выпускаема (новые правила без игры с хозяином, сброс розыска временно недоступен, поэтому задачи 4 и 5 выпускать вместе). Коммит на задачу.
- Проверку в браузере делает локальная сессия по чек‑листу в конце. Облачная сессия обязана держать `node --test tests/*.test.mjs` зелёным и проверять загрузку страницы без ошибок там, где это возможно.
- Все пользовательские строки на русском, коротко, без точки в конце, эмодзи в начале.

## Global Constraints

- Никакой сборки и зависимостей; `rules.js` без импортов и DOM; `hosts.js` импортирует только `rules.js` и `bio.js`.
- Капы: сердец 10, хвост 10, начальный максимум 3; щитов 3.
- Очки: победа +2, поражение −1, аркана +5 один раз, первое посещение заведения +1 по множеству `seenVenues`, остальное 0; счёт не ниже нуля.
- Угроза 0..100, уровень `min(5, floor(heat / 20))`; прирост: череп +15, друг +8, аркана +10, охотник побеждён +12; «+1 за минуту» убран; спад −1 за 20 с после 30 с без прироста, только под управлением и только без живых охотников.
- Таблица уровней не меняется (охотников · дистанция · скорость вблизи · пауза · бонус): 1: 1 · 2500 · 0.85 · 90 · 0; 2: 2 · 2000 · 0.95 · 75 · 0; 3: 3 · 1600 · 1.05 · 60 · +1; 4: 4 · 1200 · 1.15 · 45 · +2; 5: 5 · 900 · 1.25 · 30 · +3. Дальше 400 м от игрока скорость охотника ×4 от базовой скорости игрока.
- Ставка: `max(1, уровень)` монет в баре, вдвое в магазине. Сброс розыска: бар выигрыш −60, проигрыш −20; магазин выигрыш в ноль, проигрыш −60. Откат на заведение 60 с. Плашка хозяина гаснет через 10 с. Любимый жест 40%. Три ничьих подряд: партия отменяется без ставки.
- Дебаффы: «штормит» 60 с, скорость ×0,65 отдельным множителем; «засветился» 90 с, лишний охотник с половины дистанции сверх лимита с +1 к кубику, пока активен.
- Смерть: монеты `floor(coins / 2)`; при `coins === 0` пермасмерть; щиты смерть переживают.
- Дуэль закрывает `ask`, `host`, `shop`; ждёт при `rps`, `dice`, `deck`, `tarot`, `share`.
- В `encounters` только исходы дуэлей: `bit`, `killed`, `rip`, `skull`, `heart`.
- Коммиты с трейлерами из указаний сессии, сообщения на русском.

## Review Focus

- Прогресс v2 из PR #6 без `friendsTotal`, `seenVenues`, `shields`, `hosts` должен дополниться на месте, не потеряв счёт и хвост; `friendsTotal` считается из журнала один раз. Тест в задаче 1 (`migrate` на v2 без новых полей).
- Смерть с нулём монет внутри дуэли: `duel` после `eat` не должна трогать `this.player` (он уже `null`) и должна вернуть `rip`; охотник пишет `rip` в базу. Шаг проверки в задаче 3.
- Игрок отпустил управление, когда охотник в 50 м: охотник замирает, через 5 минут уходит; при возврате управления продолжает без телепортов. Шаг проверки в задаче 4.
- Магазин: охотник дошёл при открытом меню покупок; меню закрывается, дуэль идёт, после дуэли меню не открывается само. Шаг проверки в задаче 5.
- Ставка больше монет на уровне 5 с одной монетой: плашки нет, пузырь «ставка 5 🪙, не хватает», магазин открывает меню сразу. Шаг проверки в задаче 5.

---

### Task 1: `rules.js`: правила редакции 3 и заведений, тесты

**Files:**
- Modify: `src/rules.js`
- Modify: `tests/rules.test.mjs`

**Interfaces:**
- Produces (всё `export`):
  - `HEAT = { kill: 15, friend: 8, tarot: 10, raidWin: 12, decayPer: 20, idleAfter: 30, max: 100 }` (без `minute` и `resetCooldown`).
  - `PURSUIT = { repathEvery: 25, repathDist: 150, nearWarn: 300, nearSay: 80, seenDist: 200, farFactor: 1.5, farAfter: 90, uncontrolledAfter: 60, waitNear: 300, leaveAfter: 60, cemNodeR: 300, offscreen: 400, offscreenSpeed: 4, direct: 150, reach: 2, spread: 2 }`.
  - `RPS = { favBias: 0.4, maxTies: 3, cooldown: 60, promptSec: 10, shieldMax: 3, tipsy: { speed: 0.65, sec: 60 }, seen: { sec: 90, bonus: 1 }, reset: { bar: [60, 20], shop: [100, 60] } }`.
  - `THROWS = ['rock', 'scissors', 'paper']`, `THROW_ICON = { rock: '🪨', scissors: '✂️', paper: '📄' }`, `THROW_NAME = { rock: 'камень', scissors: 'ножницы', paper: 'бумагу' }` (винительный падеж для «любит камень»).
  - `rpsBeats(a, b): boolean` — камень бьёт ножницы, ножницы бумагу, бумага камень.
  - `hostThrow(fav, rng): string` — `fav` при `rng() < RPS.favBias`, иначе один из двух остальных по второму `rng()`.
  - `hostSeed(kind: 'bar' | 'shop', text: string): number` — детерминированный 32‑битный хэш строки `kind + '|' + text` (FNV‑1a), всегда положительный.
  - `stakeOf(level, kind): number` — `max(1, level) * (kind === 'shop' ? 2 : 1)`.
  - `resetAmount(kind, won): number` — `RPS.reset[kind][won ? 0 : 1]`.
  - `deathCoins(coins): { left: number, perma: boolean }` — `left = floor(coins / 2)`, `perma = coins <= 0`; мусор считается нулём.
  - `newProgress()` дополнительно `friendsTotal: 0, seenVenues: [], shields: 0, hosts: {}`; поле `resetAt` убрано.
  - `migrate(g)`: для v1 как раньше плюс `friendsTotal = friends.length`, `seenVenues` = уникальные `id` из `visits`, `shields = 0`, `hosts = {}`. Для v2 (в том числе из PR #6) дополняет недостающее: `friendsTotal` = число записей `friend` в журнале, если поля нет; `seenVenues` = уникальные `id` из `visits` без `auto`, если поля нет; `shields` и `hosts` из `newProgress()`; `resetAt` удаляется.
  - `statsOf(g).friends` для v2 = `friendsTotal`.
  - `pickCemetery(items, px, pz, level, used = [])` — как раньше, но кандидаты, которых нет в `used` (сравнение по объекту), предпочитаются: если среди них есть хоть один на расстоянии не больше `LEVELS[level].dist * PURSUIT.spread`, выбор идёт только среди них; иначе среди всех.
  - `canReset` удаляется.
  - Без изменений: `CAPS, POINTS, LEVELS, LOG_MAX, outcomeOf, levelOf, decayed, tailBonus, hunterBonus, duel, addPoints, growHearts, eatStack, logPush, scoreOf, intentOf`.

- [ ] **Step 1: Дописать падающие тесты в `tests/rules.test.mjs`**

Заменить тест `HEAT из спеки` и `canReset` на новые; добавить:

```js
import { RPS, THROWS, rpsBeats, hostThrow, hostSeed, stakeOf, resetAmount, deathCoins } from '../src/rules.js';
test('HEAT без минуты и кулдауна', () => { assert.deepEqual(HEAT, { kill: 15, friend: 8, tarot: 10, raidWin: 12, decayPer: 20, idleAfter: 30, max: 100 }); });
test('PURSUIT: за кадром и прямой подход', () => { assert.equal(PURSUIT.offscreen, 400); assert.equal(PURSUIT.offscreenSpeed, 4); assert.equal(PURSUIT.direct, 150); assert.equal(PURSUIT.reach, 2); assert.equal(PURSUIT.waitNear, 300); });
test('rpsBeats', () => { assert.equal(rpsBeats('rock', 'scissors'), true); assert.equal(rpsBeats('scissors', 'paper'), true); assert.equal(rpsBeats('paper', 'rock'), true); assert.equal(rpsBeats('rock', 'paper'), false); assert.equal(rpsBeats('rock', 'rock'), false); });
test('hostThrow: любимый с перевесом', () => { assert.equal(hostThrow('rock', () => 0.1), 'rock'); const other = hostThrow('rock', () => 0.9); assert.ok(other !== 'rock' && THROWS.includes(other)); });
test('hostSeed детерминирован и различает', () => { assert.equal(hostSeed('bar', 'Чердак|Зыбицкая 6'), hostSeed('bar', 'Чердак|Зыбицкая 6')); assert.notEqual(hostSeed('bar', 'Чердак|Зыбицкая 6'), hostSeed('shop', 'Чердак|Зыбицкая 6')); assert.ok(hostSeed('bar', '') > 0); });
test('stakeOf и resetAmount', () => { assert.equal(stakeOf(0, 'bar'), 1); assert.equal(stakeOf(3, 'bar'), 3); assert.equal(stakeOf(0, 'shop'), 2); assert.equal(stakeOf(5, 'shop'), 10); assert.equal(resetAmount('bar', true), 60); assert.equal(resetAmount('bar', false), 20); assert.equal(resetAmount('shop', true), 100); assert.equal(resetAmount('shop', false), 60); });
test('deathCoins: половина вниз, ноль — пермасмерть', () => { assert.deepEqual(deathCoins(7), { left: 3, perma: false }); assert.deepEqual(deathCoins(1), { left: 0, perma: false }); assert.deepEqual(deathCoins(0), { left: 0, perma: true }); assert.deepEqual(deathCoins(undefined), { left: 0, perma: true }); });
test('newProgress: новые поля', () => { const g = newProgress(); assert.equal(g.friendsTotal, 0); assert.deepEqual(g.seenVenues, []); assert.equal(g.shields, 0); assert.deepEqual(g.hosts, {}); assert.equal('resetAt' in g, false); });
test('migrate v1: friendsTotal и seenVenues', () => { const g = migrate({ skulls: [], friends: [{ uid: 1 }, { uid: 2 }], visits: [{ id: 5 }, { id: 5 }, { id: 7 }] }); assert.equal(g.friendsTotal, 2); assert.deepEqual(g.seenVenues, [5, 7]); assert.equal(g.shields, 0); });
test('migrate v2 из PR #6 дополняется на месте', () => { const g = { v: 2, score: 9, tail: [], log: [{ kind: 'friend' }, { kind: 'kill' }, { kind: 'friend' }], visits: [{ id: 3 }, { id: 4, auto: true }], tarot: [], resetAt: 5 }; const m = migrate(g); assert.equal(m, g); assert.equal(g.score, 9); assert.equal(g.friendsTotal, 2); assert.deepEqual(g.seenVenues, [3]); assert.equal(g.shields, 0); assert.deepEqual(g.hosts, {}); assert.equal('resetAt' in g, false); });
test('statsOf.friends из friendsTotal', () => { assert.equal(statsOf({ v: 2, friendsTotal: 4, log: [] }).friends, 4); });
test('pickCemetery: разные кладбища для одновременных охотников', () => {
  const a = { x: 0, z: 2400, node: 1 }, b = { x: 2300, z: 0, node: 2 }, c = { x: 0, z: 9000, node: 3 };
  assert.equal(pickCemetery([a, b, c], 0, 0, 1, [a]), b);
  assert.equal(pickCemetery([a, c], 0, 0, 1, [a]), a); // c дальше двух дистанций: берём занятое
  assert.equal(pickCemetery([a, b], 0, 0, 1), a);
});
```

- [ ] **Step 2: Запустить и убедиться, что падают**

Run: `node --test tests/*.test.mjs`
Expected: новые тесты FAIL (нет экспортов `RPS`, `rpsBeats` и т. д.), старые проходят.

- [ ] **Step 3: Реализовать по Interfaces в `src/rules.js`**

Удалить `canReset`, `HEAT.minute`, `HEAT.resetCooldown`, `resetAt` из `newProgress`.

- [ ] **Step 4: Прогнать тесты**

Run: `node --test tests/*.test.mjs`
Expected: `# fail 0`; число тестов 17 − 2 + 12 = 27.

- [ ] **Step 5: Коммит**

```bash
git add src/rules.js tests/rules.test.mjs
git commit -m "rules.js: ставка и сброс по уровню, цена смерти, щиты числом, вечные счётчики, разные кладбища"
```

---

### Task 2: `game.js`: одно поле `modal`, щиты числом, счётчики, бой без лишних сердец

**Files:**
- Modify: `src/game.js`
- Modify: `src/main.js` (места, где читаются `game.shields` и `$('…').hidden` для модалок; `openShare`)
- Modify: `style.css` (`.sh` без таймера)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `Game.modal: 'ask' | 'host' | 'rps' | 'dice' | 'shop' | 'deck' | 'tarot' | 'share' | null`. Единственная истина о том, что открыто. `Game.setModal(name | null)`: пишет поле и переключает `hidden` у соответствующего элемента (`ask, host, shop, deck, tarot, share`; для `dice` и `rps` элементами управляют `dice.js` и партия). `openDialog → setModal('ask')`, `closeDialog → setModal(null)` только если `modal === 'ask'`; `openShop → setModal('shop')`, `shClose → setModal(null)`; `openDeck/dClose`, `showTarot/closeTarot`, `openShare/shrClose` (в `main.js`) через `setModal`. `roll()`: `setModal('dice')` на время броска, `null` после. Обработчик Esc: `if (this.modal) { закрыть по имени; return; }`.
  - `Game.closeBlocking(): boolean` — если `modal` в (`ask`, `host`, `shop`): закрывает и возвращает `true`; если `null` — `true`; иначе `false`. `duel(h)` начинается только при `closeBlocking() && !busy && player.state !== 'dead'`; иначе `null`.
  - `g.shields: number`. `Game.shields` (массив) удаляется вместе с `SHIELD_SEC`, `SHIELD_MAX` (экспорт `SHIELD_MAX` оставить как алиас `RPS.shieldMax`, если на него ссылаются). `damage(n)`: `const used = min(n, g.shields); g.shields -= used; n -= used;` пузырь «🎃 щит принял» при `used`. `eat(n, by, tailOnly)`: то же перед `eatStack`; при `tailOnly` щиты не тратятся (побег друга при крит‑провале щит не блокирует).
  - `visit(v)`: без щитов и без `resetAtVenue`; `first = controlled && !g.seenVenues.includes(v.id)`; при `first` — `g.seenVenues.push(v.id)`, очки, журнал. Список `g.visits` остаётся для карточки.
  - `buy(kind)`: без `resetAtVenue`.
  - `resolve`: успех сладости — `g.friendsTotal++` независимо от `inTail`.
  - `duel`: победа игрока без `growHearts`; пузырь «👑💀 босс‑череп» / «👑💚 босс‑сердечко» без «❤ +1»; при крите по‑прежнему `heal(1)`.
  - `renderHUD`: тыквы по `g.shields` (`🎃` × n без таймера), счётчик заведений по `g.seenVenues.length`.
  - `Game.controlled` (getter): `!!(player && selected && player.state !== 'dead')`.

- [ ] **Step 1: `modal` и `setModal`**

Заменить все `$('x').hidden = …` и проверки `!$('x').hidden` в `game.js` и `main.js` на `setModal`/`modal`. `grep -n "hidden" src/game.js src/main.js` после правки не должен находить модалки `ask, shop, deck, tarot, share` (остаются `card`, `profile`, `mine`, `popup`, `drawer`, `menu`, `hmark`, `loading` — это не модалки игры).

- [ ] **Step 2: Щиты, счётчики, бой**

По Interfaces. В `setPlayer` и `clearPlayer` убрать `this.shields = []`. В `respawn` щиты не трогать.

- [ ] **Step 3: Проверка**

`node --test tests/*.test.mjs` зелёный. В браузере:
```js
const g = __app.game; g.g.shields = 2; g.renderHUD(); // две тыквы без цифр
g.damage(1); g.g.shields; // 1, здоровье целое, пузырь «щит принял»
g.setModal('shop'); g.modal; g.closeBlocking(); g.modal; // 'shop' → true, null, меню скрыто
g.setModal('deck'); g.closeBlocking(); // false, колода открыта
```
Дуэль при победе: ❤ максимум не растёт, 🪙 +4, ★ +2.

- [ ] **Step 4: Коммит**

```bash
git add src/game.js src/main.js style.css
git commit -m "Одно поле modal, щиты числом, вечные счётчики, босс без лишнего сердца"
```

---

### Task 3: Смерть за половину монет и пермасмерть

**Files:**
- Modify: `src/game.js` (`die`, `perish`, `duel`, `renderHUD`)
- Modify: `src/sim.js` (ничего нового: `ghostify` уже делает вечного призрака)
- Modify: `src/main.js` (`pickPlayer`, `takeControl`, `renderMine`, `boardRow`, `localRows`, `showCard`/`renderProfile`, загрузка своих и чужих, `logText`, `LOG_ICON`, набеги)
- Modify: `src/store.js` (`upsert`, `others`, `top` с `dead`)
- Modify: `src/hunters.js` (исход `rip`)
- Modify: `index.html`, `style.css` (кнопки в HUD после упокоения, ☠ в списках)
- Modify: `README.md` (раздел «База»: `alter table skeletons add column if not exists dead boolean default false;` и колонка в `create table`)

**Interfaces:**
- Consumes: `deathCoins` (Task 1), `Game.controlled`, `setModal` (Task 2), `sim.ghostify`, `sim.unsetPlayer`.
- Produces:
  - `Game.die()`: `const { left, perma } = deathCoins(g.coins); const lost = g.coins − left; g.coins = left;` если `perma` — `this.perish()` и выход; иначе как в PR #6 (хвост, `maxHp −2`, `deaths++`, `log('death', { coinsLost: lost })`, `hunters.reset()`), пузырь «☠ −N 🪙» через 1200 мс, если `lost > 0`.
  - `Game.perish()`: `g.deaths++`; хвост разбегается; `log('rip', {})`; `hunters.reset()`; `setModal(null)`; `dropPending()`; `p.def.dead = true; p.def.diedAt = new Date().toISOString(); p.def.diedStreet = sim.streetOf(p); p.def.player = false`; `sim.unsetPlayer(p); sim.ghostify(p)`; `this.save()` (до обнуления `player`, чтобы `upsert` ушёл с `dead: true`); `this.player = null; this.selected = false;` `this.o.onPerish && this.o.onPerish(p)`; `renderHUD()`.
  - `Game.duel`: после `eat` — `if (this.player !== me) return me.def.dead ? 'rip' : 'killed';` до `save/renderHUD/showCard`; обычная смерть внутри дуэли по‑прежнему `killed`.
  - `renderHUD` без игрока, но с `this.lastPerished` (имя): «☠ {имя} упокоен навсегда» и кнопки `hudPick` («взять другого», открывает окно своих скелетов) и `hudNew` («создать нового»); `lastPerished` сбрасывается в `setPlayer`.
  - `main.js`: `pickPlayer` и клики «играть» игнорируют `def.dead`; `takeControl(a)` возвращается, если `a.def.dead`; при загрузке своих и чужих скелетов `def.dead` → сразу `sim.ghostify(a)` после `spawnCustom`; `renderMine`: строка с ☠, без кнопки «играть», с датой `diedAt` (`fmtAt`); карточка и профиль: «упокоен навсегда у {diedStreet}, {дата}» вместо статуса; `boardRow(r)`: `r.dead ? '☠ упокоен' : '❤ … · 💚 …'`; `localRows` берут `dead: !!d.dead`; `o.onPerish = () => { renderMine(); renderHUD; }`.
  - `store.js`: `upsert` пишет `dead: !!def.dead`; `others` и `top` выбирают `dead`; охотники не берут `def.dead` (они и так `ghost`).
  - `hunters.js`: `record(h, outcome)` принимает `rip`; `main.js` набеги: `rip` → `kind: 'raid_bit'` с `outcome: 'rip'`, текст «твой скелет упокоил {name} навсегда».
  - Журнал: `LOG_ICON.rip = '☠'`, текст `rip` → «упокоен навсегда»; `death` с `coinsLost` → «рассыпался, −N 🪙».

- [ ] **Step 1: Реализовать по Interfaces**

- [ ] **Step 2: README и SQL**

В «База» добавить `dead boolean default false` в `create table skeletons` и строку в блок `alter table … add column if not exists`. Локальная сессия выполнит `alter` в живом проекте.

- [ ] **Step 3: Проверка**

```js
const g = __app.game; g.g.coins = 7; g.g.hp = 1; g.damage(1); // обычная смерть: 🪙 3, ☠ +1, запись death с coinsLost 4, респаун
g.g.coins = 0; g.g.hp = 1; g.damage(1); // пермасмерть: скелет призрак, g.player === null, HUD «упокоен навсегда» с двумя кнопками
__app.mine().find(d => d.dead); // dead: true, diedAt, diedStreet
```
Перезагрузка: упокоенный стоит в городе призраком, в окне своих скелетов ☠ без «играть», `pickPlayer` его не берёт. С базой: строка с `dead = true`, на доске ☠.

- [ ] **Step 4: Коммит**

```bash
git add src/game.js src/main.js src/store.js src/hunters.js index.html style.css README.md
git commit -m "Смерть за половину монет, пермасмерть без монет: вечный призрак, ☠ в списках и базе"
```

---

### Task 4: Охотники редакции 3

**Files:**
- Modify: `src/hunters.js`
- Modify: `src/sim.js` (`approach`, множитель скорости игрока)
- Modify: `src/game.js` (`inReach(npc, mult = 0.8)`, `speedMul`)

**Interfaces:**
- Consumes: Task 1 (`PURSUIT`, `pickCemetery(items, px, pz, level, used)`, без `HEAT.minute`), Task 2 (`closeBlocking`, `controlled`).
- Produces:
  - `Sim.approach(a, x, z)`: `a.state = 'approach'; a.ax = x; a.az = z; a.path = null`. В `updatePlayer` ветка `approach`: шаг по прямой на `a.speed * dt` к `(ax, az)`, `face` по направлению, `place` не вызывается (позиция вне графа), по прибытии (`< 0.5 м`) `state = 'idle'`. `moveTo` для агента в `approach` или после него начинает с `graph.nearest(a.x, a.z, 140)`: `teleport` на этот узел перед поиском пути, если `a.from === a.to` и позиция дальше 3 м от узла.
  - `Sim.updatePlayer`: `a.t += a.speed * (a.speedMul || 1) * dt / a.len`. `Game.update` каждый кадр ставит `player.speedMul = this.speedMul` (поле появится в Task 5, до него `1`).
  - `Game.inReach(npc, mult = 0.8)`: радиус `max(5, H * mult)`; охотники зовут с `PURSUIT.reach`.
  - `Hunters`:
    - `gain(kind)`: только `kill, friend, tarot, raidWin`.
    - `update(dt)`: спад только при `ctrl && !active.length`; «минута» удалена; при смене уровня у всех активных `h.level = lvl` (при `lvl === 0` остаётся прежний), `h.bonus = hunterBonus(h.level) + (h.extra && game.seenActive() ? RPS.seen.bonus : 0)` пересчитывается каждый кадр; `lvl === 0` не отправляет никого (`stubborn` удалить).
    - Скорость каждый кадр в `step`: `const base = p.speed; a.speed = d > PURSUIT.offscreen ? base * PURSUIT.offscreenSpeed : base * LEVELS[max(1, h.level)].speed`.
    - `spawn(level, { half = false, extra = false } = {})`: `pickCemetery(cems, p.x, p.z, level, this.hunters.filter(h => h.state !== 'leave').map(h => h.cem))`; `h.spawnDist = hypot(cem − p)`; при `half` стартовый узел — `graph.nearest` от середины отрезка кладбище‑игрок с радиусом 600, иначе узел кладбища; `h.extra = extra`; лишний не учитывается в лимите `L.hunters` (`active.filter(h => !h.extra).length`).
    - `extra()`: `spawn(max(1, level), { half: true, extra: true })`, возвращает `Hunter | null`.
    - `onLoad(g)`: при уровне > 0 — `this.pendingHalf = LEVELS[lvl].hunters` и `lastSpawn = -1e9`; в `update` пока `pendingHalf > 0` пауза не ждётся и `spawn(lvl, { half: true })`, `pendingHalf--`.
    - Потеря следа: `d > h.spawnDist * PURSUIT.farFactor` дольше `farAfter`.
    - Без управления (`!ctrl`): если `d > PURSUIT.seenDist` — через `uncontrolledAfter` → `leave(h, 'lost')`; иначе `sim.stop(a)` один раз (`h.frozen = true`), через `PURSUIT.waitNear` → `leave(h, 'lost')`. При возврате управления `h.frozen = false; h.lostSince = 0; h.repathAt = -1e9`.
    - Прямой подход: если `a.state === 'idle'` и `d < PURSUIT.direct` и не в досягаемости — `sim.approach(a, p.x, p.z)` (повторять, когда игрок ушёл дальше 3 м от `(ax, az)`); дальше `direct` — `moveTo` как раньше.
    - Контакт: `game.inReach(a, PURSUIT.reach)`; дуэль через `game.duel(h)`; `null` → повтор через 0,5 с.
    - `resetAtVenue(amount)`: без проверки отката; `heat = max(0, heat − amount)`; `heatAt = sim.time`; активные дальше `seenDist` → `leave(h, 'lost')`; возвращает `true`, если угроза или охотники были.
    - `leave(h, 'lost')` пишет журнал, но не `record`; `record` зовётся только из `finish`.
    - Отладка: `__app.hunters.extra()`.

- [ ] **Step 1: `sim.js` и `game.js`**

`approach`, `speedMul`, `inReach(npc, mult)`. Проверка: `node --check src/sim.js src/game.js`.

- [ ] **Step 2: `hunters.js` по Interfaces**

- [ ] **Step 3: Проверка**

```js
const H = __app.hunters, g = __app.game, s = __app.sim, p = g.player;
H.setHeat(60); const a = H.spawn(), b = H.spawn(); [a.cem.name, b.cem.name]; // разные кладбища
a.a.speed / p.speed; // 4 (дальше 400 м)
for (let i = 0; i < 400; i++) { s.update(0.25); g.update(0.25, i); H.update(0.25); } g.g.heat; // 60: спад стоит, пока охотники живы
H.setHeat(100); a.bonus; // 3: живые получили бонус нового уровня
s.teleport(a.a, s.nodeOf(p)); a.a.x = p.x + 60; a.a.z = p.z; // в 60 м, путь по графу кончился
for (let i = 0; i < 40; i++) { s.update(0.25); H.update(0.25); } a.a.state; // 'approach' → дуэль по контакту
g.select(false); // ближний замирает (frozen), дальний уходит через 60 с; g.select(true) → продолжает
H.setHeat(0); H.list.filter(h => h.state !== 'leave').length; // не 0: уровень 0 никого не гонит
const e = H.extra(); e.extra; // лишний, с половины дистанции
```

- [ ] **Step 4: Коммит**

```bash
git add src/hunters.js src/sim.js src/game.js
git commit -m "Охотники: вчетверо быстрее за кадром, спад на паузе, разные кладбища, прямой подход, ожидание без управления"
```

---

### Task 5: Хозяева и игра в камень‑ножницы‑бумагу

**Files:**
- Create: `src/hosts.js`
- Modify: `src/game.js` (`offerGame`, `playRps`, `closeHost`, дебаффы, `onArrive`, `renderHUD`, `debugThrow`)
- Modify: `src/main.js` (строка хозяина в `showVenue` и `showShopPopup`, `logText`/`LOG_ICON` для `rps`, `clickGround` закрывает плашку)
- Modify: `src/sim.js` (покачивание спрайта при `a.tipsy`)
- Modify: `index.html` (`#host`), `style.css` (`#host`, полоска времени, `.chip`)

**Interfaces:**
- Consumes: Task 1 (`RPS, THROWS, THROW_ICON, THROW_NAME, rpsBeats, hostThrow, hostSeed, stakeOf, resetAmount`), Task 2 (`setModal`, `g.shields`), Task 4 (`resetAtVenue(amount)`, `extra()`, `speedMul`), `bio.js` (`makeRng, pickArchetype, makeBio`), `skeletons.js` (`CATALOG, SHOP_KINDS, randomItem, drawPortrait`), `sim.recostume`.
- Produces:
  - `hosts.js`: `hostOf(kind: 'bar' | 'shop', place): { key, seed, name, gender, age, arch, job, fav, costume }` — `key = kind + ':' + place.id`; `seed = hostSeed(kind, place.name + '|' + (place.addr || ''))`; `rng = makeRng(seed)`; `arch = pickArchetype(rng)`; `bio = makeBio(rng, arch)`; `job` по типу: `bar, pub, nightclub, biergarten` → «бармен»/«барменша», `cafe` → «хозяин кафе»/«хозяйка кафе», `restaurant` → «хозяин ресторана»/«хозяйка ресторана», `event` → «хозяин площадки»/«хозяйка площадки», магазин → «продавец»/«продавщица»; `fav = THROWS[seed % 3]`; `costume = randomCostume(rng, arch)` для портрета. Результат кэшируется по `key`.
  - `Game`: поля `tipsyUntil = 0`, `seenUntil = 0`, `speedMul = 1`, `lastPlay = new Map()`, `host = null` (текущая плашка: `{ place, kind, host, stake, ties, timer, onDone }`), `debugThrow = null`.
    - `seenActive(): boolean` — `sim.time < seenUntil`.
    - `offerGame(place, kind, onDone = null)`: если `!controlled || modal !== null` — `onDone?.()`, выход. `stake = stakeOf(hunters.level, kind)`. Если `g.coins < stake` — пузырь «🎲 ставка {stake} 🪙, не хватает», `onDone?.()`. Если `sim.time − (lastPlay.get(key) ?? -1e9) < RPS.cooldown` — пузырь «🎲 только что играли», `onDone?.()`. Иначе `setModal('host')`, заполнить `#host`: портрет (`drawPortrait(host.costume, …)`), имя, работа, «сыграем за {stake} 🪙?», подпись «любит {THROW_NAME[fav]}», если `g.hosts[key]`; кнопки `hostRock/hostScissors/hostPaper/hostNo`; таймер `RPS.promptSec` с полоской (`setInterval` 100 мс по настенным часам), по истечении `closeHost()`.
    - `closeHost()`: если `modal === 'host'` — `setModal(null)`, остановить таймер, `const d = host.onDone; host = null; d?.()`.
    - `playRps(mine)`: только при `modal === 'host'` или `'rps'`; `setModal('rps')` (элемент тот же `#host`, кнопки жестов заблокированы на время показа); `theirs = debugThrow ?? hostThrow(host.host.fav, Math.random)`; показать оба жеста крупно. Ничья: `ties++`; при `ties >= RPS.maxTies` — текст «хозяин машет рукой», через 1500 мс `closeHost()`; иначе текст «ничья, ещё раз», кнопки снова активны, `modal` остаётся `'rps'`. Иначе `won = rpsBeats(mine, theirs)`; `g.coins −= stake`; бонус: бар — `g.shields < RPS.shieldMax ? g.shields++ : g.coins += stake`; магазин — `kind = pick(Math.random, Object.keys(SHOP_KINDS).filter(k => k !== 'colors'))`, `id = randomItem(kind, p.rng)` до 5 раз, пока совпадает с надетым, `c = { ...p.costume, [kind]: id }`, `sim.recostume(p, c); p.def.costume = c`, `got = CATALOG[kind][id]`. Розыск: `hunters.resetAtVenue(resetAmount(kind, won))`. Проигрыш: `tipsyUntil = sim.time + RPS.tipsy.sec`; магазин ещё `if (!seenActive()) hunters.extra()` и затем `seenUntil = sim.time + RPS.seen.sec` (повтор продлевает срок, второго лишнего не зовёт). `g.hosts[key] = host.host.fav`; `lastPlay.set(key, sim.time)`; `log('rps', { place: place.name, kind, host: host.host.name, hostGender: host.host.gender, mine, theirs, won, bonus: kind === 'bar' ? (refunded ? 'refund' : 'shield') : got, reset: resetAmount(kind, won) })`; пузыри «🎃 +щит» / «🪙 ставка обратно» / «🛍 {got}», затем «🪦 розыск −3» или «🪦 чист»; через 1500 мс `closeHost()` (для магазина `onDone` откроет меню). `save(); renderHUD()`.
    - `onArrive`: бар — после `visit(v)` при `this.pendingVenue === v` → `offerGame(v, 'bar')`; магазин — при `this.pendingShop === sh` → `offerGame(sh, 'shop', () => this.openShop(sh))`, без явного визита магазин не открывается.
    - `clickGround`, `clickAgent`, `clickVenue`, `clickShop`: `closeHost()` первым делом (плашка не блокирует ввод).
    - `update`: `speedMul = sim.time < tipsyUntil ? RPS.tipsy.speed : 1`; `p.speedMul = speedMul`; `p.tipsy = speedMul < 1`; пузырь «ик» раз в 10 с при `tipsy`; `renderHUD` раз в секунду, пока активен хоть один дебафф.
    - `renderHUD`: чипы `<span class="chip">🍺 0:38</span>` и `<span class="chip">👀 1:12</span>` рядом с индикатором угрозы, пока активны.
    - `closeBlocking()` (Task 2) закрывает `host` через `closeHost()`; `duel` после партии (`rps`) ждёт.
  - `sim.js`: в `updatePlayer` при `a.tipsy` спрайт покачивается: `sprite.position.x += sin(time * 6) * 0.25` после `place` (как у призрака, если там есть аналог; иначе простое смещение).
  - `main.js`: в карточке бара и магазина строка «хозяин: {name} · любит {THROW_NAME[fav]}», когда `g.hosts[key]` есть; `LOG_ICON.rps = '🎲'`; текст `rps`: «сыграл с {host} в «{place}»: {🪨} против {✂️}, выиграл · +щит · розыск −3» (бонус: `+щит`, `ставка обратно`, `+{вещь}`; розыск: `−N` уровней = `reset / 20`, при 100 «чист»).
  - `index.html`: `<div id="host" hidden>` по образцу `#ask`: `hostPic`, `hostName`, `hostMeta`, `hostAsk`, `hostFav`, `hostBar` (полоска), кнопки `hostRock`, `hostScissors`, `hostPaper`, `hostNo`, область результата `hostRes` с двумя крупными жестами и текстом.

- [ ] **Step 1: `hosts.js`**

Проверка: `node -e "import('./src/hosts.js').then(m => console.log(m.hostOf('bar', { id: 1, name: 'Чердак', addr: 'Зыбицкая 6', type: 'bar' })))"` печатает хозяина с `fav` из `THROWS` и одинакового при повторном вызове.

- [ ] **Step 2: Разметка и стиль `#host`, чипы**

- [ ] **Step 3: `game.js`: плашка, партия, бонусы, дебаффы**

- [ ] **Step 4: `main.js` и `sim.js`**

- [ ] **Step 5: Проверка**

```js
const g = __app.game, H = __app.hunters, v = __app.venues.find(x => x.node >= 0);
H.setHeat(60); g.g.coins = 10; g.clickVenue(v); // дойти → плашка «сыграем за 3 🪙?» с полоской
g.debugThrow = 'scissors'; g.playRps('rock'); // выиграл: 🪙 7, 🎃 1, угроза 0 (60 − 60), запись rps, через 1,5 с плашка закрылась
g.clickVenue(v); // «только что играли», плашки нет
g.lastPlay.clear(); H.setHeat(60); g.clickVenue(v); g.debugThrow = 'paper'; g.playRps('rock'); // проиграл: 🪙 4, 🎃 2, угроза 40, чип 🍺 1:00, скелет шатается, p.speedMul 0.65
const sh = __app.shops.items.find(x => x.node >= 0); g.g.coins = 20; g.clickShop(sh); // плашка «за 6 🪙?»; «не сегодня» → меню покупок
g.clickShop(sh); g.debugThrow = 'paper'; g.playRps('rock'); // проиграл: вещь выдана, угроза −60, чипы 🍺 и 👀, лишний охотник вышел с половины дистанции с бонусом +1, затем меню покупок
g.g.coins = 1; H.setHeat(100); g.clickShop(sh); // «ставка 10 🪙, не хватает», меню сразу
g.clickShop(sh); // при открытом меню телепортировать охотника к игроку: меню закрылось, дуэль идёт, после дуэли меню не открылось
g.select(false); __app.sim.setAuto(g.player, true); // автопилот проходит через бар: плашки нет
```
Три ничьи подряд (`debugThrow` равен своему жесту): «хозяин машет рукой», монеты на месте.

- [ ] **Step 6: Коммит**

```bash
git add src/hosts.js src/game.js src/main.js src/sim.js index.html style.css
git commit -m "Заведения: игра с хозяином за ставку по уровню, бессрочные щиты, дебаффы, сброс розыска"
```

---

### Task 6: README и чистка

**Files:**
- Modify: `README.md` (раздел «Игра»: ставка, щиты, дебаффы, цена смерти и пермасмерть; раздел «База»: колонка `dead`)
- Modify: `src/game.js` (удалить мёртвый код старых щитов, `SHIELD_SEC`)

- [ ] **Step 1: README**

- [ ] **Step 2: `grep -rn "SHIELD_SEC\|canReset\|resetAt\b\|stubborn\|HEAT.minute" src/`** пустой.

- [ ] **Step 3: Коммит**

```bash
git add README.md src/game.js
git commit -m "README: заведения, щиты, цена смерти; чистка старых щитов"
```

---

## Проверка в браузере перед релизом (локальная сессия)

1. `node --test tests/*.test.mjs` зелёный, страница грузится без ошибок с базой и без.
2. Прогресс из PR #6 (v2 без новых полей) после входа: счёт и хвост те же, `friendsTotal` равен числу друзей в журнале, `shields` 0.
3. Бар: плашка только при клике по бару; случайный проход и автопилот плашку не показывают; ставка равна уровню; выигрыш даёт щит и −3 уровня, проигрыш −1 уровень и «штормит»; минута отката; при трёх щитах ставка возвращается.
4. Магазин: плашка, потом меню; проигрыш даёт вещь, «штормит» и «засветился» с лишним охотником +1; при открытом меню охотник начинает дуэль.
5. Щит принимает рану прохожего и укус охотника; крит‑провал тратит не больше двух; побег друга при крит‑провале идёт при любых щитах; щиты переживают смерть.
6. Охотники: за кадром вчетверо быстрее, вблизи по таблице; двое выходят с разных кладбищ; спад стоит при живом охотнике; уровень 0 не гонит вышедших; последние 150 м по прямой; без управления ближний ждёт, дальний уходит через минуту.
7. Смерть с монетами: половина теряется, щиты целы; смерть без монет: призрак навсегда, HUD с двумя кнопками, ☠ в списке своих и на доске, строка в базе с `dead`, охотник хозяина получает запись «упокоил навсегда».
8. Победа над охотником: максимум сердец не растёт.
9. Консоль без ошибок, `perf()` без заметной просадки с пятью охотниками и дебаффами.
