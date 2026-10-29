// Процедурные спрайты скелетов: кадры рисуются на canvas пиксель за пикселем,
// поверх костей накладываются слои костюма (шляпа, одежда, предмет в руке).
import { pick } from './bio.js';

export const FW = 24, FH = 36;
export const FRAMES = { walk: [0, 1, 2, 3], idle: [4], dance: [5, 6, 7, 8], drink: [9, 10], talk: [11, 12] };
export const NF = 13;

const BONES = ['#ece6c9', '#f4f1e3', '#d9d3a9', '#c9d6b0', '#d8cfc0', '#e6dcc0', '#cfe0cf', '#d6dde8'];
const EYES = ['#1b1326', '#1b1326', '#ff7a1a', '#7dff5a', '#ff3a3a', '#5ad8ff', '#ffd23a'];
const CLOTH = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400', '#2c3e50', '#e84393', '#6c5ce7', '#fdcb6e', '#00b894', '#b33939', '#218c74', '#474787', '#ffb142'];
const DARK = '#1b1326';

export const ACID = '#4df21e';
// каталог вещей: id → название (для магазинов и карточки)
export const CATALOG = {
  hat: { witch: 'шляпа ведьмы', top: 'цилиндр', party: 'праздничный колпак', beanie: 'шапка-бини', crown: 'корона', cowboy: 'ковбойская шляпа', hard: 'каска', chef: 'колпак повара', bandana: 'бандана', horns: 'рожки', halo: 'нимб', cat: 'кошачьи ушки', viking: 'шлем викинга', cap: 'кепка', beret: 'берет', ushanka: 'ушанка', kerchief: 'платок', pumpkin: 'тыква на голову', wizard: 'колпак мага', sombrero: 'сомбреро', headphones: 'наушники', santa: 'колпак Санты', cone: 'дорожный конус', bunny: 'заячьи уши', bucket: 'ведро', tiara: 'диадема', helmet: 'шлем космонавта', fez: 'феска', flowers: 'венок из цветов', antlers: 'рога оленя', propeller: 'кепка с пропеллером', mohawk: 'ирокез' },
  body: { hoodie: 'худи', shirtTie: 'рубашка с галстуком', coat: 'белый халат', dress: 'платье', robe: 'мантия звездочёта', vest: 'жилет дорожника', stripes: 'тельняшка', suit: 'костюм', apron: 'фартук', tracksuit: 'спортивка', scarf: 'шарф', cape: 'плащ', capeRed: 'плащ вампира', tshirt: 'футболка с принтом', jersey: 'игровая футболка', armor: 'латы', kimono: 'кимоно', sweater: 'свитер с узором', leather: 'косуха', overalls: 'комбинезон', tux: 'смокинг', poncho: 'пончо', cassock: 'ряса' },
  prop: { phone: 'телефон', balloon: 'шарик', guitar: 'гитара', umbrella: 'зонт', laptop: 'ноутбук', flower: 'цветок', broom: 'метла', sword: 'меч', bag: 'сумка', torch: 'факел', cane: 'трость', book: 'книга', lantern: 'фонарь', mic: 'микрофон', camera: 'фотоаппарат', coffee: 'стакан кофе', scythe: 'коса', lollipop: 'леденец', flag: 'флажок', cat: 'кот на руках' },
  pattern: { stripes: 'полоски', dots: 'горошек', checks: 'клетка', star: 'звезда', heart: 'сердце', zigzag: 'зигзаг', skull: 'череп на груди', bat: 'летучая мышь на груди', pumpkin: 'тыковка на груди', web: 'паутинка', bones: 'кости крест-накрест' },
  face: { glasses: 'очки', shades: 'тёмные очки', paint: 'боевой раскрас', mask: 'маска-домино', mustache: 'усы', monocle: 'монокль', eyepatch: 'повязка на глаз', beard: 'борода', scar: 'трещина в черепе', fangs: 'клыки', blush: 'румянец', goldtooth: 'золотой зуб' },
  extra: { wings: 'крылья', batwings: 'крылья летучей мыши', tail: 'хвост чёрта', necklace: 'цепочка', badge: 'значок' },
  pet: { crow: 'ворон на плече', rat: 'крыса на плече', bat: 'летучая мышь', spider: 'паук на нитке', dog: 'пёсик у ног', cat: 'кот у ног' },
};
export const SHOP_KINDS = { hat: 'шляпа', body: 'одежда', prop: 'предмет в руке', pattern: 'узор на одежде', face: 'лицо', extra: 'аксессуар', pet: 'питомец', colors: 'перекраска' };
export const PALETTE = CLOTH.concat(['#ffffff', '#111111', '#ff5fa2', '#5ad8ff', '#ffd23a', '#9dff7a', '#8e1b1b', '#3d1f6b']);
export const randomItem = (kind, rng) => { const keys = Object.keys(CATALOG[kind]); return keys[Math.floor(rng() * keys.length)]; };
// питомцы по архетипу: у ведьмы кот и ворон, у пенсионера пёсик; у остальных любой, но редко
const PET_BY_ARCH = { witch: ['cat', 'crow', 'bat', 'spider'], pension: ['dog', 'cat'], goth: ['bat', 'rat', 'crow', 'spider'], angel: ['dog', 'cat'], vamp: ['bat', 'rat'], pump: ['crow', 'spider'], pirate: ['rat', 'crow'], cosmo: ['dog'] };
export const CLOTH_BODIES = new Set(['hoodie', 'tshirt', 'jersey', 'sweater', 'tracksuit', 'dress', 'apron', 'kimono', 'overalls', 'poncho']);
export function randomCostume(rng, arch) {
  const c = {
    hat: pick(rng, arch.hats), body: pick(rng, arch.bodies), prop: pick(rng, arch.props),
    bone: pick(rng, BONES), eye: arch.id === 'vamp' ? '#ff3a3a' : pick(rng, EYES),
    c1: pick(rng, CLOTH), c2: pick(rng, CLOTH), c3: pick(rng, CLOTH),
  };
  if (arch.id === 'raver') { const g = rng() < 0.5; c.c1 = g ? ACID : '#141414'; c.c2 = g ? '#141414' : ACID; c.c3 = ACID; c.eye = ACID; c.bone = '#e6f0d8'; }
  if (arch.id === 'goth') { c.c1 = pick(rng, ['#1b1326', '#2d1b4e', '#111111', '#3d1f6b', '#8e1b1b']); c.c2 = pick(rng, ['#8e1b1b', '#6c5ce7', '#f2f2f2']); c.c3 = c.c2; c.eye = pick(rng, ['#ff3a3a', '#8e44ad', '#1b1326']); c.bone = '#f4f1e3'; }
  // редкие детали, чтобы толпа была разнообразнее (порядок бросков сохранён: костюмы по зерну не меняются, питомец — последним)
  c.pattern = rng() < 0.2 ? randomItem('pattern', rng) : 'none';
  c.face = rng() < 0.16 ? randomItem('face', rng) : 'none';
  c.extra = rng() < 0.08 ? randomItem('extra', rng) : 'none';
  c.shoes = rng() < 0.3 ? pick(rng, CLOTH) : null;
  const pets = PET_BY_ARCH[arch.id]; c.pet = pets ? (rng() < 0.3 ? pick(rng, pets) : 'none') : (rng() < 0.08 ? randomItem('pet', rng) : 'none');
  return c;
}

