// Рисованный интерфейс: пиксельные иконки 16×16 и девятисекционные рамки 24×24 рисуются canvas'ом один раз
// и попадают в CSS как data:URL (файлов-картинок в проекте нет). Иконки заменяют эмодзи в HUD, шапке, магазине,
// карточке и легенде; эмодзи остаются в пузырях речи, журнале и текстах. Тосты — стопка системных сообщений
// справа сверху. Палитра — токены из :root плюс золото и красный.
const PAL = {
  k: '#1b1326', w: '#fff8e7', e: '#e9dff7', r: '#ff3a5c', y: '#a8203a', g: '#ffd23a', h: '#a8771a', o: '#ff8a2a', n: '#4df21e', u: '#2fa812',
  p: '#d8c2ff', t: '#2b1b4e', m: '#9b8bb8', d: '#3a2a55', b: '#5ad8ff', s: '#ff5fa2', a: '#6b6b6b', c: '#c0c0c0',
};
// 16 строк по 16 знаков, '.' — прозрачно
const ICONS = {
  heart: [
    '................', '..kkk....kkk....', '.krrrk..krrrk...', 'krrrrrkkrrrrrk..', 'krwrrrrrrrrrrk..', 'krrrrrrrrrrrrk..', 'krrrrrrrrrrrrk..', '.krrrrrrrrrrk...',
    '..krrrrrrrrk....', '...krrrrrrk.....', '....krrrrk......', '.....krrk.......', '......kk........', '................', '................', '................'],
  heartEmpty: [
    '................', '..kkk....kkk....', '.kdddk..kdddk...', 'kdddddkkdddddk..', 'kddddddddddddk..', 'kddddddddddddk..', 'kddddddddddddk..', '.kddddddddddk...',
    '..kddddddddk....', '...kddddddk.....', '....kddddk......', '.....kddk.......', '......kk........', '................', '................', '................'],
  friend: [
    '................', '..kkk....kkk....', '.knnnk..knnnk...', 'knnnnnkknnnnnk..', 'knwnnnnnnnnnnk..', 'knnnnnnnnnnnnk..', 'knnnnnnnnnnnnk..', '.knnnnnnnnnnk...',
    '..knnnnnnnnk....', '...knnnnnnk.....', '....knnnnk......', '.....knnk.......', '......kk........', '................', '................', '................'],
  shield: [
    '................', '..kkkkkkkkkkkk..', '.kggggggggggggk.', '.kgoooooooooogk.', '.kgoooooooooogk.', '.kgookooookoogk.', '.kgoooooooooogk.', '.kgoooooooooogk.',
    '..kgooooooooogk.', '..kgookkkkoogk..', '...kgoooooogk...', '....kgooooogk...', '.....kgooogk....', '......kgogk.....', '.......kgk......', '........k.......'],
  coin: [
    '................', '.....kkkkkk.....', '...kkggggggkk...', '..kggggggggggk..', '.kgggghhhhggggk.', '.kgghhggggghggk.', '.kghhgggggghhgk.', '.kghhgggggghhgk.',
    '.kghhgggggghhgk.', '.kghhgggggghhgk.', '.kgghhgggghhggk.', '.kgggghhhhggggk.', '..kggggggggggk..', '...kkggggggkk...', '.....kkkkkk.....', '................'],
  token: [
    '................', '................', '..kkkkkkkkkkkk..', '.kssssssssssssk.', '.kssssssssssssk.', 'kksswswswswsskk.', '.kssssssssssssk.', '.kssssssssssssk.',
    '.kssssssssssssk.', 'kksswswswswsskk.', '.kssssssssssssk.', '.kssssssssssssk.', '..kkkkkkkkkkkk..', '................', '................', '................'],
  card: [
    '................', '...kkkkkkkkkk...', '...kwwwwwwwwk...', '...kwrwwwwwwk...', '...kwwwwwwwwk...', '...kwwwrrwwwk...', '...kwwrrrrwwk...', '...kwwrrrrwwk...',
    '...kwwwrrwwwk...', '...kwwwwwwwwk...', '...kwwwwwwwwk...', '...kwwwwwwrwk...', '...kwwwwwwwwk...', '...kkkkkkkkkk...', '................', '................'],
  skull: [
    '................', '.....kkkkkk.....', '....kwwwwwwk....', '...kwwwwwwwwk...', '...kwwwwwwwwk...', '...kwkkwwkkwk...', '...kwkkwwkkwk...', '...kwwwwwwwwk...',
    '...kwwwwkwwwk...', '....kwwwwwwk....', '....kkkkkkkk....', '.....kwkwkk.....', '.....kkkkkk.....', '................', '................', '................'],
  wanted: [
    '................', '................', '................', '.....kkkkkk.....', '...kkwwwwwwkk...', '..kwwwwkkwwwwk..', '.kwwwwkbbkwwwwk.', '.kwwwkbbbbkwwwk.',
    '.kwwwkbbkbkwwwk.', '.kwwwwkbbkwwwwk.', '..kwwwwkkwwwwk..', '...kkwwwwwwkk...', '.....kkkkkk.....', '................', '................', '................'],
  car: [
    '................', '................', '................', '................', '.....kkkkkk.....', '....koooooook...', '...kookkkkook...', '..kooooooooook..',
    '.kooooooooooook.', '.kooooooooooook.', '.kkkooooooookkk.', '.kakkoooooookak.', '..kk..kkkk..kk..', '................', '................', '................'],
  candy: [
    '................', '................', '................', '..kk........kk..', '.ksskkkkkkkkssk.', '.ksssssssssssssk', '..ksswsswsswssk.', '..kssssssssssk..',
    '..ksswsswsswssk.', '.ksssssssssssssk', '.ksskkkkkkkkssk.', '..kk........kk..', '................', '................', '................', '................'],
  arcana: [
    '................', '...kkkkkkkkkk...', '...kppppppppk...', '...kpttttttpk...', '...kptttgtttpk..', '...kpttgggttpk..', '...kptgggggtpk..', '...kpttgggttpk..',
    '...kpttgtgttpk..', '...kptttttttpk..', '...kptttttttpk..', '...kppppppppk...', '...kkkkkkkkkk...', '................', '................', '................'],
  dice: [
    '................', '.......kk.......', '.....kkeekk.....', '...kkeeeeeekk...', '..keeeekkeeeek..', '..keeekeekeeek..', '..keekeeeekeek..', '..kekkkkkkkkek..',
    '..keekeeeekeek..', '..keeekeekeeek..', '..keeeekkeeeek..', '...kkeeeeeekk...', '.....kkeekk.....', '.......kk.......', '................', '................'],
  boss: [
    '................', '................', '..k....k....k...', '..kg..kgk..gk...', '..kgk.kgk.kgk...', '..kggkkggkkggk..', '..kgggggggggggk.', '..kgggggggggggk.',
    '..kggrgggrgggk..', '..kgggggggggggk.', '..kkkkkkkkkkkk..', '................', '................', '................', '................', '................'],
  clock: [
    '................', '....kkkkkkkk....', '....kggggggk....', '.....kggggk.....', '.....kggggk.....', '......kggk......', '.......kk.......', '.......kk.......',
    '......kggk......', '.....kgeegk.....', '.....kgeegk.....', '....kgeeeegk....', '....kkkkkkkk....', '................', '................', '................'],
  sound: [
    '................', '................', '.......k........', '......kek.......', '.....keek..k....', '..kkkkeeek.ek...', '..keeeeeek.kek..', '..keeeeeekk.ek..',
    '..keeeeeekk.ek..', '..keeeeeek.kek..', '..kkkkeeek.ek...', '.....keek..k....', '......kek.......', '.......k........', '................', '................'],
  mute: [
    '................', '................', '.......k........', '......kek.......', '.....keek.......', '..kkkkeeek.r..r.', '..keeeeeek.rrrr.', '..keeeeeek..rr..',
    '..keeeeeek..rr..', '..keeeeeek.rrrr.', '..kkkkeeek.r..r.', '.....keek.......', '......kek.......', '.......k........', '................', '................'],
  map: [
    '................', '.kkkkk.kkkk.kkk.', '.kwwwkkwwwwkkwk.', '.kwwwwkwwnwwkwk.', '.kwwwwkwnwwwwwk.', '.kwwnnnnwwwwwwk.', '.kwnwwwwwwwwwwk.', '.kwwnwwwwkkwwwk.',
    '.kwwwnnnnkkwwwk.', '.kwwwwwwwnwwwwk.', '.kwwwwwwwwnwwwk.', '.kwwwkkwwwwnwwk.', '.kwwwkkwwwwwnwk.', '.kkkkk.kkkk.kkk.', '................', '................'],
  places: [
    '................', '.......kk.......', '......knk.......', '....kkkokkk.....', '...kooooooook...', '..kooooooooook..', '..kokoooookook..', '..kooooooooook..',
    '..koookookoook..', '..kookoooookok..', '...kooooooook...', '....kkoooookk...', '......kkkk......', '................', '................', '................'],
  afisha: [
    '................', '..kkkkkkkkkkkk..', '..kwwwwwwwwwwk..', '..kwrrrrrrrrwk..', '..kwwwwwwwwwwk..', '..kwkkkkkkkkwk..', '..kwwwwwwwwwwk..', '..kwkkkkkwwwwk..',
    '..kwwwwwwwwwwk..', '..kwkkkkkkkwwk..', '..kwwwwwwwwwwk..', '..kwgggwwwwwwk..', '..kwwwwwwwwwwk..', '..kkkkkkkkkkkk..', '................', '................'],
  leaders: [
    '................', '..kkkkkkkkkkkk..', '.kkggggggggggkk.', '.kgkggggggggkgk.', '.kgkggggggggkgk.', '..kkggggggggkk..', '...kggggggggk...', '....kggggggk....',
    '.....kggggk.....', '......kggk......', '......kggk......', '....kkkggkkk....', '....khhhhhhk....', '....kkkkkkkk....', '................', '................'],
  xp: [
    '................', '........kk......', '.......kgk......', '......kggk......', '.....kggk.......', '....kgggk.......', '...kggggkkkk....', '...kkkggggggk...',
    '......kkgggk....', '........kggk....', '.......kggk.....', '.......kgk......', '......kgk.......', '......kk........', '................', '................'],
  hand: [
    '................', '................', '......kkkkkk....', '.....kwwwwwwk...', '..kkkkwwwwwwk...', '.kwwwwkwrwwwk...', '.kwwwwkwwwwwk...', '.kwrwwkwwwwwk...',
    '.kwwwwkwwwwwk...', '.kwwwwkwwwrwk...', '.kwwrwkwwwwwk...', '.kwwwwkkkkkkk...', '.kwwwwk.........', '.kkkkkk.........', '................', '................'],
  beer: [
    '................', '................', '....kkkkkk......', '...kwwwwwwk.....', '..kggggggggkkk..', '..kggggggggkggk.', '..kgggggggkgkgk.', '..kgggggggkgkgk.',
    '..kgggggggkgkgk.', '..kggggggggkggk.', '..kggggggggkkk..', '..kggggggggk....', '..kggggggggk....', '...kkkkkkkk.....', '................', '................'],
  quest: [
    '................', '.....kkkkkk.....', '...kkrrrrrrkk...', '..krrkkkkkkrrk..', '.krkkwwwwwwkkrk.', '.krkwwkkkkwwkrk.', 'krkwwkrrrrkwwkrk', 'krkwkrrrrrrkwkrk',
    'krkwkrrrrrrkwkrk', 'krkwwkrrrrkwwkrk', '.krkwwkkkkwwkrk.', '.krkkwwwwwwkkrk.', '..krrkkkkkkrrk..', '...kkrrrrrrkk...', '.....kkkkkk.....', '................'],
};
const cache = new Map(); let styleEl = null;
function sheet() { if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'icons'; document.head.appendChild(styleEl); } return styleEl; }
function drawIcon(name) {
  const rows = ICONS[name]; const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const g = cv.getContext('2d');
  if (rows) for (let y = 0; y < 16; y++) { const row = rows[y] || ''; for (let x = 0; x < 16; x++) { const c = PAL[row[x]]; if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } } }
  else { g.fillStyle = PAL.m; g.fillRect(3, 3, 10, 10); }
  return cv.toDataURL('image/png');
}
function ensureIcon(name) { if (cache.has(name)) return; const url = drawIcon(name); cache.set(name, url); sheet().appendChild(document.createTextNode(`.ic-${name}{background-image:url(${url})}\n`)); }
// <i class="ic ic-имя"> размером 16×scale; стиль фона регистрируется один раз
export function icon(name, scale = 2) { ensureIcon(name); const s = 16 * scale; return `<i class="ic ic-${name}" style="width:${s}px;height:${s}px"></i>`; }
export const ICON_NAMES = Object.keys(ICONS);
export function registerIcons() { for (const n of ICON_NAMES) ensureIcon(n); }

