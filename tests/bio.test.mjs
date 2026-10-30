import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCHETYPES, LINES, STATUS, makeRng, pickArchetype, makeBio, chatLine } from '../src/bio.js';
import { CATALOG, SHOP_KINDS, randomCostume } from '../src/skeletons.js';

test('у каждого архетипа гардероб из каталога, работы и свои реплики', () => {
  assert.ok(ARCHETYPES.length >= 20);
  for (const a of ARCHETYPES) {
    for (const h of a.hats) assert.ok(h === 'none' || CATALOG.hat[h], `${a.id}: шляпа ${h}`);
    for (const b of a.bodies) assert.ok(b === 'none' || CATALOG.body[b], `${a.id}: одежда ${b}`);
    for (const p of a.props) assert.ok(p === 'none' || CATALOG.prop[p], `${a.id}: предмет ${p}`);
    assert.ok(a.jobs.length >= 5, `${a.id}: мало работ`);
    assert.ok(LINES.arch[a.id] && LINES.arch[a.id].length >= 5, `${a.id}: мало реплик`);
  }
});

test('реплики: много и без дублей внутри набора', () => {
  let total = 0;
  for (const [k, v] of Object.entries(LINES)) {
    const arrs = Array.isArray(v) ? [[k, v]] : Object.entries(v);
    for (const [name, arr] of arrs) { total += arr.length; assert.equal(new Set(arr).size, arr.length, `дубли в ${k}.${name}`); for (const t of arr) assert.ok(t.length > 0 && t.length <= 40, `длинная реплика ${k}: ${t}`); }
  }
  assert.ok(total >= 400, `реплик всего ${total}`);
  assert.ok(STATUS.length >= 45); assert.equal(new Set(STATUS).size, STATUS.length, 'дубли в STATUS');
});

test('chatLine: по архетипу с шансом, иначе общий пул', () => {
  const rng = makeRng(3); let own = 0;
  for (let i = 0; i < 2000; i++) { const t = chatLine(rng, 'it'); if (LINES.arch.it.includes(t)) own++; else assert.ok(LINES.chat.includes(t)); }
  assert.ok(own > 700 && own < 1100, `профессиональных ${own}`);
  for (let i = 0; i < 50; i++) assert.ok(LINES.chat.includes(chatLine(rng, 'nope')));
});

test('randomCostume: ключи из каталога, питомцы и детали встречаются все', () => {
  const rng = makeRng(42); const seen = { pet: new Set(), face: new Set(), pattern: new Set(), extra: new Set() };
  for (let i = 0; i < 4000; i++) {
    const arch = pickArchetype(rng); const c = randomCostume(rng, arch);
    assert.ok(c.hat === 'none' || CATALOG.hat[c.hat]); assert.ok(c.body === 'none' || CATALOG.body[c.body]); assert.ok(c.prop === 'none' || CATALOG.prop[c.prop]);
    for (const k of Object.keys(seen)) { assert.ok(c[k] === 'none' || CATALOG[k][c[k]], `${k}=${c[k]}`); if (c[k] !== 'none') seen[k].add(c[k]); }
  }
  for (const k of Object.keys(seen)) assert.equal(seen[k].size, Object.keys(CATALOG[k]).length, `не все ${k}`);
  assert.ok(SHOP_KINDS.pet);
});

test('makeBio: работа строкой, возраст в рамках', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 500; i++) { const a = pickArchetype(rng); const b = makeBio(rng, a); assert.ok(typeof b.job === 'string' && b.job.length > 3, `${a.id}: ${b.job}`); assert.ok(b.age >= 18 && b.age <= 95); assert.ok(['m', 'f'].includes(b.gender)); }
});

test('chatLine: именные реплики (Папирус) перебивают архетип, чужое имя их не получает', () => {
  const rng = makeRng(7); let own = 0;
  for (let i = 0; i < 500; i++) { const t = chatLine(rng, 'knight', LINES.chat, 0.45, 'Папирус'); if (LINES.named['Папирус'].includes(t)) own++; else assert.ok(LINES.chat.includes(t)); }
  assert.ok(own > 400 && own < 500, `именных ${own} из 500`);
  for (let i = 0; i < 50; i++) assert.ok(LINES.chat.includes(chatLine(rng, 'knight', LINES.chat, 0, 'Скелет Скелетович')));
});
