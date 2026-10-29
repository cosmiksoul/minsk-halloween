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