// рамка 24×24 для border-image (срез 8): тёмная панель и светлая «карточная»
export function frame(kind) {
  const cv = document.createElement('canvas'); cv.width = 24; cv.height = 24; const g = cv.getContext('2d');
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (kind === 'light') {
    px(0, 0, 24, 24, '#fff8e7'); px(0, 0, 24, 1, '#1b1326'); px(0, 23, 24, 1, '#1b1326'); px(0, 0, 1, 24, '#1b1326'); px(23, 0, 1, 24, '#1b1326');
    px(1, 1, 22, 1, '#d9c3ff'); px(1, 1, 1, 22, '#d9c3ff'); px(1, 22, 22, 1, '#b39ddb'); px(22, 1, 1, 22, '#b39ddb');
    px(3, 3, 18, 1, '#e4d6ff'); px(3, 3, 1, 18, '#e4d6ff'); px(3, 20, 18, 1, '#e4d6ff'); px(20, 3, 1, 18, '#e4d6ff');
    for (const [x, y] of [[2, 2], [21, 2], [2, 21], [21, 21]]) px(x, y, 1, 1, '#1b1326');
  } else {
    px(0, 0, 24, 24, 'rgba(14,9,24,.93)'); px(0, 0, 24, 1, '#0b0b0b'); px(0, 23, 24, 1, '#0b0b0b'); px(0, 0, 1, 24, '#0b0b0b'); px(23, 0, 1, 24, '#0b0b0b');
    px(1, 1, 22, 2, '#3a2a55'); px(1, 1, 2, 22, '#3a2a55'); px(1, 21, 22, 2, '#2a1c40'); px(21, 1, 2, 22, '#2a1c40');
    px(3, 3, 18, 1, '#6d58a0'); px(3, 3, 1, 18, '#6d58a0'); px(3, 20, 18, 1, '#1b1326'); px(20, 3, 1, 18, '#1b1326');
    for (const [x, y] of [[1, 1], [22, 1], [1, 22], [22, 22]]) px(x, y, 1, 1, '#9b8bb8');
  }
  return `url(${cv.toDataURL('image/png')})`;
}
export function installFrames() { const r = document.documentElement.style; r.setProperty('--frame-dark', frame('dark')); r.setProperty('--frame-light', frame('light')); }

