// Все числа и правила игры в одном месте: капы стака, очки, шкала угрозы, таблица уровней,
// дуэль с охотником, стак из сердец и хвоста, журнал, миграция старого прогресса, выбор кладбища,
// игра с хозяином заведения (камень-ножницы-бумага), ставка и сброс розыска, цена смерти.
// Без импортов и без DOM: модуль гоняется тестами на `node --test tests/`.

export const CAPS = { hearts: 10, tail: 10, baseHearts: 3 };
export const POINTS = { win: 2, loss: -1, tarot: 5, visit: 1 };
export const HEAT = { kill: 15, friend: 8, tarot: 10, raidWin: 12, decayPer: 20, idleAfter: 30, max: 100 };
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
// за кадром (дальше offscreen м) скорость ×offscreenSpeed, последние direct м по прямой, досягаемость в ростах, разброс кладбищ (метры и секунды)
export const PURSUIT = { repathEvery: 25, repathDist: 150, nearWarn: 300, nearSay: 80, seenDist: 200, farFactor: 1.5, farAfter: 90, uncontrolledAfter: 60, waitNear: 300, leaveAfter: 60, cemNodeR: 300, offscreen: 400, offscreenSpeed: 4, direct: 150, reach: 2, spread: 2 };
// игра с хозяином заведения: перевес любимого жеста, ничьи подряд, откат на заведение, время плашки, кап щитов,
// дебаффы «штормит» и «засветился», сброс розыска [выигрыш, проигрыш] по типу заведения
export const RPS = { favBias: 0.4, maxTies: 3, cooldown: 60, promptSec: 10, shieldMax: 3, tipsy: { speed: 0.65, sec: 60 }, seen: { sec: 90, bonus: 1 }, reset: { bar: [60, 20], shop: [100, 60] } };
export const THROWS = ['rock', 'scissors', 'paper'];
export const THROW_ICON = { rock: '🪨', scissors: '✂️', paper: '📄' };
export const THROW_NAME = { rock: 'камень', scissors: 'ножницы', paper: 'бумагу' }; // винительный падеж: «любит камень»
export const LOG_MAX = 200;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// исход обычного d20: 1 крит-провал, 2–10 провал, 11–19 успех, 20 крит
export function outcomeOf(n) { return n <= 1 ? 'critfail' : n <= 10 ? 'fail' : n <= 19 ? 'success' : 'crit'; }
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
export function newProgress() {
  return { v: 2, hp: CAPS.baseHearts, maxHp: CAPS.baseHearts, score: 0, wins: 0, losses: 0, tail: [], log: [], visits: [], tarot: [], coins: 0, tokens: 0, deaths: 0, kills: 0, friendsTotal: 0, seenVenues: [], shields: 0, hosts: {}, heat: 0, heatAt: 0, shared: null };
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
export function addPoints(g, n) { g.score = Math.max(0, num(g.score) + n); return g.score; }
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
  const cand = (items || []).filter(c => c.node >= 0).map(c => ({ c, d: Math.hypot(c.x - px, c.z - pz) })).filter(x => x.d >= want / 2);
  const free = cand.filter(x => !used.includes(x.c));
  const pool = free.some(x => x.d <= want * PURSUIT.spread) ? free : cand;
  let best = null, bd = Infinity;
  for (const x of pool) { const s = Math.abs(x.d - want); if (s < bd) { bd = s; best = x.c; } }
  return best;
}
// сводка прогресса для карточек, списков и доски: понимает и старый формат до миграции
export function statsOf(g) {
  if (!g) return { score: 0, kills: 0, friends: 0, tarot: 0, visits: 0, hearts: CAPS.baseHearts, tail: 0, wins: 0, losses: 0, deaths: 0 };
  const v2 = g.v === 2, log = Array.isArray(g.log) ? g.log : [];
  return {
    score: scoreOf(g), kills: v2 ? num(g.kills) : (g.skulls?.length ?? 0), friends: v2 ? num(g.friendsTotal, log.filter(e => e.kind === 'friend').length) : (g.friends?.length ?? 0),
    tarot: g.tarot?.length ?? 0, visits: v2 && Array.isArray(g.seenVenues) ? g.seenVenues.length : (g.visits?.length ?? 0), hearts: num(g.maxHp, CAPS.baseHearts), tail: v2 ? (g.tail?.length ?? 0) : Math.min(CAPS.tail, g.friends?.length ?? 0),
    wins: num(g.wins), losses: num(g.losses), deaths: num(g.deaths),
  };
}
