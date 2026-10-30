// Все числа и правила игры в одном месте: капы стака, очки, шкала угрозы, таблица уровней,
// дуэль с охотником, стак из сердец и хвоста, журнал, миграция старого прогресса, выбор кладбища,
// игра с хозяином заведения (камень-ножницы-бумага), ставка и сброс розыска, цена смерти.
// Без импортов и без DOM: модуль гоняется тестами на `node --test tests/`.

export const CAPS = { hearts: 10, tail: 10, baseHearts: 3 };
export const POINTS = { win: 2, loss: -1, tarot: 5, visit: 1 };
export const HEAT = { kill: 15, friend: 8, tarot: 10, raidWin: 12, decayPer: 20, idleAfter: 30, max: 100, boss: 10, road: 1 };
// индекс = уровень угрозы: сколько охотников сразу, с какой дистанции выходят, скорость от скорости игрока,
// пауза между появлениями в секундах и бонус к кубику охотника
export const LEVELS = [
  { hunters: 0, dist: 0, speed: 0, pause: 0, bonus: 0 },
  { hunters: 1, dist: 2500, speed: 0.85, pause: 90, bonus: 0 },
  { hunters: 2, dist: 2000, speed: 0.95, pause: 75, bonus: 0 },
  { hunters: 3, dist: 1600, speed: 1.05, pause: 60, bonus: 1 },
  { hunters: 4, dist: 1200, speed: 1.15, pause: 45, bonus: 2 },
  { hunters: 5, dist: 900, speed: 1.25, pause: 30, bonus: 3 },
];
// преследование: перестройка пути, пороги «близко», потеря следа и уход, ожидание без управления, радиус узла у кладбища,
// за кадром (дальше offscreen м) скорость ×offscreenSpeed, последние direct м по прямой, досягаемость в ростах, разброс кладбищ:
// свободное кладбище подходит не дальше spread дистанций уровня или spreadNear расстояний до ближайшего кладбища (метры и секунды)
export const PURSUIT = { repathEvery: 25, repathDist: 150, nearWarn: 300, nearSay: 80, seenDist: 200, farFactor: 1.5, farAfter: 90, uncontrolledAfter: 60, waitNear: 300, leaveAfter: 60, cemNodeR: 300, offscreen: 400, offscreenSpeed: 4, direct: 150, reach: 2, spread: 2, spreadNear: 1.5 };
// игра с хозяином заведения: перевес любимого жеста, ничьи подряд, откат на заведение, время плашки, кап щитов,
// дебаффы «штормит» и «засветился», сброс розыска [выигрыш, проигрыш] по типу заведения
export const RPS = { favBias: 0.4, maxTies: 3, cooldown: 60, promptSec: 10, shieldMax: 3, tipsy: { speed: 0.65, sec: 60 }, seen: { sec: 90, bonus: 1 }, reset: { bar: [60, 20], shop: [100, 60] } };
// срезки управляемого скелета: цель не дальше maxDist, по дорожкам в ratio раз дальше прямой, цель «на графе» ближе onPath,
// шаг проверки прямой, полуширина ленты реки, радиус возврата на ребро, вероятность реплики
export const CUT = { maxDist: 60, ratio: 2.5, onPath: 3, step: 2, riverHalf: 13, snapR: 140, say: 0.25 };
export const THROWS = ['rock', 'scissors', 'paper'];
export const THROW_ICON = { rock: '🪨', scissors: '✂️', paper: '📄' };
export const THROW_NAME = { rock: 'камень', scissors: 'ножницы', paper: 'бумагу' }; // винительный падеж: «любит камень»
export const LOG_MAX = 200;
// --- эндгейм: колода из рейтинга и рука боссов на час, покерные множители, жетоны, проезжая часть, квесты
export const CARD = { slots: 52, hand: 5, ringMin: 200, ringMax: 700, ringStep: 300, ringCap: 1600, spacing: 150, cooldown: 60, xpPerRank: 2, handBase: 20, bonus: { low: 0, mid: 1, high: 2, ace: 3 } };
const CARD_STATES = ['up', 'cool', 'down'];
export const HAND_MULT = { high: 1, pair: 2, twoPair: 3, three: 4, straight: 6, flush: 8, fullHouse: 10, four: 15, straightFlush: 30 };
export const TOKEN = { perHand: 1, price: 12, cap: 3 };
export const ROAD = { speed: 1.2, heatPer: 4, crowdCost: 4 };
// цепочка онбординга на устройство: по одному квесту на активность, виден только текущий
export const QUESTS = [
  { id: 'trick', title: 'первая гадость', hint: 'кликни по прохожему и выбери гадость', kind: 'kill' },
  { id: 'treat', title: 'первая сладость', hint: 'кликни по прохожему и выбери сладость', kind: 'friend' },
  { id: 'candy', title: 'конфета', hint: 'конфеты лежат на дорожках, подойди', kind: 'candy' },
  { id: 'coin', title: 'монетка', hint: 'монетки блестят у дорог', kind: 'coin' },
  { id: 'share', title: 'карточка', hint: 'открой профиль своего скелета и поделись карточкой', kind: 'share' },
  { id: 'ghost', title: 'призрак', hint: 'за шалости приходят призраки с кладбищ', kind: 'win' },
  { id: 'card', title: 'карта', hint: 'на карте стоят пять карт часа, бей слабую', kind: 'card' },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// исход обычного d20: 1 крит-провал, 2–7 провал, 8–19 успех, 20 крит
// место в рейтинге → карта: масти по четвертям ♠ ♥ ♦ ♣, старшинство сверху вниз (1 — туз пик, 13 — двойка пик, 14 — туз червей)
export function cardOfSlot(r) { return { rank: 14 - ((r - 1) % 13), suit: ['♠', '♥', '♦', '♣'][Math.floor((r - 1) / 13)] }; }
// час по Минску (UTC+3, без летнего времени): общий номер часа для всех и секунды до его конца
export function minskHour(ms) { return Math.floor((ms / 1000 + 3 * 3600) / 3600); }
export function hourLeft(ms) { return 3600 - ((Math.floor(ms / 1000) + 3 * 3600) % 3600); }
export function handSeed(hour, device, seed) { return hostSeed('hand', hour + '|' + device + '|' + seed); }
// mulberry32: детерминированный генератор от целого семени, без импортов
export function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// сдача: пять разных мест 1…52 в порядке вытягивания; ключ — час, устройство и скелет, поэтому перезагрузка руку не меняет
export function dealHand(hour, device, seed) {
  const rng = rngOf(handSeed(hour, device, seed)); const out = [];
  while (out.length < CARD.hand) { const r = 1 + Math.floor(rng() * CARD.slots); if (!out.includes(r)) out.push(r); }
  return out;
}
// колода → карты руки: место занято строкой рейтинга (не своей и не упокоенной) — копия того скелета, иначе упырь-картёжник
// с семенем от (час, место); имя упырю дорисовывает cards.js (makeBio живёт в bio.js)
export function cardsFromDeck(slots, rows, hour, device) {
  return slots.map(slot => {
    const { rank, suit } = cardOfSlot(slot); const row = Array.isArray(rows) ? rows[slot - 1] : null;
    if (row && row.device !== device && !row.dead) return { slot, rank, suit, owner: row.id, name: row.name, gender: row.gender, age: row.age, job: row.job, arch: row.arch, seed: row.seed, costume: row.costume, ghoul: false };
    return { slot, rank, suit, owner: null, ghoul: true, seed: hostSeed('ghoul', hour + '|' + slot), job: 'упырь с карточного стола' };
  });
}
// бонус босса к кубику и XP за победу по старшинству карты
export function bossBonus(rank) { const b = CARD.bonus; return rank >= 14 ? b.ace : rank >= 10 ? b.high : rank >= 6 ? b.mid : b.low; }
export function bossXp(rank) { return CARD.xpPerRank * rank; }
// квесты: бонус за закрытие — столько же, сколько дало само действие (гадость +2 → ещё +2), а за действие без XP (конфета, монета) — 5;
// виден только первый незакрытый квест
export function questBonus(xp) { const x = num(xp); return x > 0 ? x : 5; }
export function nextQuest(done) { return QUESTS.find(q => !done.includes(q.id)) || null; }
export function questFor(done, kind) { const q = nextQuest(done); return q && q.kind === kind ? q : null; }
// слоты живых скелетов на устройстве: не меньше одного и числа живых, не больше пяти
export function slotsOf(stored, alive) { return Math.min(5, Math.max(1, num(stored), num(alive))); }
// жетон спас-броска в магазине: цена и потолок на покупку (заработанные сверх потолка не пропадают)
export function canBuyToken(g) { return num(g.coins) >= TOKEN.price && num(g.tokens) < TOKEN.cap; }
export function buyToken(g) { if (!canBuyToken(g)) return false; g.coins = num(g.coins) - TOKEN.price; g.tokens = num(g.tokens) + 1; return true; }
// розыск на проезжей части: очко за каждые ROAD.heatPer секунд ходьбы, остаток переносится
export function roadHeat(acc, dt) { const a = num(acc) + num(dt); const points = Math.floor(a / ROAD.heatPer); return { acc: a - points * ROAD.heatPer, points }; }
export function outcomeOf(n) { return n <= 1 ? 'critfail' : n <= 7 ? 'fail' : n <= 19 ? 'success' : 'crit'; }
// срезать ли напрямик: цель близко и по дорожкам в ratio раз дальше (или маршрута нет вовсе); стоя на месте не срезаем
export function shouldCut(d, routeCost) { return d > 0 && d <= CUT.maxDist && (routeCost == null || routeCost >= CUT.ratio * d); }
export function levelOf(heat) { return clamp(Math.floor(num(heat) / 20), 0, 5); }
// спад угрозы за `seconds` секунд без прироста; мусор во времени (отрицательное, NaN) не меняет угрозу
export function decayed(heat, seconds) {
  const h = clamp(num(heat), 0, HEAT.max);
  if (typeof seconds !== 'number' || Number.isNaN(seconds) || seconds < 0) return h;
  return Math.max(0, h - seconds / HEAT.decayPer);
}
// камень бьёт ножницы, ножницы бумагу, бумага камень
export function rpsBeats(a, b) { return (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock'); }
// жест хозяина: любимый с перевесом favBias, иначе один из двух остальных
export function hostThrow(fav, rng) { if (rng() < RPS.favBias) return fav; const rest = THROWS.filter(t => t !== fav); return rest[rng() < 0.5 ? 0 : 1]; }
// детерминированное зерно хозяина от вида и названия с адресом: FNV-1a, 32 бита, всегда положительное
export function hostSeed(kind, text) {
  const s = kind + '|' + text; let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) || 1;
}
// ставка в монетах: уровень розыска, не меньше одной; в магазине вдвое
export function stakeOf(level, kind) { return Math.max(1, num(level)) * (kind === 'shop' ? 2 : 1); }
export function resetAmount(kind, won) { return (RPS.reset[kind] || RPS.reset.bar)[won ? 0 : 1]; }
// цена смерти: половина монет вниз; без монет — пермасмерть
export function deathCoins(coins) { const c = Math.max(0, Math.floor(num(coins))); return { left: Math.floor(c / 2), perma: c <= 0 }; }
export function tailBonus(tailLen) { return clamp(Math.floor(num(tailLen) / 5), 0, 2); }
export function hunterBonus(level) { return (LEVELS[clamp(num(level), 0, 5)] || LEVELS[0]).bonus; }
// встречный бросок: сравниваются суммы, больше выиграл; 20 у победителя или 1 у проигравшего — крит;
// eat — сколько позиций стака ест охотник (0 при победе игрока, 1 при победе охотника, 2 при крите)
export function duel(foe, foeBonus, me, meBonus) {
  const a = foe + (foeBonus || 0), b = me + (meBonus || 0);
  if (a === b) return { winner: 'tie', crit: false, eat: 0 };
  const winner = b > a ? 'me' : 'foe';
  const crit = (winner === 'me' ? me === 20 || foe === 1 : foe === 20 || me === 1);
  return { winner, crit, eat: winner === 'me' ? 0 : crit ? 2 : 1 };
}

// --- прогресс скелета (v2): стак, счёт, журнал, угроза
export function newProgress(cls = null) {
  const hp = CAPS.baseHearts + (classOf(cls)?.hp || 0); // танк стартует с лишним сердцем
  return { v: 2, hp, maxHp: hp, score: 0, wins: 0, losses: 0, tail: [], log: [], visits: [], tarot: [], coins: 0, tokens: 0, deaths: 0, kills: 0, friendsTotal: 0, seenVenues: [], shields: 0, hosts: {}, heat: 0, heatAt: 0, shared: null, hand: null, hands: 0, bestHand: null, chests: {} };
}
function oldScore(g) { return (g.skulls?.length ?? 0) * 3 + (g.friends?.length ?? 0) * 3 + (g.tarot?.length ?? 0) * 5 + (g.visits?.length ?? 0); }
// старый прогресс (массивы skulls/friends, кап 6 сердец) один раз превращается в v2: счёт по старой формуле,
// первые десять друзей в хвост, все черепа и друзья в журнал. Никто не теряет место в рейтинге
const uniqIds = visits => { const out = []; for (const v of visits) if (v && v.id != null && !out.includes(v.id)) out.push(v.id); return out; };
export function migrate(g) {
  if (g && g.v === 2) {
    // v2 (в том числе из PR #6) дополняем на месте: битые массивы, вечные счётчики, щиты числом, выученные жесты
    for (const k of ['log', 'tail', 'visits', 'tarot']) if (!Array.isArray(g[k])) g[k] = [];
    if (!Number.isFinite(g.friendsTotal)) g.friendsTotal = g.log.filter(e => e && e.kind === 'friend').length;
    if (!Array.isArray(g.seenVenues)) g.seenVenues = uniqIds(g.visits.filter(v => v && !v.auto));
    if (!Number.isFinite(g.shields)) g.shields = 0;
    if (!g.hosts || typeof g.hosts !== 'object') g.hosts = {};
    // рука часа: только объект с часом и ровно пятью картами, иначе сдадим заново; состояние и откат карт нормализуем (обрыв сохранения, другая сборка)
    if (!g.hand || typeof g.hand !== 'object' || !Number.isInteger(g.hand.hour) || !Array.isArray(g.hand.cards) || g.hand.cards.length !== CARD.hand || g.hand.cards.some(c => !c || typeof c !== 'object')) g.hand = null;
    else for (const c of g.hand.cards) { if (!CARD_STATES.includes(c.state)) c.state = 'up'; if (!Number.isFinite(c.coolUntil)) c.coolUntil = 0; }
    if (!Number.isFinite(g.hands)) g.hands = 0; if (g.bestHand === undefined) g.bestHand = null; // собранные руки
    if (!g.chests || typeof g.chests !== 'object' || Array.isArray(g.chests)) g.chests = {}; // сундуки: место → час Минска, когда открыт
    delete g.resetAt;
    return g;
  }
  const fresh = newProgress();
  if (!g || typeof g !== 'object') return fresh;
  const skulls = Array.isArray(g.skulls) ? g.skulls : [], friends = Array.isArray(g.friends) ? g.friends : [];
  for (const k of Object.keys(fresh)) if (g[k] === undefined) g[k] = fresh[k];
  g.v = 2; delete g.resetAt;
  g.friendsTotal = friends.length; g.seenVenues = uniqIds(Array.isArray(g.visits) ? g.visits : []); g.shields = 0; g.hosts = {};
  g.score = oldScore(g); g.wins = skulls.length + friends.length; g.losses = 0;
  g.tail = friends.slice(0, CAPS.tail).map(f => ({ ...f }));
  // в журнале новые сверху: старые массивы росли с конца, поэтому разворачиваем
  const log = [];
  skulls.forEach(s => log.push({ kind: 'kill', action: 'kill', ...s }));
  friends.forEach((f, i) => log.push({ kind: 'friend', action: 'friend', inTail: i < CAPS.tail, ...f }));
  g.log = log.reverse().concat(Array.isArray(g.log) ? g.log : []).slice(0, LOG_MAX);
  g.maxHp = clamp(Math.round(num(g.maxHp, CAPS.baseHearts)), CAPS.baseHearts, CAPS.hearts);
  g.hp = clamp(Math.round(num(g.hp, g.maxHp)), 1, g.maxHp);
  delete g.skulls; delete g.friends;
  return g;
}
// ночь Хэллоуина по Минску (UTC+3): 31.10 18:00 – 01.11 06:00, положительный XP удваивается
export const HALLOWEEN = { from: Date.UTC(2026, 9, 31, 15, 0), to: Date.UTC(2026, 10, 1, 3, 0), xpMul: 2 };
export function isHalloweenNight(now = Date.now()) { return now >= HALLOWEEN.from && now < HALLOWEEN.to; }
export function addPoints(g, n, now = Date.now()) { const k = n > 0 && isHalloweenNight(now) ? HALLOWEEN.xpMul : 1; g.score = Math.max(0, num(g.score) + n * k); return g.score; }

// --- сундуки у достопримечательностей: раз в час на место, открываются броском d20 от CHEST.roll; 20 — крит, 1 — мимик
export const CHEST = { coinsMin: 3, coinsMax: 6, tokenChance: 0.1, roll: 8 };
export function chestOutcome(n) { const r = num(n); return r <= 1 ? 'mimic' : r >= 20 ? 'crit' : r >= CHEST.roll ? 'open' : 'locked'; }
// содержимое: монеты coinsMin–coinsMax (крит вдвое), жетон с шансом tokenChance (крит всегда); запертый и мимик пусты
export function chestLoot(rng, outcome) {
  if (outcome !== 'open' && outcome !== 'crit') return { coins: 0, token: false };
  const coins = CHEST.coinsMin + Math.floor(rng() * (CHEST.coinsMax - CHEST.coinsMin + 1));
  return { coins: outcome === 'crit' ? coins * 2 : coins, token: outcome === 'crit' || rng() < CHEST.tokenChance };
}
// --- спринт управляемого: ×mul, пока есть выносливость (запас на dur с), восстанавливается за recharge с;
// выдохся до нуля — не бежит, пока не наберёт min
export const SPRINT = { mul: 1.6, dur: 4, recharge: 20, min: 0.15 };
export function sprintStep(st, dt, want, exhausted = false) {
  let s = clamp(num(st, 1), 0, 1); const d = Math.max(0, num(dt));
  if (exhausted && s >= SPRINT.min) exhausted = false;
  if (want && !exhausted && s > 0) { s = Math.max(0, s - d / SPRINT.dur); return { stamina: s, mul: SPRINT.mul, exhausted: s === 0 }; }
  return { stamina: Math.min(1, s + d / SPRINT.recharge), mul: 1, exhausted };
}
// --- скорость охотника от базовой скорости игрока: табличная по уровню до offscreen м, ×offscreenSpeed от 2×offscreen,
// между ними линейно — без скачка вчетверо на границе кадра
export function hunterSpeedFactor(d, level) {
  const near = LEVELS[clamp(level | 0, 1, LEVELS.length - 1)].speed, far = PURSUIT.offscreenSpeed;
  const k = clamp((num(d) - PURSUIT.offscreen) / PURSUIT.offscreen, 0, 1);
  return near + (far - near) * k;
}
// +1 к максимуму сердец (до капа) и, если healToo, +1 текущего; true, когда максимум вырос
export function growHearts(g, healToo = true) {
  const grew = g.maxHp < CAPS.hearts;
  g.maxHp = Math.min(CAPS.hearts, g.maxHp + 1);
  if (healToo) g.hp = Math.min(g.maxHp, g.hp + 1);
  return grew;
}
// охотник ест стак по одной позиции: сначала последний друг из хвоста, потом сердце (максимум не ниже трёх)
export function eatStack(g, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (g.tail.length > 0) out.push({ kind: 'friend', who: g.tail.pop() });
    else { g.maxHp = Math.max(CAPS.baseHearts, g.maxHp - 1); g.hp = Math.max(0, Math.min(g.hp - 1, g.maxHp)); out.push({ kind: 'heart' }); }
  }
  return out;
}
export function logPush(g, entry) {
  entry.at ||= new Date().toISOString();
  g.log.unshift(entry); if (g.log.length > LOG_MAX) g.log.length = LOG_MAX;
  return entry;
}
// счёт для доски: у v2 накопитель, у старого прогресса прежняя формула
export function scoreOf(g) { if (!g) return 0; return g.v === 2 ? num(g.score) : oldScore(g); }
// намерение охотника по привычкам хозяина: больше черепов — убивать, больше друзей — дружить, поровну — монетка
export function intentOf(kills, friends, rng) { return kills > friends ? 'kill' : friends > kills ? 'friend' : rng() < 0.5 ? 'kill' : 'friend'; }
// кладбище для появления: с проходимым узлом, не ближе половины дистанции уровня, ближе всех к самой дистанции
// used: кладбища уже вышедших охотников — свободные предпочитаются, пока хоть одно не дальше двух дистанций
export function pickCemetery(items, px, pz, level, used = []) {
  if (!level || !LEVELS[level]) return null;
  const want = LEVELS[level].dist;
  const all = (items || []).filter(c => c.node >= 0).map(c => ({ c, d: Math.hypot(c.x - px, c.z - pz) }));
  const dNear = all.reduce((m, x) => Math.min(m, x.d), Infinity); // до ближайшего кладбища: из центра все далеко, и разброс считаем от него
  const cand = all.filter(x => x.d >= want / 2);
  const free = cand.filter(x => !used.includes(x.c));
  const pool = free.some(x => x.d <= Math.max(want * PURSUIT.spread, dNear * PURSUIT.spreadNear)) ? free : cand;
  let best = null, bd = Infinity;
  for (const x of pool) { const s = Math.abs(x.d - want); if (s < bd) { bd = s; best = x.c; } }
  return best;
}
// сводка прогресса для карточек, списков и доски: понимает и старый формат до миграции
export function statsOf(g) {
  if (!g) return { score: 0, kills: 0, friends: 0, tarot: 0, visits: 0, hearts: CAPS.baseHearts, tail: 0, wins: 0, losses: 0, deaths: 0, hands: 0, bestHand: null };
  const v2 = g.v === 2, log = Array.isArray(g.log) ? g.log : [];
  return {
    score: scoreOf(g), kills: v2 ? num(g.kills) : (g.skulls?.length ?? 0), friends: v2 ? num(g.friendsTotal, log.filter(e => e.kind === 'friend').length) : (g.friends?.length ?? 0),
    tarot: g.tarot?.length ?? 0, visits: v2 && Array.isArray(g.seenVenues) ? g.seenVenues.length : (g.visits?.length ?? 0), hearts: num(g.maxHp, CAPS.baseHearts), tail: v2 ? (g.tail?.length ?? 0) : Math.min(CAPS.tail, g.friends?.length ?? 0),
    wins: num(g.wins), losses: num(g.losses), deaths: num(g.deaths), hands: num(g.hands), bestHand: g.bestHand || null,
  };
}

// магнит тапа: ближайший к точке экрана предмет в пределах допуска. Предмет — отрезок на экране (у скелета ноги→голова, у маркера точка)
// с шириной w: расстояние считается до оси минус половина ширины, так что попадание внутрь фигурки отрицательно и всегда выигрывает
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2)) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
export function magnetPick(tap, items, slop) {
  let best = null, bd = slop;
  for (const it of items) { const d = segDist(tap[0], tap[1], it.x1, it.y1, it.x2, it.y2) - (it.w || 0) / 2; if (d < bd) { bd = d; best = it; } }
  return best;
}

// классы своего скелета (выбор при создании, хранится в def.cls): танк — +1 сердце на старте, исследователь — быстрее (охотники считают от базовой скорости),
// воин — +1 к d20 в сладости/гадости и к своему кубику в дуэлях
export const CLASSES = {
  tank: { label: 'танк', hint: '+1 сердце на старте', hp: 1 },
  scout: { label: 'исследователь', hint: 'скорость +15 %', speed: 1.15 },
  warrior: { label: 'воин', hint: '+1 к d20 на успех и в дуэлях', die: 1 },
};
export function classOf(cls) { return CLASSES[cls] || null; }
export function classDie(cls) { return classOf(cls)?.die || 0; }
export function classSpeed(cls) { return classOf(cls)?.speed || 1; }
// исход d20 с бонусом класса: натуральные 1 и 20 остаются критами, иначе к броску прибавляется бонус (не выше 19 — крит бонусом не купить)
export function outcomeWith(n, bonus = 0) { const r = num(n); return r <= 1 || r >= 20 || !bonus ? outcomeOf(r) : outcomeOf(Math.min(19, r + num(bonus))); }
