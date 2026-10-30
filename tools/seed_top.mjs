#!/usr/bin/env node
// Боты для топа: 52 скелета, чтобы доска лидеров и колода карт часа не пустовали с первого дня. Первое место — Папирус
// (пасхалка из Undertale: белые кости, красный шарф и ботинки, повар спагетти и мастер головоломок, «Нье-хе-хе!») с 1000 XP,
// дальше имена на «Скелет» по убывающей до 100 XP у 52-го. Пишутся в ту же таблицу Supabase, что и настоящие скелеты
// (anon-ключ из config.js), device у всех вида «bot:NN» (NN — место), поэтому их легко отличить и снести одной командой.
//   node tools/seed_top.mjs         записать или обновить ботов (upsert по id)
//   node tools/seed_top.mjs --dry   только показать таблицу, в базу не ходить
//   node tools/seed_top.mjs --wipe  удалить всех ботов (device like 'bot:%')
import { readFileSync } from 'node:fs';
import { generateCharacter } from '../src/gen.js';

const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const URL_ = /url:\s*'([^']+)'/.exec(cfg)?.[1], KEY = /anonKey:\s*'([^']+)'/.exec(cfg)?.[1], TABLE = /table:\s*'([^']+)'/.exec(cfg)?.[1] || 'skeletons';
const args = new Set(process.argv.slice(2)); const DRY = args.has('--dry'), WIPE = args.has('--wipe');
if (!DRY && (!URL_ || !KEY)) { console.error('в config.js нет url/anonKey'); process.exit(1); }

// первое место: Папирус. Шарф рисуется цветом c1, кости — bone, ботинки — shoes; шляпы и предмета нет (у рыцаря 'none' допустимы)
const PAPYRUS = {
  name: 'Папирус', gender: 'm', age: 24, job: 'мастер головоломок и повар спагетти', arch: 'knight', seed: 20150915,
  costume: { hat: 'none', body: 'scarf', prop: 'none', bone: '#ffffff', eye: '#0b0b0b', c1: '#ff3a1a', c2: '#ffffff', c3: '#2a7bd5', pattern: 'none', face: 'none', extra: 'none', shoes: '#ff3a1a', pet: 'none' },
};
// места 2–52: имя и пол; возраст у «дедов», «баб», «профессоров» подтягивается вверх
const NAMES = [
  ['Скелет Скелетович', 'm'], ['Скелетина Костяная', 'f'], ['Костя Скелетов', 'm'], ['Алеся Скелетова', 'f'], ['Скелетон Пикселевич', 'm'], ['Ядвига Скелетовская', 'f'],
  ['Янка Скелетюк', 'm'], ['Ганна Скелетенко', 'f'], ['Алесь Скелетенко', 'm'], ['Марыля Скелетюк', 'f'], ['Змитер Скелетович', 'm'], ['Рогнеда Скелетович', 'f'],
  ['Кастусь Скелетовский', 'm'], ['Зося Скелетинская', 'f'], ['Рыгор Скелетар', 'm'], ['Кася Скелетько', 'f'], ['Тадеуш Скелетинский', 'm'], ['Ружа Скелетар', 'f'],
  ['Ясь Скелетько', 'm'], ['Агата Скелетонова', 'f'], ['Ольгерд Скелетов', 'm'], ['Василиса Скелетова', 'f'], ['Витовт Скелетонов', 'm'], ['Скелетта Немигская', 'f'],
  ['Лявон Скелетич', 'm'], ['Баба Скелетиха', 'f'], ['Франтишек Скелетовский', 'm'], ['Скелетона Пиксельная', 'f'], ['Скелет Минский', 'm'], ['Пани Скелетовская', 'f'],
  ['Скелет с Немиги', 'm'], ['Скелетика Зыбицкая', 'f'], ['Доктор Скелетов', 'm'], ['Скелеттина Тракторная', 'f'], ['Скелет Хэллоуинович', 'm'], ['Мадам Скелетье', 'f'],
  ['Профессор Скелетман', 'm'], ['Скелетка Троицкая', 'f'], ['Дед Скелет', 'm'], ['Леди Скелетон', 'f'], ['Скелет Бармен', 'm'], ['Скелетушка Уручская', 'f'],
  ['Скелетус Максимус', 'm'], ['Скелетина Серебрянская', 'f'], ['Скелет-Трамвайщик', 'm'], ['Тётя Скелета', 'f'], ['Скелет Комаровский', 'm'], ['Скелетрисса Первая', 'f'],
  ['Ян Скелетович', 'm'], ['Графиня Скелетовна', 'f'], ['Богдан Скелетов', 'm'],
];
const OLD = /^(Дед|Баба|Тётя|Профессор|Графиня|Пани|Мадам|Доктор)\s/; // \b в JS не знает кириллицы
const TOP = 1000, SECOND = 850, FLOOR = 100; // 1000 — пара часов плотной игры; второе место заметно ниже, чтобы Папирус был один наверху