// строка статов одной функцией для HUD, карточки, профиля и доски
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export function statLine(st, opts = {}) {
  const i = n => icon(n, 1); const parts = [];
  if (st.score != null) parts.push(`<span class="pts" title="XP">${i('xp')} ${st.score}</span>`);
  if (st.hearts != null && opts.hearts !== false) parts.push(`<span title="максимум сердец">${i('heart')} ${st.hearts}</span>`);
  if (st.tail != null && opts.tail !== false) parts.push(`<span class="tl" title="друзья в хвосте">${i('friend')} ${st.tail}</span>`);
  if (st.kills != null) parts.push(`<span class="skc" title="черепа">${i('skull')} ${st.kills}</span>`);
  if (st.friends != null && opts.friends !== false) parts.push(`<span class="frc" title="друзей всего">${i('friend')} ${st.friends}</span>`);
  if (st.tarot != null) parts.push(`<span class="tc" title="арканы">${i('arcana')} ${st.tarot}${opts.arcana ? '/' + opts.arcana : ''}</span>`);
  if (st.visits != null) parts.push(`<span class="vc" title="заведений">${i('places')} ${st.visits}</span>`);
  if (st.coins != null) parts.push(`<span class="cn" title="монеты">${i('coin')} ${st.coins}</span>`);
  if (st.tokens != null) parts.push(`<span class="tk" title="спас-броски">${i('token')} ${st.tokens}</span>`);
  if (st.deaths) parts.push(`<span class="dc" title="смертей">${i('skull')} ×${st.deaths}</span>`);
  return `<span class="statLine">${parts.join('<span class="sep"> · </span>')}</span>`;
}

// тосты: стопка справа сверху под шапкой (на телефоне над нижней панелью), до четырёх, новые сверху
export function toast(html, iconName = null, ms = 2500) {
  let box = document.getElementById('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = (iconName ? icon(iconName, 1) : '') + `<span>${html}</span>`;
  box.prepend(el); while (box.children.length > 4) box.lastElementChild.remove();
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  return el;
}
export { esc as escHtml };
