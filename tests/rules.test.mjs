import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHalloweenNight, HALLOWEEN, CAPS, POINTS, HEAT, LEVELS, outcomeOf, levelOf, decayed, tailBonus, duel, newProgress, migrate, addPoints, growHearts, eatStack, logPush, scoreOf, intentOf, pickCemetery, statsOf, RPS, THROWS, PURSUIT, rpsBeats, hostThrow, hostSeed, stakeOf, resetAmount, deathCoins, CUT, shouldCut, CARD, HAND_MULT, TOKEN, ROAD, QUESTS, cardOfSlot, minskHour, hourLeft, handSeed, rngOf, dealHand, bossBonus, bossXp, questBonus, nextQuest, questFor, slotsOf, canBuyToken, buyToken, roadHeat, cardsFromDeck } from '../src/rules.js';

test('outcomeOf пороги', () => { assert.equal(outcomeOf(1), 'critfail'); assert.equal(outcomeOf(2), 'fail'); assert.equal(outcomeOf(7), 'fail'); assert.equal(outcomeOf(8), 'success'); assert.equal(outcomeOf(19), 'success'); assert.equal(outcomeOf(20), 'crit'); });
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
test('HEAT без минуты и кулдауна, с боссом и дорогой', () => { assert.deepEqual(HEAT, { kill: 15, friend: 8, tarot: 10, raidWin: 12, decayPer: 20, idleAfter: 30, max: 100, boss: 10, road: 1 }); });
test('PURSUIT: за кадром и прямой подход', () => { assert.equal(PURSUIT.offscreen, 400); assert.equal(PURSUIT.offscreenSpeed, 4); assert.equal(PURSUIT.direct, 150); assert.equal(PURSUIT.reach, 2); assert.equal(PURSUIT.waitNear, 300); });
test('statsOf: v2 и старый формат', () => {
  const g = newProgress(); g.score = 9; g.kills = 2; g.friendsTotal = 2; g.tail = [{ uid: 1 }]; logPush(g, { kind: 'friend' }); logPush(g, { kind: 'friend' }); logPush(g, { kind: 'kill' });
  assert.deepEqual(statsOf(g), { score: 9, kills: 2, friends: 2, tarot: 0, visits: 0, hearts: 3, tail: 1, wins: 0, losses: 0, deaths: 0, hands: 0, bestHand: null });
  const o = statsOf({ skulls: [1, 1], friends: Array(12).fill(1), tarot: [1], visits: [1], maxHp: 5 });
  assert.equal(o.kills, 2); assert.equal(o.friends, 12); assert.equal(o.tail, 10); assert.equal(o.hearts, 5); assert.equal(o.score, 6 + 36 + 5 + 1); assert.equal(statsOf(null).hearts, 3);
});
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
test('CUT из спеки', () => { assert.deepEqual(CUT, { maxDist: 60, ratio: 2.5, onPath: 3, step: 2, riverHalf: 13, snapR: 140, say: 0.25 }); assert.equal(PURSUIT.spreadNear, 1.5); });
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