// статистика по очкам: примерно как у живого игрока с таким XP (победа 2 XP, аркана 5, заведение 1, боссы дороже)
function statsFor(score, i) {
  const kills = Math.round(score * 0.16), friends = Math.round(score * 0.11), tarot = Math.min(22, Math.floor(score / 45)), visits = Math.round(score * 0.09);
  const wins = kills + friends, losses = Math.round(wins * 0.45), deaths = score > 300 ? 1 + (i % 2) : i % 3 === 0 ? 1 : 0;
  const hearts = Math.min(10, 3 + Math.floor(tarot / 3)), tail = Math.min(10, friends % 6), coins = 5 + (i * 7) % 60;
  return { hp: hearts, kills, friends, visits, deaths, tarot, coins, score, wins, losses, hearts, tail };
}
function rows() {
  const now = Date.now(); const out = [];
  const N = NAMES.length; // 51 бот за Папирусом
  // кривая очков мест 2–52: от SECOND к FLOOR степенью 1.5 с дрожанием ±4 % надбавки над FLOOR (последнее место ровно FLOOR, хвост без ничьих), затем отсортирована, чтобы порядок имён совпадал с рейтингом
  const scores = NAMES.map((_, i) => { const base = FLOOR + (SECOND - FLOOR) * Math.pow((N - 1 - i) / (N - 1), 1.5); const j = i === N - 1 ? 1 : 0.96 + ((i * 2654435761) % 1000) / 1000 * 0.08; return Math.round(FLOOR + (base - FLOOR) * j); }).sort((a, b) => b - a);
  const push = (rank, c, score, costume, over = {}) => {
    const device = 'bot:' + String(rank).padStart(2, '0');
    out.push({ id: device + ':' + c.seed, device, name: c.name, gender: c.gender, age: c.age, job: c.job, arch: c.arch, seed: c.seed, costume, dead: false, ...statsFor(score, rank - 1), ...over,
      updated_at: new Date(now - ((rank - 1) * 37 + 5) * 60000).toISOString() });
  };
  push(1, PAPYRUS, TOP, PAPYRUS.costume, { kills: 0, friends: 270, wins: 270, losses: 60, tail: 10, deaths: 0 }); // пацифист: ни одного черепа, зато полный хвост друзей — охотником придёт знакомиться
  NAMES.forEach(([name, gender], i) => {
    let seed = 100000 + i * 7919, c; do { c = generateCharacter(seed); if (c.gender !== gender) seed++; } while (c.gender !== gender); // биография генератора склоняется по полу
    const age = OLD.test(name) ? Math.max(61, c.age) : c.age;
    push(i + 2, { name, gender, age, job: c.job, arch: c.arch, seed }, scores[i], null);
  });
  return out;
}
async function call(path, init) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status;
}
// без process.exit после fetch: на Windows Node может упасть с assertion в libuv, если выйти, пока соединение закрывается
const list = rows();
if (WIPE) { const st = await call(`${TABLE}?device=like.bot:*`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); console.log('боты удалены, HTTP', st); }
else {
  console.log(list.map((r, i) => `${String(i + 1).padStart(2)}. ${r.name.padEnd(24)} ${String(r.score).padStart(4)} XP · 💀${r.kills} 💚${r.friends} 🃏${r.tarot} 🎃${r.visits} · ${r.gender} ${r.age} · ${r.job}`).join('\n'));
  if (!DRY) { const st = await call(`${TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list) }); console.log(`записано ${list.length} ботов, HTTP ${st}`); }
}