// позы: ноги (стопы, колени), руки (кисти), сдвиг тела, предмет виден?
function pose(f) {
  const P = { lf: [8, 35], rf: [15, 35], lk: [10, 31], rk: [13, 31], lh: [7, 25], rh: [16, 25], dy: 0, dx: 0, prop: true, mug: null, headDy: 0 };
  switch (f) {
    // шаг: ноги почти под тазом, одна стопа впереди, другая сзади; при проносе нога приподнята и колено вперёд
    case 0: Object.assign(P, { lf: [14, 35], rf: [9, 35], lk: [12, 31], rk: [11, 31], lh: [8, 24], rh: [16, 22] }); break;
    case 1: Object.assign(P, { lf: [12, 35], rf: [12, 33], lk: [11, 31], rk: [13, 30], lh: [8, 25], rh: [16, 25], dy: -1 }); break;
    case 2: Object.assign(P, { lf: [9, 35], rf: [14, 35], lk: [11, 31], rk: [13, 31], lh: [8, 22], rh: [16, 24] }); break;
    case 3: Object.assign(P, { lf: [12, 33], rf: [12, 35], lk: [10, 30], rk: [12, 31], lh: [8, 25], rh: [16, 25], dy: -1 }); break;
    case 4: break;
    case 5: Object.assign(P, { lf: [6, 35], rf: [16, 35], lk: [8, 31], rk: [14, 31], lh: [3, 9], rh: [20, 9], dx: -1, prop: false }); break;
    case 6: Object.assign(P, { lf: [10, 35], rf: [15, 33], lk: [10, 31], rk: [15, 30], lh: [4, 15], rh: [21, 6], dy: -1, prop: false }); break;
    case 7: Object.assign(P, { lf: [7, 35], rf: [17, 35], lk: [9, 31], rk: [15, 31], lh: [3, 7], rh: [20, 7], dx: 1, prop: false }); break;
    case 8: Object.assign(P, { lf: [8, 33], rf: [13, 35], lk: [8, 30], rk: [13, 31], lh: [2, 6], rh: [19, 15], dy: -1, prop: false }); break;
    case 9: Object.assign(P, { lh: [7, 25], rh: [16, 14], prop: false, mug: [16, 10] }); break;
    case 10: Object.assign(P, { lh: [7, 24], rh: [15, 12], prop: false, mug: [15, 8], headDy: -1 }); break;
    case 11: Object.assign(P, { lh: [4, 19], rh: [16, 25] }); break;
    case 12: Object.assign(P, { lh: [5, 15], rh: [16, 25] }); break;
  }
  return P;
}

