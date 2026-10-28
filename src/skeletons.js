// Процедурные спрайты скелетов: кадры рисуются на canvas пиксель за пикселем,
// поверх костей накладываются слои костюма (шляпа, одежда, предмет в руке).
import { pick } from './bio.js';

export const FW = 24, FH = 36;
export const FRAMES = { walk: [0, 1, 2, 3], idle: [4], dance: [5, 6, 7, 8], drink: [9, 10], talk: [11, 12] };
export const NF = 13;

const BONES = ['#ece6c9', '#f4f1e3', '#d9d3a9', '#c9d6b0', '#d8cfc0', '#e6dcc0'];
const EYES = ['#1b1326', '#1b1326', '#ff7a1a', '#7dff5a', '#ff3a3a', '#5ad8ff', '#ffd23a'];
const CLOTH = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400', '#2c3e50', '#e84393', '#6c5ce7', '#fdcb6e', '#00b894', '#b33939', '#218c74', '#474787', '#ffb142'];
const DARK = '#1b1326';

export function randomCostume(rng, arch) {
  return {
    hat: pick(rng, arch.hats), body: pick(rng, arch.bodies), prop: pick(rng, arch.props),
    bone: pick(rng, BONES), eye: arch.id === 'vamp' ? '#ff3a3a' : pick(rng, EYES),
    c1: pick(rng, CLOTH), c2: pick(rng, CLOTH), c3: pick(rng, CLOTH),
  };
}

// позы: ноги (стопы, колени), руки (кисти), сдвиг тела, предмет виден?
function pose(f) {
  const P = { lf: [8, 35], rf: [15, 35], lk: [10, 31], rk: [13, 31], lh: [7, 25], rh: [16, 25], dy: 0, dx: 0, prop: true, mug: null, headDy: 0 };
  switch (f) {
    case 0: Object.assign(P, { lf: [6, 35], rf: [17, 35], lk: [9, 31], rk: [14, 31], lh: [16, 23], rh: [7, 23] }); break;
    case 1: Object.assign(P, { lf: [10, 35], rf: [13, 34], lk: [10, 31], rk: [13, 30], dy: -1 }); break;
    case 2: Object.assign(P, { lf: [17, 35], rf: [6, 35], lk: [14, 31], rk: [9, 31], lh: [7, 23], rh: [16, 23] }); break;
    case 3: Object.assign(P, { lf: [13, 35], rf: [10, 34], lk: [13, 31], rk: [10, 30], dy: -1 }); break;
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

export function drawFrame(ctx, ox, f, C) {
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

  // --- ноги
  L(10, 27, P.lk[0], P.lk[1], bone); L(P.lk[0], P.lk[1], P.lf[0], P.lf[1], bone);
  L(13, 27, P.rk[0], P.rk[1], bone); L(P.rk[0], P.rk[1], P.rf[0], P.rf[1], bone);
  R(P.lf[0] - 1, P.lf[1], 3, 1, bone); R(P.rf[0], P.rf[1], 3, 1, bone);
  if (C.body === 'tracksuit') { L(10, 27, P.lk[0], P.lk[1], C.c1); L(P.lk[0], P.lk[1], P.lf[0], P.lf[1] - 1, C.c1); L(13, 27, P.rk[0], P.rk[1], C.c1); L(P.rk[0], P.rk[1], P.rf[0], P.rf[1] - 1, C.c1); }

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
  }

  // --- руки
  L(8, 17, P.lh[0], P.lh[1], bone); L(15, 17, P.rh[0], P.rh[1], bone);
  if (C.body === 'hoodie' || C.body === 'tracksuit' || C.body === 'coat' || C.body === 'suit' || C.body === 'shirtTie') {
    const col = C.body === 'coat' ? '#f4f4f4' : C.body === 'shirtTie' ? '#f2f2f2' : C.body === 'suit' ? '#262633' : C.c1;
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
    R(9, 8 + hd, 2, 2, DARK); R(13, 8 + hd, 2, 2, DARK); R(11, 11 + hd, 2, 1, shade(bone));
    R(10, 9 + hd, 1, 1, C.eye); R(14, 9 + hd, 1, 1, C.eye);
    R(10, 14 + hd, 1, 1, shade(bone)); R(12, 14 + hd, 1, 1, shade(bone)); R(14, 14 + hd, 1, 1, shade(bone));
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
  }
  if (P.mug) { const m = P.mug; R(m[0], m[1], 4, 5, '#f0a020'); R(m[0], m[1] - 1, 4, 1, '#fff6e0'); R(m[0] + 4, m[1] + 1, 1, 3, '#f0a020'); R(m[0], m[1] + 1, 1, 3, '#ffd060'); }
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgb(${r * 0.65 | 0},${g * 0.65 | 0},${b * 0.65 | 0})`;
}

export function drawStrip(C) {
  const cv = document.createElement('canvas'); cv.width = FW * NF; cv.height = FH;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  for (let f = 0; f < NF; f++) drawFrame(ctx, f * FW, f, C);
  return cv;
}

export function drawPortrait(C, canvas) {
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH;
  const t = tmp.getContext('2d'); t.imageSmoothingEnabled = false; drawFrame(t, 0, 4, C);
  ctx.drawImage(tmp, 0, 0, FW, FH, 0, 0, canvas.width, canvas.height);
}
