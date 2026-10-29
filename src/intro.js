// Интро: шесть слайдов один раз на устройство (minsk-skeletons.intro = '1'), когда своих скелетов ещё нет;
// снова открывается кнопкой «как играть» в легенде. Картинка 96×64 рисуется функциями проекта (портрет скелета,
// кубик, могила и охотник, веер карт, дом с арканом, пьедестал) и показывается втрое крупнее. Последний слайд —
// «Happy Halloween!» и ссылка на автора; после него просто карта и кнопка «создать своего скелета».
import { drawPortrait, randomCostume } from './skeletons.js';
import { makeRng, pickArchetype } from './bio.js';
import { local } from './store.js';

const $ = id => document.getElementById(id);
const px = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
function sky(g) { px(g, 0, 0, 96, 64, '#120b1f'); px(g, 76, 8, 10, 10, '#ffd23a'); px(g, 78, 10, 6, 6, '#fff0a0'); for (const [x, y] of [[8, 6], [20, 14], [40, 4], [58, 12], [90, 26], [30, 24]]) px(g, x, y, 1, 1, '#e9dff7'); }
function houses(g, y0 = 40) { const hs = [[0, 14, 22], [16, 22, 30], [40, 18, 18], [60, 26, 24], [86, 12, 10]]; for (const [x, w, h] of hs) { px(g, x, y0 + 14 - h, w, h, '#241838'); for (let wy = y0 + 17 - h; wy < y0 + 12; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) if ((wx * 7 + wy * 3) % 5 < 3) px(g, wx, wy, 2, 2, '#ffd23a'); } px(g, 0, y0 + 14, 96, 10, '#1b1326'); px(g, 0, y0 + 14, 96, 1, '#3a2a55'); }
function skeleton(g, seed, x, y, flip = false) {
  const rng = makeRng(seed); const arch = pickArchetype(rng); const tmp = document.createElement('canvas'); tmp.width = 24; tmp.height = 36; drawPortrait(randomCostume(makeRng(seed * 2654435761 + 7), arch), tmp);
  g.save(); if (flip) { g.translate(x + 24, y); g.scale(-1, 1); g.drawImage(tmp, 0, 0); } else g.drawImage(tmp, x, y); g.restore();
}
function d20(g, cx, cy, r, n) {
  g.save(); g.translate(cx, cy); g.fillStyle = '#1b1326'; g.strokeStyle = '#4df21e'; g.lineWidth = 1.5; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; const X = Math.cos(a) * r, Y = Math.sin(a) * r; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
  g.closePath(); g.fill(); g.stroke(); g.beginPath(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; const X = Math.cos(a) * r * 0.62, Y = Math.sin(a) * r * 0.62; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.closePath(); g.lineWidth = 1; g.stroke();
  g.fillStyle = '#4df21e'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 0, 1); g.restore();
}
function drawCity(g) { sky(g); houses(g); skeleton(g, 20261031, 36, 18); }
function drawDuel(g) { sky(g); houses(g); skeleton(g, 777, 10, 18); skeleton(g, 4242, 62, 18, true); d20(g, 48, 34, 9, 20); }
function drawHunter(g) {
  sky(g); houses(g);
  // могила: серый камень с крестом и холмик
  px(g, 10, 30, 14, 20, '#8a8a9a'); px(g, 12, 27, 10, 4, '#8a8a9a'); px(g, 14, 25, 6, 3, '#8a8a9a'); px(g, 16, 31, 2, 10, '#3a2a55'); px(g, 13, 34, 8, 2, '#3a2a55'); px(g, 6, 50, 22, 4, '#2d4a1a');
  // охотник: тёмный силуэт с зелёными глазами, подол волнами
  px(g, 56, 18, 14, 30, '#0b0b0b'); px(g, 58, 14, 10, 8, '#0b0b0b'); for (let i = 0; i < 4; i++) px(g, 56 + i * 4, 48 + (i % 2) * 2, 3, 3, '#0b0b0b'); px(g, 60, 17, 2, 2, '#4df21e'); px(g, 65, 17, 2, 2, '#4df21e'); px(g, 54, 20, 2, 26, 'rgba(77,242,30,.35)'); px(g, 70, 20, 2, 26, 'rgba(77,242,30,.35)');
  // красная полоса розыска
  px(g, 6, 57, 84, 5, '#1b1326'); px(g, 7, 58, 60, 3, '#ff3a5c'); for (let x = 7; x < 90; x += 17) px(g, x + 16, 57, 1, 5, '#3a2a55');
}
function drawArcana(g) {
  sky(g); houses(g);
  // зелёный дом с лучом в небо и карта таро с золотой рамкой
  px(g, 8, 30, 22, 24, '#1f6b2a'); px(g, 6, 26, 26, 5, '#4df21e'); for (let y = 34; y < 50; y += 6) px(g, 12, y, 3, 3, '#ffd23a'); px(g, 23, 34, 3, 3, '#ffd23a');
  px(g, 17, 0, 4, 27, 'rgba(77,242,30,.35)'); px(g, 18, 0, 2, 27, 'rgba(200,255,180,.55)');
  px(g, 52, 10, 30, 44, '#ffd23a'); px(g, 54, 12, 26, 40, '#1b1326'); px(g, 57, 15, 20, 34, '#2b1b4e');
  px(g, 66, 20, 2, 2, '#ffd23a'); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; px(g, 66 + Math.round(Math.cos(a) * 6), 32 + Math.round(Math.sin(a) * 6), 2, 2, '#ffd23a'); } px(g, 65, 31, 4, 4, '#fff0a0');
  g.fillStyle = '#ffd23a'; g.font = 'bold 6px monospace'; g.textAlign = 'center'; g.fillText('XVII', 67, 50);
}
function drawLeaders(g) {
  sky(g); houses(g);
  // пьедестал с тремя скелетами и кубок
  px(g, 12, 46, 22, 12, '#3a2a55'); px(g, 36, 38, 24, 20, '#6d58a0'); px(g, 62, 50, 22, 8, '#3a2a55');
  skeleton(g, 1313, 11, 16, true); skeleton(g, 2024, 36, 6); skeleton(g, 909, 61, 20);
  px(g, 84, 8, 10, 12, '#ffd23a'); px(g, 82, 10, 2, 6, '#ffd23a'); px(g, 94, 10, 2, 6, '#ffd23a'); px(g, 87, 20, 4, 4, '#ffd23a'); px(g, 85, 24, 8, 2, '#ffd23a');
  g.fillStyle = '#ffd23a'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText('1', 48, 46);
}
function drawHand(g, env) {
  sky(g); houses(g, 44);
  const cards = [[14, '♠'], [13, '♥'], [12, '♠'], [11, '♦'], [10, '♣']];
  cards.forEach(([rank, suit], i) => { const tmp = document.createElement('canvas'); tmp.width = 32; tmp.height = 44; env.drawCard(tmp, { rank, suit, state: 'up' }); const a = (i - 2) * 0.22; g.save(); g.translate(48, 66); g.rotate(a); g.drawImage(tmp, -16, -58, 32, 44); g.restore(); });
}
const SLIDES = [
  { draw: drawCity, text: 'Ты скелет в Минске. Сегодня Хэллоуин, и город не спит.' },
  { draw: drawDuel, text: 'Гуляй, подходи к прохожим и бросай d20: «сладость» — дружба, «гадость» — череп. Квесты «онбординга» ведут по первым шагам.' },
  { draw: drawHunter, text: 'Шумишь — растёт розыск, и с кладбищ выходят охотники. Увидел метку могилы — уходи дворами.' },
  { draw: drawHand, text: 'Каждый час город сдаёт «Мёртвую руку» — пять карт. Боссы с картой над головой ходят по городу: побей всех и собери руку.' },
  { draw: drawArcana, text: 'В зелёных домах с лучом спрятаны 22 аркана таро — от Национальной библиотеки до Лошицы. Открой карту: +5 XP и место в коллекции.' },
  { draw: drawLeaders, text: 'Таблица лидеров сравнивает скелеты всех игроков. Твой — внизу слева. Happy Halloween!' },
];