function line(ctx, x0, y0, x1, y1, color, w = 2) {
  // пиксельная линия Брезенхема толщиной w
  ctx.fillStyle = color;
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (let i = 0; i < 200; i++) {
    ctx.fillRect(x0, y0, w, w === 2 ? 1 : w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// opts.ghost — палитра призрака: вместо ног рисуется хвост-подол (аура-обводка добавляется в drawStrip)
export function drawFrame(ctx, ox, f, C, opts = {}) {
  const P = pose(f);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x + P.dx, y + P.dy, w, h); };
  const L = (x0, y0, x1, y1, c, w) => line(ctx, ox + x0 + P.dx, y0 + P.dy, ox + x1 + P.dx, y1 + P.dy, c, w);
  const bone = C.bone, hd = P.headDy;

  // --- слой за спиной: плащ
  if (C.body === 'cape' || C.body === 'capeRed') {
    const col = C.body === 'capeRed' ? '#8e1b1b' : C.c1;
    for (let y = 17; y <= 30; y++) { const w = 8 + Math.floor((y - 17) * 0.6); R(12 - w / 2, y, w, 1, col); }
    R(8, 16, 8, 2, col);
  }
  if (C.prop === 'bag' && P.prop) R(5, 17, 3, 7, C.c3);
  if (C.extra === 'wings' || C.extra === 'batwings') {
    const col = C.extra === 'wings' ? '#f4f1e3' : '#2d1b4e';
    R(3, 18, 5, 1, col); R(2, 19, 5, 1, col); R(2, 20, 4, 1, col); R(3, 21, 3, 1, col); R(16, 18, 5, 1, col); R(17, 19, 5, 1, col); R(18, 20, 4, 1, col); R(18, 21, 3, 1, col);
    if (C.extra === 'batwings') { R(1, 18, 1, 1, col); R(22, 18, 1, 1, col); R(1, 21, 1, 1, col); R(22, 21, 1, 1, col); }
  }
  if (C.extra === 'tail') { L(14, 26, 20, 30, C.extraColor || '#8e1b1b', 1); R(20, 29, 2, 2, '#e8303a'); }

  // --- ноги (у призрака-охотника вместо них хвост-подол, подол меняется по кадрам)
  if (opts.ghost) {
    const G = opts.ghost, w = f % 2; // фаза колыхания
    // хвост-подол: сужается и расходится на три пряди, пряди колышутся по кадрам, на концах светлые искры
    R(8, 26, 8, 2, G.body); R(8, 28, 8, 2, G.body); R(9, 30, 6, 1, G.body);
    R(7 + w, 31, 2, 2, G.body); R(11, 31, 2, 3, G.body); R(14 + w, 31, 2, 2, G.body);
    R(6 + w, 33, 1, 1, G.light); R(16 - w, 33, 1, 1, G.light); R(11, 34, 1, 1, G.dark);
    R(8, 27, 1, 3, G.light); R(15, 27, 1, 3, G.dark);
    // искры вокруг фигуры мерцают по кадрам
    const sp = [[4, 12], [20, 20], [3, 24], [21, 9], [5, 19], [19, 28]]; for (let i = 0; i < 3; i++) { const q = sp[(f + i * 2) % sp.length]; R(q[0], q[1], 1, 1, G.light); }
  } else {
    L(10, 27, P.lk[0], P.lk[1], bone); L(P.lk[0], P.lk[1], P.lf[0], P.lf[1], bone);
    L(13, 27, P.rk[0], P.rk[1], bone); L(P.rk[0], P.rk[1], P.rf[0], P.rf[1], bone);
    R(P.lf[0] - 1, P.lf[1], 3, 1, C.shoes || bone); R(P.rf[0], P.rf[1], 3, 1, C.shoes || bone);
    if (C.body === 'tracksuit') { L(10, 27, P.lk[0], P.lk[1], C.c1); L(P.lk[0], P.lk[1], P.lf[0], P.lf[1] - 1, C.c1); L(13, 27, P.rk[0], P.rk[1], C.c1); L(P.rk[0], P.rk[1], P.rf[0], P.rf[1] - 1, C.c1); }
  }

  // --- таз, позвоночник, рёбра
  R(9, 25, 6, 2, bone);
  R(11, 17, 2, 8, bone);
  for (const y of [18, 20, 22]) { R(8, y, 3, 1, bone); R(13, y, 3, 1, bone); }

  // --- одежда на теле
  switch (C.body) {
    case 'shirtTie': R(8, 17, 8, 9, '#f2f2f2'); R(11, 17, 2, 6, C.c1); R(9, 17, 2, 1, '#cccccc'); R(13, 17, 2, 1, '#cccccc'); break;
    case 'coat': R(7, 17, 10, 12, '#f4f4f4'); R(12, 17, 1, 12, '#cfcfcf'); R(14, 19, 2, 1, '#d33'); R(15, 18, 1, 3, '#d33'); break;
    case 'hoodie': R(7, 17, 10, 10, C.c1); R(9, 24, 6, 2, shade(C.c1)); R(7, 5 + hd, 10, 2, C.c1); R(7, 7 + hd, 1, 8, C.c1); R(16, 7 + hd, 1, 8, C.c1); break;
    case 'dress': for (let y = 17; y <= 30; y++) { const w = Math.min(14, 8 + Math.floor((y - 17) * 0.5)); R(12 - w / 2, y, w, 1, C.c1); } R(10, 20, 4, 1, shade(C.c1)); break;
    case 'robe': for (let y = 17; y <= 32; y++) { const w = Math.min(14, 8 + Math.floor((y - 17) * 0.45)); R(12 - w / 2, y, w, 1, '#3d1f6b'); } R(9, 21, 1, 1, '#ffd23a'); R(13, 25, 1, 1, '#ffd23a'); R(11, 29, 1, 1, '#ffd23a'); break;
    case 'vest': R(8, 17, 8, 9, '#ff7a1a'); R(8, 20, 8, 1, '#f9f871'); R(8, 23, 8, 1, '#f9f871'); break;
    case 'stripes': R(8, 17, 8, 9, '#f2f2f2'); for (const y of [18, 20, 22, 24]) R(8, y, 8, 1, DARK); break;
    case 'suit': R(8, 17, 8, 10, '#262633'); R(11, 17, 2, 5, '#f2f2f2'); R(11, 18, 2, 4, C.c1); break;
    case 'apron': R(8, 17, 8, 2, bone); R(9, 19, 6, 11, C.c1); R(9, 24, 6, 1, shade(C.c1)); break;
    case 'tracksuit': R(8, 17, 8, 9, C.c1); R(8, 17, 1, 9, '#f2f2f2'); R(15, 17, 1, 9, '#f2f2f2'); break;
    case 'scarf': R(8, 15, 8, 3, C.c1); R(14, 18, 2, 6, C.c1); R(14, 20, 2, 1, shade(C.c1)); break;
    case 'tshirt': R(8, 17, 8, 9, C.c1); R(10, 19, 4, 3, C.c2); R(11, 20, 2, 1, C.c3); break;
    case 'jersey': R(8, 17, 8, 9, C.c1); R(8, 17, 1, 9, C.c2); R(15, 17, 1, 9, C.c2); R(11, 19, 2, 4, '#f2f2f2'); R(10, 20, 1, 1, '#f2f2f2'); break;
    case 'armor': R(7, 17, 10, 10, '#8a8f9a'); R(12, 17, 1, 10, '#5a5f6a'); R(8, 19, 8, 1, '#5a5f6a'); R(11, 22, 2, 2, '#ffd23a'); break;
    case 'kimono': for (let y = 17; y <= 30; y++) { const w = Math.min(14, 8 + Math.floor((y - 17) * 0.5)); R(12 - w / 2, y, w, 1, C.c1); } R(11, 17, 2, 6, C.c2); R(8, 23, 8, 2, C.c3); break;
    case 'sweater': R(8, 17, 8, 9, C.c1); R(8, 20, 8, 1, C.c2); R(8, 23, 8, 1, C.c2); for (const x of [9, 11, 13, 15]) { R(x, 21, 1, 1, C.c2); R(x, 25, 1, 1, C.c2); } break;
    case 'leather': R(8, 17, 8, 10, '#1f1f2a'); R(11, 17, 2, 10, '#3a3a4a'); R(9, 18, 1, 1, '#aaa'); R(14, 18, 1, 1, '#aaa'); R(8, 25, 8, 1, '#8a6a2a'); break;
    case 'overalls': R(8, 19, 8, 12, C.c1); R(9, 17, 1, 3, C.c1); R(14, 17, 1, 3, C.c1); R(10, 21, 4, 3, shade(C.c1)); break;
    case 'tux': R(8, 17, 8, 10, '#111118'); R(11, 17, 2, 6, '#f2f2f2'); R(10, 17, 4, 1, '#c0392b'); R(11, 18, 2, 1, '#c0392b'); break;
    case 'poncho': for (let y = 17; y <= 28; y++) { const w = Math.min(16, 8 + Math.floor((y - 17) * 0.8)); R(12 - w / 2, y, w, 1, y % 2 ? C.c1 : C.c2); } break;
    case 'cassock': for (let y = 17; y <= 32; y++) { const w = Math.min(14, 8 + Math.floor((y - 17) * 0.45)); R(12 - w / 2, y, w, 1, '#1b1326'); } R(11, 17, 2, 8, '#f2f2f2'); R(11, 21, 2, 2, '#ffd23a'); break;
  }
  if (C.pattern && C.pattern !== 'none' && CLOTH_BODIES.has(C.body)) {
    const pc = C.c2 === C.c1 ? shade(C.c1) : C.c2;
    switch (C.pattern) {
      case 'stripes': for (const y of [18, 20, 22, 24]) R(8, y, 8, 1, shade(C.c1)); break;
      case 'dots': for (const y of [18, 21, 24]) for (const x of [9, 12, 15]) R(x, y, 1, 1, pc); break;
      case 'checks': for (let y = 17; y <= 25; y++) for (let x = 8; x < 16; x++) if (((x >> 1) + (y >> 1)) % 2) R(x, y, 1, 1, shade(C.c1)); break;
      case 'star': R(11, 19, 2, 1, pc); R(10, 20, 4, 1, pc); R(11, 21, 2, 1, pc); R(10, 22, 1, 1, pc); R(13, 22, 1, 1, pc); break;
      case 'heart': R(10, 19, 2, 1, pc); R(13, 19, 2, 1, pc); R(10, 20, 5, 1, pc); R(11, 21, 3, 1, pc); R(12, 22, 1, 1, pc); break;
      case 'zigzag': for (let x = 8; x < 16; x++) { R(x, 19 + (x & 1), 1, 1, pc); R(x, 23 + (x & 1), 1, 1, pc); } break;
      case 'skull': R(10, 19, 4, 3, '#f2f2f2'); R(11, 22, 2, 1, '#f2f2f2'); R(10, 20, 1, 1, shade(C.c1)); R(13, 20, 1, 1, shade(C.c1)); break;
      case 'bat': R(9, 19, 6, 1, DARK); R(11, 20, 2, 2, DARK); R(8, 20, 1, 1, DARK); R(15, 20, 1, 1, DARK); R(10, 18, 1, 1, DARK); R(13, 18, 1, 1, DARK); break;
      case 'pumpkin': R(10, 19, 4, 4, '#f07a1a'); R(11, 18, 2, 1, '#3a7a2a'); R(11, 20, 1, 1, DARK); R(13, 20, 1, 1, DARK); R(11, 22, 3, 1, DARK); break;
      case 'web': R(9, 20, 5, 1, pc); R(11, 18, 1, 5, pc); R(9, 18, 1, 1, pc); R(13, 18, 1, 1, pc); R(9, 22, 1, 1, pc); R(13, 22, 1, 1, pc); R(10, 19, 1, 1, pc); R(12, 19, 1, 1, pc); R(10, 21, 1, 1, pc); R(12, 21, 1, 1, pc); break;
      case 'bones': for (let i = 0; i < 5; i++) { R(9 + i, 18 + i, 1, 1, '#f2f2f2'); R(13 - i, 18 + i, 1, 1, '#f2f2f2'); } R(8, 17, 2, 1, '#f2f2f2'); R(13, 17, 2, 1, '#f2f2f2'); R(8, 23, 2, 1, '#f2f2f2'); R(13, 23, 2, 1, '#f2f2f2'); break;
    }
  }
  if (C.extra === 'necklace') { R(10, 16, 4, 1, '#ffd23a'); R(11, 17, 2, 1, '#ffd23a'); }
  if (C.extra === 'badge') R(9, 18, 2, 2, '#ffd23a');

  // --- руки
  L(8, 17, P.lh[0], P.lh[1], bone); L(15, 17, P.rh[0], P.rh[1], bone);
  const SLEEVE = { hoodie: C.c1, tracksuit: C.c1, coat: '#f4f4f4', suit: '#262633', shirtTie: '#f2f2f2', tshirt: C.c1, jersey: C.c1, sweater: C.c1, leather: '#1f1f2a', tux: '#111118', armor: '#8a8f9a', kimono: C.c1, cassock: '#1b1326' };
  if (SLEEVE[C.body]) {
    const col = SLEEVE[C.body];
    L(8, 17, Math.round((8 + P.lh[0]) / 2), Math.round((17 + P.lh[1]) / 2), col); L(15, 17, Math.round((15 + P.rh[0]) / 2), Math.round((17 + P.rh[1]) / 2), col);
  }

  // --- голова
  if (C.hat === 'pumpkin') {
    R(7, 5 + hd, 10, 10, '#f07a1a'); R(9, 5 + hd, 1, 10, '#c85a0a'); R(14, 5 + hd, 1, 10, '#c85a0a'); R(11, 3 + hd, 2, 2, '#3a7a2a');
    R(9, 8 + hd, 2, 2, DARK); R(13, 8 + hd, 2, 2, DARK); R(11, 10 + hd, 2, 1, DARK); R(9, 12 + hd, 6, 1, DARK); R(10, 13 + hd, 1, 1, DARK); R(13, 13 + hd, 1, 1, DARK);
    R(10, 9 + hd, 1, 1, '#ffd23a'); R(14, 9 + hd, 1, 1, '#ffd23a');
  } else {
    R(11, 16, 2, 1, bone);
    R(8, 6 + hd, 8, 8, bone); R(9, 14 + hd, 6, 2, bone);
    const sock = opts.ghost ? opts.ghost.dark : DARK, pupil = opts.ghost ? opts.ghost.light : C.eye; // у призрака глазницы светятся
    R(9, 8 + hd, 2, 2, sock); R(13, 8 + hd, 2, 2, sock); R(11, 11 + hd, 2, 1, shade(bone));
    R(10, 9 + hd, 1, 1, pupil); R(14, 9 + hd, 1, 1, pupil);
    R(10, 14 + hd, 1, 1, shade(bone)); R(12, 14 + hd, 1, 1, shade(bone)); R(14, 14 + hd, 1, 1, shade(bone));
    switch (C.face) {
      case 'glasses': R(9, 8 + hd, 3, 1, '#333'); R(13, 8 + hd, 3, 1, '#333'); R(9, 9 + hd, 1, 1, '#333'); R(11, 9 + hd, 1, 1, '#333'); R(13, 9 + hd, 1, 1, '#333'); R(15, 9 + hd, 1, 1, '#333'); R(12, 8 + hd, 1, 1, '#333'); break;
      case 'shades': R(9, 8 + hd, 3, 2, '#111'); R(13, 8 + hd, 3, 2, '#111'); R(12, 8 + hd, 1, 1, '#111'); R(10, 8 + hd, 1, 1, '#5ad8ff'); break;
      case 'paint': R(9, 11 + hd, 2, 1, C.c1); R(13, 11 + hd, 2, 1, C.c1); R(8, 7 + hd, 1, 3, C.c2); R(15, 7 + hd, 1, 3, C.c2); break;
      case 'mask': R(8, 8 + hd, 8, 2, C.c2); R(10, 9 + hd, 1, 1, C.eye); R(14, 9 + hd, 1, 1, C.eye); R(9, 8 + hd, 1, 1, shade(C.c2)); break;
      case 'mustache': R(10, 12 + hd, 4, 1, '#3a2410'); R(9, 13 + hd, 1, 1, '#3a2410'); R(14, 13 + hd, 1, 1, '#3a2410'); break;
      case 'monocle': R(13, 8 + hd, 3, 1, '#ffd23a'); R(13, 10 + hd, 3, 1, '#ffd23a'); R(13, 9 + hd, 1, 1, '#ffd23a'); R(15, 9 + hd, 1, 1, '#ffd23a'); L(16, 11 + hd, 17, 16, '#ffd23a', 1); break;
      case 'eyepatch': R(13, 8 + hd, 2, 2, '#111'); R(9, 7 + hd, 6, 1, '#111'); R(8, 8 + hd, 1, 1, '#111'); R(15, 8 + hd, 1, 1, '#111'); break;
      case 'beard': { const bc = '#6b4a2a'; R(8, 13 + hd, 1, 2, bc); R(15, 13 + hd, 1, 2, bc); R(9, 15 + hd, 6, 1, bc); R(10, 16 + hd, 4, 1, bc); R(11, 17 + hd, 2, 1, bc); break; }
      case 'scar': { const sc = '#8a7a5a'; R(12, 6 + hd, 1, 1, sc); R(11, 7 + hd, 1, 1, sc); R(12, 8 + hd, 1, 1, sc); R(11, 9 + hd, 1, 1, sc); R(12, 10 + hd, 1, 1, sc); break; }
      case 'fangs': R(10, 15 + hd, 1, 2, '#ffffff'); R(13, 15 + hd, 1, 2, '#ffffff'); R(10, 17 + hd, 1, 1, '#e8303a'); break;
      case 'blush': R(8, 11 + hd, 2, 1, '#ff9ac0'); R(14, 11 + hd, 2, 1, '#ff9ac0'); break;
      case 'goldtooth': R(12, 14 + hd, 1, 2, '#ffd23a'); R(13, 13 + hd, 1, 1, '#ffffff'); break;
    }
  }

  // --- шляпы
  const y0 = hd;
  switch (C.hat) {
    case 'witch': R(5, 6 + y0, 14, 1, '#2d1b4e'); R(8, 5 + y0, 8, 1, '#ff8a2a'); R(9, 4 + y0, 6, 1, '#2d1b4e'); R(10, 3 + y0, 4, 1, '#2d1b4e'); R(10, 2 + y0, 3, 1, '#2d1b4e'); R(11, 1 + y0, 2, 1, '#2d1b4e'); R(12, 0 + y0, 1, 1, '#2d1b4e'); break;
    case 'top': R(6, 5 + y0, 12, 1, '#1f1f2a'); R(8, 0 + y0, 8, 5, '#1f1f2a'); R(8, 4 + y0, 8, 1, C.c1); break;
    case 'party': for (let i = 0; i < 6; i++) R(12 - Math.ceil((6 - i) / 2) + (i % 2 ? 0 : 0), i + y0, 6 - i + (i % 2), 1, i % 2 ? C.c1 : C.c2); R(11, 0 + y0, 2, 1, '#fff'); break;
    case 'beanie': R(8, 4 + y0, 8, 3, C.c1); R(7, 6 + y0, 10, 1, shade(C.c1)); R(11, 2 + y0, 2, 2, '#f2f2f2'); break;
    case 'crown': R(8, 4 + y0, 8, 2, '#ffd23a'); for (const x of [8, 10, 12, 14]) R(x, 3 + y0, 1, 1, '#ffd23a'); R(15, 3 + y0, 1, 1, '#ffd23a'); R(11, 4 + y0, 2, 1, '#e8303a'); break;
    case 'cowboy': R(5, 6 + y0, 14, 1, '#7a4a1a'); R(8, 3 + y0, 8, 3, '#7a4a1a'); R(11, 3 + y0, 2, 1, '#5a3410'); R(8, 5 + y0, 8, 1, '#3a2410'); break;
    case 'hard': R(7, 4 + y0, 10, 3, '#ffd23a'); R(6, 6 + y0, 12, 1, '#e0b020'); R(9, 3 + y0, 6, 1, '#ffd23a'); break;
    case 'chef': R(8, 2 + y0, 8, 4, '#f8f8f8'); R(7, 0 + y0, 10, 3, '#f8f8f8'); R(8, 5 + y0, 8, 1, '#d0d0d0'); break;
    case 'bandana': R(8, 5 + y0, 8, 2, '#c0392b'); R(7, 6 + y0, 1, 1, '#c0392b'); R(4, 7 + y0, 3, 1, '#c0392b'); R(5, 8 + y0, 2, 1, '#c0392b'); R(10, 5 + y0, 1, 1, '#fff'); R(13, 6 + y0, 1, 1, '#fff'); R(13, 8 + y0, 2, 2, DARK); R(8, 7 + y0, 7, 1, DARK); break;
    case 'horns': R(7, 3 + y0, 1, 1, '#e8303a'); R(7, 4 + y0, 2, 1, '#e8303a'); R(8, 5 + y0, 1, 1, '#e8303a'); R(16, 3 + y0, 1, 1, '#e8303a'); R(15, 4 + y0, 2, 1, '#e8303a'); R(15, 5 + y0, 1, 1, '#e8303a'); break;
    case 'halo': R(9, 1 + y0, 6, 1, '#ffe66a'); R(8, 2 + y0, 1, 1, '#ffe66a'); R(15, 2 + y0, 1, 1, '#ffe66a'); R(9, 3 + y0, 6, 1, '#ffe66a'); break;
    case 'cat': R(8, 4 + y0, 2, 2, C.c1); R(8, 3 + y0, 1, 1, C.c1); R(14, 4 + y0, 2, 2, C.c1); R(15, 3 + y0, 1, 1, C.c1); R(9, 5 + y0, 1, 1, '#ff9ac0'); R(14, 5 + y0, 1, 1, '#ff9ac0'); break;
    case 'viking': R(8, 3 + y0, 8, 4, '#8a8f9a'); R(8, 6 + y0, 8, 1, '#5a5f6a'); R(7, 3 + y0, 1, 1, bone); R(6, 2 + y0, 1, 1, bone); R(16, 3 + y0, 1, 1, bone); R(17, 2 + y0, 1, 1, bone); break;
    case 'cap': R(8, 4 + y0, 8, 2, C.c1); R(14, 6 + y0, 5, 1, shade(C.c1)); R(9, 3 + y0, 6, 1, C.c1); break;
    case 'beret': R(6, 4 + y0, 10, 2, C.c1); R(7, 3 + y0, 8, 1, C.c1); R(11, 2 + y0, 1, 1, shade(C.c1)); break;
    case 'ushanka': R(7, 2 + y0, 10, 5, '#6b5a4a'); R(6, 7 + y0, 2, 4, '#6b5a4a'); R(16, 7 + y0, 2, 4, '#6b5a4a'); R(8, 2 + y0, 8, 1, '#8c7a66'); break;
    case 'kerchief': R(7, 4 + y0, 10, 2, C.c1); R(6, 6 + y0, 12, 1, C.c1); R(7, 7 + y0, 1, 7, C.c1); R(16, 7 + y0, 1, 7, C.c1); R(10, 16, 4, 1, C.c1); R(9, 5 + y0, 1, 1, '#fff'); R(13, 4 + y0, 1, 1, '#fff'); break;
    case 'wizard': R(5, 6 + y0, 14, 1, '#2a3d8e'); R(8, 5 + y0, 8, 1, '#2a3d8e'); R(9, 4 + y0, 6, 1, '#2a3d8e'); R(10, 3 + y0, 4, 1, '#2a3d8e'); R(10, 2 + y0, 3, 1, '#2a3d8e'); R(11, 1 + y0, 2, 1, '#2a3d8e'); R(12, 0 + y0, 1, 1, '#2a3d8e'); R(10, 4 + y0, 1, 1, '#ffd23a'); R(12, 2 + y0, 1, 1, '#ffd23a'); R(14, 5 + y0, 1, 1, '#ffd23a'); break;
    case 'sombrero': R(3, 6 + y0, 18, 1, '#d9a441'); R(4, 5 + y0, 16, 1, '#d9a441'); R(8, 2 + y0, 8, 3, '#d9a441'); R(8, 4 + y0, 8, 1, '#c0392b'); R(9, 1 + y0, 6, 1, '#d9a441'); break;
    case 'headphones': R(8, 4 + y0, 8, 1, '#222'); R(7, 5 + y0, 1, 1, '#222'); R(16, 5 + y0, 1, 1, '#222'); R(6, 7 + y0, 2, 4, C.c1); R(16, 7 + y0, 2, 4, C.c1); R(6, 6 + y0, 1, 1, '#222'); R(17, 6 + y0, 1, 1, '#222'); break;
    case 'santa': R(8, 4 + y0, 8, 2, '#c0392b'); R(7, 6 + y0, 10, 1, '#fff'); R(9, 3 + y0, 6, 1, '#c0392b'); R(10, 2 + y0, 4, 1, '#c0392b'); R(12, 1 + y0, 2, 1, '#c0392b'); R(13, 0 + y0, 2, 1, '#fff'); break;
    case 'cone': R(10, 0 + y0, 4, 1, '#ff7a1a'); R(9, 1 + y0, 6, 2, '#ff7a1a'); R(8, 3 + y0, 8, 2, '#fff'); R(7, 5 + y0, 10, 2, '#ff7a1a'); break;
    case 'bunny': R(9, 0 + y0, 2, 6, '#f2f2f2'); R(13, 0 + y0, 2, 6, '#f2f2f2'); R(10, 1 + y0, 1, 4, '#ff9ac0'); R(14, 1 + y0, 1, 4, '#ff9ac0'); R(8, 5 + y0, 8, 1, '#f2f2f2'); break;
    case 'bucket': R(7, 2 + y0, 10, 5, '#8a8f9a'); R(6, 6 + y0, 12, 1, '#5a5f6a'); R(8, 1 + y0, 8, 1, '#8a8f9a'); R(9, 3 + y0, 1, 2, '#b0b5c0'); break;
    case 'tiara': R(8, 5 + y0, 8, 1, '#5ad8ff'); R(9, 4 + y0, 1, 1, '#5ad8ff'); R(11, 3 + y0, 2, 2, '#5ad8ff'); R(14, 4 + y0, 1, 1, '#5ad8ff'); R(11, 2 + y0, 2, 1, '#ff9ac0'); break;
    case 'helmet': R(7, 3 + y0, 10, 3, '#dfe6ee'); R(7, 6 + y0, 1, 8, '#dfe6ee'); R(16, 6 + y0, 1, 8, '#dfe6ee'); R(8, 6 + y0, 8, 1, '#5ad8ff'); R(8, 13 + y0, 8, 1, '#5ad8ff'); break;
    case 'fez': R(9, 2 + y0, 6, 4, '#c0392b'); R(9, 6 + y0, 6, 1, '#8e1b1b'); R(14, 1 + y0, 1, 2, '#1b1326'); R(15, 0 + y0, 1, 1, '#1b1326'); break;
    case 'flowers': R(8, 6 + y0, 8, 1, '#3a9a3a'); R(8, 4 + y0, 2, 2, C.c1); R(11, 4 + y0, 2, 2, C.c2); R(14, 4 + y0, 2, 2, '#ffd23a'); R(9, 3 + y0, 1, 1, '#fff'); R(12, 3 + y0, 1, 1, '#fff'); R(15, 3 + y0, 1, 1, '#fff'); break;
    case 'antlers': L(8, 5 + y0, 5, 0 + y0, '#8a5a2a', 1); L(16, 5 + y0, 19, 0 + y0, '#8a5a2a', 1); R(5, 2 + y0, 1, 1, '#8a5a2a'); R(18, 2 + y0, 1, 1, '#8a5a2a'); R(4, 1 + y0, 1, 1, '#8a5a2a'); R(19, 1 + y0, 1, 1, '#8a5a2a'); break;
    case 'propeller': R(11, 1 + y0, 2, 3, '#555'); R(7, 0 + y0, 10, 1, C.c1); R(8, 4 + y0, 8, 2, C.c2); R(7, 6 + y0, 10, 1, shade(C.c2)); break;
    case 'mohawk': R(11, 0 + y0, 2, 6, C.c1); R(10, 2 + y0, 4, 1, C.c1); R(10, 4 + y0, 4, 1, C.c1); break;
  }

  // --- предмет в руке
  const h = P.rh;
  if (P.prop) switch (C.prop) {
    case 'phone': R(h[0] + 1, h[1] - 4, 2, 4, DARK); R(h[0] + 1, h[1] - 3, 2, 2, '#7dd3ff'); break;
    case 'balloon': L(h[0] + 1, h[1], h[0] + 4, h[1] - 9, '#aaa', 1); R(h[0] + 3, h[1] - 15, 4, 5, C.c2); R(h[0] + 2, h[1] - 14, 1, 3, C.c2); R(h[0] + 7, h[1] - 14, 1, 3, C.c2); R(h[0] + 4, h[1] - 14, 1, 1, '#fff'); break;
    case 'guitar': R(h[0] - 3, h[1] - 2, 6, 4, '#8a4b1f'); R(h[0] - 1, h[1] - 1, 2, 2, DARK); L(h[0] + 3, h[1] - 1, h[0] + 8, h[1] - 7, '#4a2a10', 1); break;
    case 'umbrella': L(h[0] + 1, h[1], h[0] + 1, h[1] - 12, DARK, 1); R(h[0] - 5, h[1] - 14, 13, 2, C.c2); R(h[0] - 4, h[1] - 15, 11, 1, C.c2); for (const x of [-5, -1, 3, 7]) R(h[0] + x, h[1] - 12, 1, 1, C.c2); break;
    case 'laptop': R(h[0] - 1, h[1] - 3, 6, 4, '#aab'); R(h[0], h[1] - 2, 4, 2, '#5ad8ff'); break;
    case 'flower': L(h[0] + 1, h[1], h[0] + 1, h[1] - 6, '#3a9a3a', 1); R(h[0], h[1] - 9, 3, 3, C.c2); R(h[0] + 1, h[1] - 8, 1, 1, '#ffd23a'); break;
    case 'broom': L(h[0] - 4, h[1] + 7, h[0] + 5, h[1] - 10, '#8a5a2a', 1); R(h[0] - 7, h[1] + 6, 5, 4, '#c9a24a'); break;
    case 'sword': L(h[0] + 1, h[1] - 1, h[0] + 1, h[1] - 12, '#cfd6e0', 1); R(h[0] - 1, h[1] - 2, 5, 1, '#8a6a2a'); R(h[0] + 1, h[1] - 12, 1, 1, '#fff'); break;
    case 'torch': L(h[0] + 1, h[1], h[0] + 1, h[1] - 7, '#8a5a2a', 1); R(h[0], h[1] - 10, 3, 3, '#ff7a1a'); R(h[0] + 1, h[1] - 11, 1, 1, '#ffd23a'); R(h[0] + 1, h[1] - 9, 1, 1, '#ffd23a'); break;
    case 'cane': L(h[0] + 1, h[1], h[0] + 1, h[1] + 10, '#2a1a10', 1); R(h[0], h[1] - 1, 3, 1, '#ffd23a'); break;
    case 'book': R(h[0] - 1, h[1] - 3, 5, 4, C.c2); R(h[0] + 1, h[1] - 3, 1, 4, '#f2f2f2'); R(h[0], h[1] - 2, 1, 1, '#ffd23a'); break;
    case 'lantern': L(h[0] + 1, h[1], h[0] + 1, h[1] - 3, '#555', 1); R(h[0] - 1, h[1] - 8, 5, 5, '#8a8f9a'); R(h[0], h[1] - 7, 3, 3, '#ffd23a'); break;
    case 'mic': R(h[0], h[1] - 6, 3, 3, '#555'); R(h[0] + 1, h[1] - 3, 1, 3, '#222'); R(h[0] + 1, h[1] - 5, 1, 1, '#888'); break;
    case 'camera': R(h[0] - 2, h[1] - 4, 6, 4, '#333'); R(h[0], h[1] - 3, 2, 2, '#5ad8ff'); R(h[0] + 3, h[1] - 5, 1, 1, '#ff3a3a'); break;
    case 'coffee': R(h[0], h[1] - 4, 3, 4, '#f2f2f2'); R(h[0], h[1] - 5, 3, 1, '#8a5a2a'); R(h[0] + 3, h[1] - 3, 1, 2, '#f2f2f2'); R(h[0] + 1, h[1] - 2, 1, 1, C.c2); break;
    case 'scythe': L(h[0] + 1, h[1] + 6, h[0] + 1, h[1] - 12, '#8a5a2a', 1); R(h[0] - 6, h[1] - 13, 8, 1, '#cfd6e0'); R(h[0] - 7, h[1] - 12, 2, 1, '#cfd6e0'); R(h[0] - 8, h[1] - 11, 1, 1, '#cfd6e0'); break;
    case 'lollipop': L(h[0] + 1, h[1], h[0] + 1, h[1] - 6, '#f2f2f2', 1); R(h[0] - 1, h[1] - 10, 5, 4, C.c2); R(h[0], h[1] - 9, 1, 1, '#fff'); R(h[0] + 2, h[1] - 8, 1, 1, '#fff'); break;
    case 'flag': L(h[0] + 1, h[1], h[0] + 1, h[1] - 12, '#8a5a2a', 1); R(h[0] + 2, h[1] - 12, 6, 4, C.c2); R(h[0] + 2, h[1] - 10, 6, 1, C.c3); break;
    case 'cat': R(h[0] - 1, h[1] - 4, 4, 3, '#333'); R(h[0] - 1, h[1] - 5, 1, 1, '#333'); R(h[0] + 2, h[1] - 5, 1, 1, '#333'); R(h[0], h[1] - 3, 1, 1, '#ffd23a'); R(h[0] + 2, h[1] - 3, 1, 1, '#ffd23a'); R(h[0] + 3, h[1] - 2, 2, 1, '#333'); break;
  }
  if (P.mug) { const m = P.mug; R(m[0], m[1], 4, 5, '#f0a020'); R(m[0], m[1] - 1, 4, 1, '#fff6e0'); R(m[0] + 4, m[1] + 1, 1, 3, '#f0a020'); R(m[0], m[1] + 1, 1, 3, '#ffd060'); }

  // --- питомец: на плече едет с телом (R), у ног и в воздухе стоит на месте (Q) и шевелится по кадрам; у призраков питомцев нет
  if (C.pet && C.pet !== 'none' && !opts.ghost) {
    const Q = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
    const k = f % 2, j = f % 3;
    switch (C.pet) {
      case 'crow': R(4, 14, 4, 3, '#1b1b22'); R(3, 13, 2, 2, '#1b1b22'); R(2, 14, 1, 1, '#ffd23a'); R(3, 13, 1, 1, '#f2f2f2'); R(8, 14, 1, 1, '#1b1b22'); if (k) R(5, 13, 2, 1, '#1b1b22'); break;
      case 'rat': R(16, 15, 4, 2, '#8a8a92'); R(20, 15, 2, 2, '#8a8a92'); R(21, 14, 1, 1, '#ff9ac0'); R(21, 15, 1, 1, DARK); R(22, 16, 1, 1, '#ff9ac0'); R(19, 17, 1, 1, '#d8a0a0'); R(20, 18, 1, 1, '#d8a0a0'); break;
      case 'bat': { const y = 2 + k, bc = '#2d1b4e'; Q(19, y + 1, 3, 2, bc); Q(19, y + 1, 1, 1, '#ff3a3a'); Q(21, y + 1, 1, 1, '#ff3a3a'); if (k) { Q(17, y + 2, 2, 1, bc); Q(22, y + 2, 2, 1, bc); } else { Q(17, y, 2, 1, bc); Q(22, y, 2, 1, bc); Q(16, y - 1, 1, 1, bc); Q(23, y - 1, 1, 1, bc); } break; }
      case 'spider': Q(2, 0, 1, 5 + j, '#bbbbbb'); Q(1, 5 + j, 3, 2, '#1b1b22'); Q(0, 5 + j, 1, 1, '#1b1b22'); Q(4, 5 + j, 1, 1, '#1b1b22'); Q(0, 7 + j, 1, 1, '#1b1b22'); Q(4, 7 + j, 1, 1, '#1b1b22'); Q(1, 5 + j, 1, 1, '#ff3a3a'); Q(3, 5 + j, 1, 1, '#ff3a3a'); break;
      case 'dog': { const c = '#c98a3a'; Q(0, 31, 5, 2, c); Q(4, 29, 2, 3, c); Q(5, 28, 1, 1, shade(c)); Q(6, 30, 1, 1, DARK); Q(5, 29, 1, 1, DARK); Q(k ? 0 : 1, 30, 1, 1, c); Q(k, 33, 1, 2, c); Q(3 + k, 33, 1, 2, c); Q(4, 31, 1, 1, '#e8303a'); break; }
      case 'cat': { const c = '#3a3a44'; Q(19, 31, 4, 2, c); Q(21, 29, 3, 2, c); Q(21, 28, 1, 1, c); Q(23, 28, 1, 1, c); Q(21, 29, 1, 1, '#7dff5a'); Q(23, 29, 1, 1, '#7dff5a'); Q(18, 30 - k, 1, 2 + k, c); Q(19, 33, 1, 2, c); Q(22, 33, 1, 2, c); break; }
    }
  }
}

function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function shade(hex) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${r * 0.65 | 0},${g * 0.65 | 0},${b * 0.65 | 0})`;
}

export function drawStrip(C, opts = {}) {
  const cv = document.createElement('canvas'); cv.width = FW * NF; cv.height = FH;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (!opts.ghost) { for (let f = 0; f < NF; f++) drawFrame(ctx, f * FW, f, C); return cv; }
  // призрак-охотник: аура-обводка цвета призрака вокруг силуэта, поверх сам скелет с хвостом
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH; const t = tmp.getContext('2d'); t.imageSmoothingEnabled = false;
  const sil = document.createElement('canvas'); sil.width = FW; sil.height = FH; const s = sil.getContext('2d'); s.imageSmoothingEnabled = false;
  const tint = rgba(opts.ghost.body, 0.22);
  for (let f = 0; f < NF; f++) {
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, FW, FH); drawFrame(t, 0, f, C, opts);
    t.globalCompositeOperation = 'source-atop'; t.fillStyle = tint; t.fillRect(0, 0, FW, FH); // спектральный оттенок костей и одежды
    s.globalCompositeOperation = 'source-over'; s.clearRect(0, 0, FW, FH); s.drawImage(tmp, 0, 0);
    s.globalCompositeOperation = 'source-in'; s.fillStyle = opts.ghost.light; s.fillRect(0, 0, FW, FH);
    ctx.save(); ctx.beginPath(); ctx.rect(f * FW, 0, FW, FH); ctx.clip(); // обводка не должна залезать в соседний кадр
    ctx.globalAlpha = 0.28; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.drawImage(sil, f * FW + dx, dy); // внешнее свечение
    ctx.globalAlpha = 0.8; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.drawImage(sil, f * FW + dx, dy); // аура-обводка
    ctx.globalAlpha = 0.92; ctx.drawImage(tmp, f * FW, 0); ctx.restore();
  }
  return cv;
}

export function drawPortrait(C, canvas, opts = {}) {
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (opts.ghost) { const strip = drawStrip(C, opts); ctx.drawImage(strip, 4 * FW, 0, FW, FH, 0, 0, canvas.width, canvas.height); return; }
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH;
  const t = tmp.getContext('2d'); t.imageSmoothingEnabled = false; drawFrame(t, 0, 4, C);
  ctx.drawImage(tmp, 0, 0, FW, FH, 0, 0, canvas.width, canvas.height);
}

// --- призраки-простыни: убитый прохожий голубой, упокоенный игрок золотой; охотник — зелёный скелет с хвостом и аурой.
// Два варианта подола чередуются по кадрам.
export const GHOSTS = {
  npc: { body: '#5ad8ff', light: '#c2efff', dark: '#2a9fd0', eye: '#0b0b0b' },
  player: { body: '#ffd23a', light: '#fff0a6', dark: '#c99a00', eye: '#0b0b0b' },
  hunter: { body: '#4df21e', light: '#9dff7a', dark: '#2fb312', eye: '#0b0b0b' },
};
export const GHOST = GHOSTS.npc;
export function drawGhostFrame(ctx, ox, f, GHOST = GHOSTS.npc) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(ox + x, y, w, h); };
  R(8, 6, 8, 1, GHOST.body); R(6, 7, 12, 1, GHOST.body); R(5, 8, 14, 1, GHOST.body); R(4, 9, 16, 20, GHOST.body);
  R(4, 9, 1, 20, GHOST.dark); R(19, 9, 1, 20, GHOST.dark); R(6, 10, 1, 9, GHOST.light); R(7, 9, 2, 1, GHOST.light);
  if (f % 2 === 0) { R(4, 29, 3, 2, GHOST.body); R(9, 29, 3, 3, GHOST.body); R(14, 29, 3, 2, GHOST.body); R(17, 29, 3, 1, GHOST.body); R(10, 31, 1, 1, GHOST.dark); }
  else { R(5, 29, 3, 3, GHOST.body); R(10, 29, 3, 2, GHOST.body); R(15, 29, 4, 3, GHOST.body); R(16, 31, 1, 1, GHOST.dark); }
  R(8, 13, 2, 3, GHOST.eye); R(14, 13, 2, 3, GHOST.eye); R(11, 19, 2, 3, GHOST.eye); R(8, 13, 1, 1, '#ffffff'); R(14, 13, 1, 1, '#ffffff');
}
export function drawGhostStrip(G = GHOSTS.npc) {
  const cv = document.createElement('canvas'); cv.width = FW * NF; cv.height = FH;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < NF; f++) drawGhostFrame(ctx, f * FW, f, G);
  return cv;
}
export function drawGhostPortrait(canvas, G = GHOSTS.npc) {
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH; const t = tmp.getContext('2d'); drawGhostFrame(t, 0, 0, G);
  ctx.drawImage(tmp, 0, 0, FW, FH, 0, 0, canvas.width, canvas.height);
}

// --- конфета: подбирается игроком, +1 сердце
export function drawCandy(color = '#ff5fa2') {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 12; const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(5, 3, 6, 6, color); R(6, 2, 4, 8, color); R(6, 4, 1, 2, '#ffffff'); R(8, 3, 1, 1, '#ffffff');
  R(2, 4, 3, 1, color); R(1, 3, 2, 1, color); R(2, 7, 3, 1, color); R(1, 8, 2, 1, color); R(3, 5, 2, 2, color);
  R(11, 4, 3, 1, color); R(13, 3, 2, 1, color); R(11, 7, 3, 1, color); R(13, 8, 2, 1, color); R(11, 5, 2, 2, color);
  R(5, 9, 6, 1, '#1b1326'); R(7, 10, 2, 1, '#1b1326');
  return cv;
}
