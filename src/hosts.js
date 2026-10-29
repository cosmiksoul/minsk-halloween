// Хозяева заведений: биография детерминирована от вида заведения, названия и адреса (один и тот же бармен
// у всех игроков), работа по типу места, любимый жест для камень-ножницы-бумаги, костюм для портрета.
import { THROWS, hostSeed } from './rules.js';
import { makeRng, pickArchetype, makeBio } from './bio.js';
import { randomCostume } from './skeletons.js';

const JOBS = { bar: ['бармен', 'барменша'], pub: ['бармен', 'барменша'], nightclub: ['бармен', 'барменша'], biergarten: ['бармен', 'барменша'], cafe: ['хозяин кафе', 'хозяйка кафе'], restaurant: ['хозяин ресторана', 'хозяйка ресторана'], event: ['хозяин площадки', 'хозяйка площадки'], shop: ['продавец', 'продавщица'] };
const cache = new Map();
// kind: 'bar' | 'shop'; place: заведение из venues.js или магазин из shops.js (id, name, addr, type)
export function hostOf(kind, place) {
  const key = kind + ':' + place.id; if (cache.has(key)) return cache.get(key);
  const seed = hostSeed(kind, place.name + '|' + (place.addr || ''));
  const rng = makeRng(seed); const arch = pickArchetype(rng); const bio = makeBio(rng, arch);
  const jobs = JOBS[kind === 'shop' ? 'shop' : place.type] || JOBS.bar;
  const h = { key, seed, name: bio.name, gender: bio.gender, age: bio.age, arch: arch.id, job: jobs[bio.gender === 'f' ? 1 : 0], fav: THROWS[seed % 3], costume: randomCostume(rng, arch) };
  cache.set(key, h); return h;
}