export function initIntro({ drawCard }) {
  let step = 0; const box = $('intro'), cv = $('inCv');
  const render = () => {
    const s = SLIDES[step]; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, cv.width, cv.height);
    try { s.draw(g, { drawCard }); } catch (e) { console.warn('интро', e); }
    $('inText').textContent = s.text; $('inStep').textContent = `${step + 1}/${SLIDES.length}`;
    $('inNext').textContent = step === SLIDES.length - 1 ? 'Happy Halloween!' : 'дальше'; $('inAuthor').hidden = step !== SLIDES.length - 1;
    for (const d of box.querySelectorAll('.inDot')) d.classList.toggle('on', +d.dataset.i === step);
  };
  const close = () => { box.hidden = true; local.set('intro', '1'); };
  const api = { show() { step = 0; box.hidden = false; render(); }, get seen() { return local.get('intro', null) === '1'; } };
  $('inNext').onclick = () => { if (step < SLIDES.length - 1) { step++; render(); } else close(); }; // после последнего слайда — карта и кнопка «создать»: форму не открываем
  $('inClose').onclick = close; box.addEventListener('click', e => { if (e.target === box) close(); });
  box.querySelector('.inDots').innerHTML = SLIDES.map((_, i) => `<i class="inDot" data-i="${i}"></i>`).join('');
  return api;
}