// --- эндгейм: карты часа, квесты, слоты, жетоны, проезжая часть (план 2026-10-29-endgame-cards, задача 1)
test('CARD, TOKEN, ROAD, HEAT из спеки', () => {
  assert.deepEqual(CARD, { slots: 52, hand: 5, ringMin: 200, ringMax: 700, ringStep: 300, ringCap: 1600, spacing: 150, cooldown: 60, xpPerRank: 2, handBase: 20, bonus: { low: 0, mid: 1, high: 2, ace: 3 } });
  assert.deepEqual(HAND_MULT, { high: 1, pair: 2, twoPair: 3, three: 4, straight: 6, flush: 8, fullHouse: 10, four: 15, straightFlush: 30 });
  assert.deepEqual(TOKEN, { perHand: 1, price: 12, cap: 3 }); assert.deepEqual(ROAD, { speed: 1.2, heatPer: 4, crowdCost: 4 });
  assert.equal(HEAT.boss, 10); assert.equal(HEAT.road, 1); assert.equal(QUESTS.length, 7); assert.deepEqual(QUESTS.map(q => q.id), ['trick', 'treat', 'candy', 'coin', 'share', 'ghost', 'card']);
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
  const four = ['trick', 'treat', 'candy', 'coin']; assert.equal(nextQuest(four).id, 'share'); assert.equal(questFor(four, 'share').kind, 'share'); assert.equal(questFor(four, 'win'), null);
  assert.equal(QUESTS.length, 7); assert.equal(QUESTS.map(q => q.id).join(','), 'trick,treat,candy,coin,share,ghost,card');
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
test('cardsFromDeck: владелец по месту, свои, мёртвые и пустые места — упыри', () => {
  const rows = [{ id: 'a:1', device: 'a', name: 'Туз', seed: 1 }, { id: 'me:2', device: 'me', name: 'Я', seed: 2 }, { id: 'd:3', device: 'd', name: 'Мёртвый', seed: 3, dead: true }];
  const cards = cardsFromDeck([1, 2, 3, 30, 52], rows, 497000, 'me');
  assert.equal(cards.length, 5); assert.deepEqual(cards.map(c => c.slot), [1, 2, 3, 30, 52]);
  assert.equal(cards[0].owner, 'a:1'); assert.equal(cards[0].ghoul, false); assert.equal(cards[0].rank, 14);
  assert.equal(cards[1].ghoul, true); assert.equal(cards[2].ghoul, true); assert.equal(cards[3].ghoul, true); assert.equal(cards[3].suit, '♦');
  assert.equal(cards[1].seed, cardsFromDeck([2], rows, 497000, 'me')[0].seed); assert.notEqual(cards[1].seed, cardsFromDeck([2], rows, 497001, 'me')[0].seed);
});

test('migrate: битая рука обнуляется, состояния карт нормализуются', () => {
  assert.equal(migrate({ ...newProgress(), hand: { hour: 1, cards: null } }).hand, null);
  assert.equal(migrate({ ...newProgress(), hand: { hour: 1, cards: [{ slot: 1 }] } }).hand, null);
  assert.equal(migrate({ ...newProgress(), hand: 'x' }).hand, null);
  assert.equal(migrate({ ...newProgress(), hand: { cards: [1, 2, 3, 4, 5].map(slot => ({ slot })) } }).hand, null);
  const weird = [1, 2, 3, 4, 5].map(slot => ({ slot, rank: 14, suit: '♠', state: 'weird', coolUntil: 'no' }));
  const g4 = migrate({ ...newProgress(), hand: { hour: 497000, cards: weird } });
  assert.equal(g4.hand.cards.length, CARD.hand); assert.equal(g4.hand.cards[0].state, 'up'); assert.equal(g4.hand.cards[0].coolUntil, 0);
  const ok = [1, 2, 3, 4, 5].map(slot => ({ slot, rank: 14, suit: '♠', state: 'cool', coolUntil: 5 }));
  const g5 = migrate({ ...newProgress(), hand: { hour: 497000, cards: ok } }); assert.equal(g5.hand.cards[0].state, 'cool'); assert.equal(g5.hand.cards[0].coolUntil, 5);
});

test('isHalloweenNight: 31.10 18:00 – 01.11 06:00 по Минску', () => {
  assert.equal(isHalloweenNight(Date.UTC(2026, 9, 31, 14, 59)), false);
  assert.equal(isHalloweenNight(Date.UTC(2026, 9, 31, 15, 0)), true);
  assert.equal(isHalloweenNight(Date.UTC(2026, 10, 1, 2, 59)), true);
  assert.equal(isHalloweenNight(Date.UTC(2026, 10, 1, 3, 0)), false);
  assert.equal(HALLOWEEN.xpMul, 2);
});

test('addPoints: ночью Хэллоуина плюс удваивается, минус нет', () => {
  const night = Date.UTC(2026, 9, 31, 20, 0), day = Date.UTC(2026, 9, 30, 20, 0);
  const g = newProgress(); assert.equal(addPoints(g, 5, day), 5); assert.equal(addPoints(g, 5, night), 15); assert.equal(addPoints(g, -1, night), 14);
});
