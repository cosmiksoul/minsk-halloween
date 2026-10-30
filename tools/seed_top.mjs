#!/usr/bin/env node
// Боты для топа: 52 скелета с именами на «Скелет» и достижимыми очками, чтобы доска лидеров и колода карт часа
// не пустовали с первого дня. Пишутся в ту же таблицу Supabase, что и настоящие скелеты (anon-ключ из config.js),
// device у всех вида «bot:NN», поэтому их легко отличить и снести одной командой.
//   node tools/seed_top.mjs         записать или обновить ботов (upsert по id)
//   node tools/seed_top.mjs --dry   только показать таблицу, в базу не ходить
//   node tools/seed_top.mjs --wipe  удалить всех ботов (device like 'bot:%')
import { readFileSync } from 'node:fs';
import { generateCharacter } from '../src/gen.js';

const cfg = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const URL_ = /url:\s*'([^']+)'/.exec(cfg)?.[1], KEY = /anonKey:\s*'([^']+)'/.exec(cfg)?.[1], TABLE = /table:\s*'([^']+)'/.exec(cfg)?.[1] || 'skeletons';
const args = new Set(process.argv.slice(2)); const DRY = args.has('--dry'), WIPE = args.has('--wipe');
if (!DRY && (!URL_ || !KEY)) { console.error('в config.js нет url/anonKey'); process.exit(1); }

// имя и пол; возраст у «дедов», «баб», «профессоров» подтягивается вверх
const NAMES = [
  ['Скелет Скелетович', 'm'], ['Скелетина Костяная', 'f'], ['Костя Скелетов', 'm'], ['Алеся Скелетова', 'f'], ['Скелетон Пикселевич', 'm'], ['Ядвига Скелетовская', 'f'],
  ['Янка Скелетюк', 'm'], ['Ганна Скелетенко', 'f'], ['Алесь Скелетенко', 'm'], ['Марыля Скелетюк', 'f'], ['Змитер Скелетович', 'm'], ['Рогнеда Скелетович', 'f'],
  ['Кастусь Скелетовский', 'm'], ['Зося Скелетинская', 'f'], ['Рыгор Скелетар', 'm'], ['Кася Скелетько', 'f'], ['Тадеуш Скелетинский', 'm'], ['Ружа Скелетар', 'f'],
  ['Ясь Скелетько', 'm'], ['Агата Скелетонова', 'f'], ['Ольгерд Скелетов', 'm'], ['Василиса Скелетова', 'f'], ['Витовт Скелетонов', 'm'], ['Скелетта Немигская', 'f'],
  ['Лявон Скелетич', 'm'], ['Баба Скелетиха', 'f'], ['Франтишек Скелетовский', 'm'], ['Скелетона Пиксельная', 'f'], ['Скелет Минский', 'm'], ['Пани Скелетовская', 'f'],
  ['Скелет с Немиги', 'm'], ['Скелетика Зыбицкая', 'f'], ['Доктор Скелетов', 'm'], ['Скелеттина Тракторная', 'f'], ['Скелет Хэллоуинович', 'm'], ['Мадам Скелетье', 'f'],
  ['Профессор Скелетман', 'm'], ['Скелетка Троицкая', 'f'], ['Дед Скелет', 'm'], ['Леди Скелетон', 'f'], ['Скелет Бармен', 'm'], ['Скелетушка Уручская', 'f'],
  ['Скелетус Максимус', 'm'], ['Скелетина Серебрянская', 'f'], ['Скелет-Трамвайщик', 'm'], ['Тётя Скелета', 'f'], ['Скелет Комаровский', 'm'], ['Скелетрисса Первая', 'f'],
  ['Ян Скелетович', 'm'], ['Графиня Скелетовна', 'f'], ['Богдан Скелетов', 'm'], ['Скелетина Фрунзенская', 'f'],
];
const OLD = /^(Дед|Баба|Тётя|Профессор|Графиня|Пани|Мадам|Доктор)\s/; // \b в JS не знает кириллицы
const TOP = 150; // первое место: вечер хорошей игры (пара десятков бросков, арканы, пара боссов и одна рука)

function rows() {
  const now = Date.now(); const out = [];
  // кривая очков: первое место TOP, дальше вниз степенью 1.7 с дрожанием ±6 %, затем отсортирована, чтобы порядок имён совпадал с рейтингом
  const scores = NAMES.map((_, i) => Math.max(3, Math.round(TOP * Math.pow((NAMES.length - i) / NAMES.length, 1.7) * (0.94 + ((i * 2654435761) % 1000) / 1000 * 0.12)))).sort((a, b) => b - a);
  NAMES.forEach(([name, gender], i) => {
    let seed = 100000 + i * 7919, c; do { c = generateCharacter(seed); if (c.gender !== gender) seed++; } while (c.gender !== gender); // биография генератора склоняется по полу
    const score = scores[i];
    const kills = Math.round(score * 0.16), friends = Math.round(score * 0.11), tarot = Math.min(22, Math.floor(score / 14)), visits = Math.round(score * 0.09);
    const wins = kills + friends, losses = Math.round(wins * 0.45), deaths = score > 60 ? 1 + (i % 2) : i % 3 === 0 ? 1 : 0;
    const hearts = Math.min(10, 3 + Math.floor(tarot / 3)), tail = Math.min(10, friends % 6), coins = 5 + (i * 7) % 60;
    const age = OLD.test(name) ? Math.max(61, c.age) : c.age;
    const device = 'bot:' + String(i + 1).padStart(2, '0');
    out.push({ id: device + ':' + seed, device, name, gender, age, job: c.job, arch: c.arch, seed, costume: null, dead: false, hp: hearts, kills, friends, visits, deaths, tarot, coins, score, wins, losses, hearts, tail,
      updated_at: new Date(now - (i * 37 + 5) * 60000).toISOString() });
  });
  return out;
}
async function call(path, init) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.status;
}
const list = rows();
if (WIPE) { const st = await call(`${TABLE}?device=like.bot:*`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); console.log('боты удалены, HTTP', st); process.exit(0); }
console.log(list.map((r, i) => `${String(i + 1).padStart(2)}. ${r.name.padEnd(24)} ${String(r.score).padStart(3)} XP · 💀${r.kills} 💚${r.friends} 🃏${r.tarot} 🎃${r.visits} · ${r.gender} ${r.age} · ${r.job}`).join('\n'));
if (DRY) process.exit(0);
const st = await call(`${TABLE}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(list) });
console.log(`записано ${list.length} ботов, HTTP ${st}`);
