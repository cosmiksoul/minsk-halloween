// Карточка-превью персонажа для соцсетей: пост (1200×630) и сторис (1080×1920), рисуется на canvas.
import { drawFrame, FW, FH } from './skeletons.js';
import { ARCANA, ARCANA_BY_ID, drawArcana } from './tarot.js';
import { ageWord } from './bio.js';
import { statsOf as progressStats } from './rules.js';

const PIX = '"Press Start 2P", monospace', MONO = '"JetBrains Mono", ui-monospace, monospace';
const C = { bg: '#120b1f', bg2: '#1b1326', ink: '#e9dff7', muted: '#9b8bb8', accent: '#ff8a2a', green: '#4df21e', gold: '#ffd23a', line: '#3a2a55', pink: '#ff5fa2' };

export async function ensureFonts() {
  try { await Promise.all([document.fonts.load(`10px ${PIX}`), document.fonts.load(`10px ${MONO}`), document.fonts.load(`bold 10px ${MONO}`)]); } catch { /* шрифты не критичны */ }
}
function portrait(costume, scale) {
  const tmp = document.createElement('canvas'); tmp.width = FW; tmp.height = FH; const t = tmp.getContext('2d'); drawFrame(t, 0, 4, costume);
  const cv = document.createElement('canvas'); cv.width = FW * scale; cv.height = FH * scale; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, cv.width, cv.height); return cv;
}
function wrap(g, text, maxW) {
  const words = String(text || '').split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
// пиксельные иконки статистики
function icon(g, kind, x, y, s) {
  const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(x + px * s, y + py * s, w * s, h * s); };
  switch (kind) {
    case 'skull': R(1, 0, 6, 5, '#9dff7a'); R(0, 1, 8, 3, '#9dff7a'); R(2, 5, 4, 2, '#9dff7a'); R(2, 2, 2, 2, '#0b0b0b'); R(5, 2, 2, 2, '#0b0b0b'); R(3, 6, 1, 1, '#0b0b0b'); R(5, 6, 1, 1, '#0b0b0b'); break;
    case 'heart': R(1, 0, 2, 1, C.green); R(5, 0, 2, 1, C.green); R(0, 1, 8, 2, C.green); R(1, 3, 6, 1, C.green); R(2, 4, 4, 1, C.green); R(3, 5, 2, 1, C.green); break;
    case 'card': R(0, 0, 7, 9, C.gold); R(1, 1, 5, 7, C.bg2); R(3, 3, 1, 3, C.gold); R(2, 4, 3, 1, C.gold); break;
    case 'pumpkin': R(1, 2, 6, 5, C.accent); R(0, 3, 8, 3, C.accent); R(3, 0, 2, 2, '#2fb312'); R(2, 3, 1, 1, '#0b0b0b'); R(5, 3, 1, 1, '#0b0b0b'); R(2, 5, 4, 1, '#0b0b0b'); break;
    case 'coin': R(2, 0, 4, 1, C.gold); R(1, 1, 6, 5, C.gold); R(2, 6, 4, 1, C.gold); R(3, 2, 2, 3, '#b8860b'); break;
    case 'token': R(0, 1, 8, 5, C.pink); R(1, 0, 6, 7, C.pink); R(3, 2, 2, 3, '#0b0b0b'); break;
  }
}
// сводка прогресса для карточки: общие правила понимают и старый формат, и v2 (стак, журнал)
function statsOf(def) { const g = def.game || {}; return { ...progressStats(g), coins: g.coins || 0, tokens: g.tokens || 0 }; }
const STAT_ROWS = [['skull', 'kills', 'черепов'], ['heart', 'friends', 'друзей'], ['card', 'tarot', 'арканов'], ['pumpkin', 'visits', 'заведений'], ['coin', 'coins', 'монет']];

export function renderShareCard(canvas, { def, costume, friends = [], format = 'post', url = '', myCard = null }) {
  const st = statsOf(def); const years = `${2026 - def.age} – 2026`;
  const meta = `${def.age} ${ageWord(def.age)} · ${def.gender === 'm' ? 'мужчина' : 'женщина'} · при жизни: ${def.job}`;
  const tarot = (def.game?.tarot || []).map(t => ARCANA_BY_ID[t.id]).filter(Boolean);
  if (format === 'story') { canvas.width = 1080; canvas.height = 1920; } else { canvas.width = 1200; canvas.height = 630; }
  const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; const W = canvas.width, H = canvas.height;
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = C.bg2; for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < W; x += 24) g.fillRect(x, y, 3, 3);
  g.strokeStyle = C.green; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, H - 24); g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 48);

  if (format === 'post') {
    const pc = portrait(costume, 8); g.fillStyle = C.bg2; g.fillRect(56, 100, pc.width + 40, pc.height + 40); g.strokeStyle = C.green; g.lineWidth = 3; g.strokeRect(56, 100, pc.width + 40, pc.height + 40); g.drawImage(pc, 76, 120);
    g.fillStyle = C.accent; g.font = `18px ${PIX}`; g.textBaseline = 'top'; g.fillText('ХЭЛЛОУИН В МИНСКЕ', 320, 52);
    g.fillStyle = C.ink; g.font = `30px ${PIX}`; g.fillText(def.name, 320, 92);
    g.fillStyle = C.muted; g.font = `22px ${MONO}`; g.fillText(meta, 320, 150);
    g.fillStyle = C.ink; g.font = `20px ${MONO}`; let y = 192; for (const line of wrap(g, def.about || '', 820).slice(0, 3)) { g.fillText(line, 320, y); y += 28; }
    let x = 320; y = 300;
    for (const [ic, key, label] of STAT_ROWS) { g.fillStyle = C.bg2; g.fillRect(x, y, 160, 70); g.strokeStyle = C.line; g.lineWidth = 2; g.strokeRect(x, y, 160, 70); icon(g, ic, x + 14, y + 14, 4); g.fillStyle = C.ink; g.font = `26px ${PIX}`; g.fillText(String(st[key]), x + 62, y + 14); g.fillStyle = C.muted; g.font = `16px ${MONO}`; g.fillText(label, x + 62, y + 46); x += 172; }
    y = 392; x = 320; for (const a of tarot.slice(0, 11)) { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 60; drawArcana(a.id, cv); g.drawImage(cv, x, y, 70, 105); x += 78; }
    if (!tarot.length) { g.fillStyle = C.muted; g.font = `18px ${MONO}`; g.fillText(`арканы таро: 0 из ${ARCANA.length}, всё впереди`, 320, 420); }
    // карты часа: XP, собранные руки и своя карта в колоде
    const handLine = `XP ${st.score}` + (st.hands ? ` · рук собрано ${st.hands} · лучшая: ${st.bestHand ? st.bestHand.name + ' ×' + st.bestHand.mult : '?'}` : '') + (myCard ? ` · карта ${myCard.label || ''}` : '');
    g.fillStyle = C.muted; g.font = `18px ${MONO}`; g.fillText(handLine, 320, 516);
    g.fillStyle = C.green; g.font = `16px ${MONO}`; g.fillText('играй: ' + url, 56, 560); g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('ночь на 1 ноября · Минск', W - 56, 560); g.textAlign = 'left';
  } else {
    // сцена: небо, луна, силуэты домов, земля, скелет с друзьями
    const grd = g.createLinearGradient(0, 40, 0, 560); grd.addColorStop(0, '#0a0514'); grd.addColorStop(1, '#2a1540'); g.fillStyle = grd; g.fillRect(30, 30, W - 60, 530);
    g.fillStyle = '#f5e9b8'; g.beginPath(); g.arc(880, 150, 46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#d8c89a'; g.fillRect(860, 130, 12, 12); g.fillRect(896, 160, 8, 8);
    let seed = (def.seed || 1) >>> 0; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    g.fillStyle = '#e9dff7'; for (let i = 0; i < 40; i++) g.fillRect(40 + rnd() * (W - 80), 40 + rnd() * 300, 3, 3);
    for (let x = 40; x < W - 40;) { const w = 60 + rnd() * 120, h = 120 + rnd() * 240; g.fillStyle = ['#a696bc', '#93a4c2', '#80758f', '#cdb892'][Math.floor(rnd() * 4)]; g.fillRect(x, 470 - h, w, h); g.fillStyle = '#ffd98a'; for (let wy = 470 - h + 16; wy < 450; wy += 28) for (let wx = x + 12; wx < x + w - 14; wx += 24) if (rnd() < 0.45) g.fillRect(wx, wy, 10, 12); x += w + 8 + rnd() * 20; }
    g.fillStyle = '#4e4460'; g.fillRect(30, 470, W - 60, 90); g.fillStyle = '#5e516e'; g.fillRect(30, 470, W - 60, 6);
    for (let i = 0; i < 6; i++) { const px = 70 + i * 170 + rnd() * 40; g.fillStyle = C.accent; g.fillRect(px, 520, 26, 20); g.fillStyle = '#2fb312'; g.fillRect(px + 10, 512, 6, 8); g.fillStyle = '#0b0b0b'; g.fillRect(px + 5, 526, 5, 4); g.fillRect(px + 16, 526, 5, 4); g.fillRect(px + 7, 534, 12, 3); }
    const pc = portrait(costume, 10); g.drawImage(pc, 160, 470 - pc.height + 10);
    friends.slice(0, 4).forEach((f, i) => { const fc = portrait(f, 7); g.drawImage(fc, 420 + i * 150, 470 - fc.height + 8); });
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillStyle = C.accent; g.font = `20px ${PIX}`; g.fillText('ХЭЛЛОУИН В МИНСКЕ', W / 2, 600);
    g.fillStyle = C.ink; g.font = `40px ${PIX}`; const nameLines = wrap(g, def.name, 980); let y = 650; for (const l of nameLines) { g.fillText(l, W / 2, y); y += 54; }
    g.fillStyle = C.muted; g.font = `28px ${MONO}`; g.fillText(`${years} · Минск`, W / 2, y + 10); y += 52;
    g.fillStyle = C.ink; g.font = `26px ${MONO}`; for (const l of wrap(g, `${def.gender === 'm' ? 'Мужчина' : 'Женщина'}, ${def.age} ${ageWord(def.age)}. При жизни: ${def.job}.`, 940).slice(0, 2)) { g.fillText(l, W / 2, y); y += 36; }
    y += 14; g.fillStyle = C.muted; g.font = `24px ${MONO}`; for (const l of wrap(g, def.about || '', 900).slice(0, 5)) { g.fillText(l, W / 2, y); y += 34; }
    y += 30; g.textAlign = 'left';
    const rows = STAT_ROWS.concat([['token', 'tokens', 'спас-бросков']]); const x0 = 180;
    rows.forEach(([ic, key, label], i) => { const rx = x0 + (i % 2) * 400, ry = y + Math.floor(i / 2) * 64; icon(g, ic, rx, ry + 8, 4); g.fillStyle = C.ink; g.font = `28px ${PIX}`; g.fillText(String(st[key]), rx + 50, ry + 6); g.fillStyle = C.muted; g.font = `24px ${MONO}`; g.fillText(label, rx + 50 + 40 + String(st[key]).length * 28, ry + 12); });
    y += 3 * 64 + 20;
    if (tarot.length) { let x = 90; let row = 0; for (const a of tarot.slice(0, 12)) { const cv = document.createElement('canvas'); cv.width = 40; cv.height = 60; drawArcana(a.id, cv); g.drawImage(cv, x, y + row * 170, 100, 150); x += 150; if (x > W - 150) { x = 90; row++; } } y += (row + 1) * 170 + 10; }
    else { g.fillStyle = C.muted; g.font = `24px ${MONO}`; g.textAlign = 'center'; g.fillText(`арканы таро: 0 из ${ARCANA.length} — все ещё впереди`, W / 2, y); y += 50; g.textAlign = 'left'; }
    // ряд свечей-тыкв внизу
    const cy = Math.max(y + 20, 1640); for (let i = 0; i < 8; i++) { const cx = 150 + i * 112; g.fillStyle = '#f5efe0'; g.fillRect(cx, cy + 30, 14, 48); g.fillStyle = C.gold; g.fillRect(cx + 3, cy + 12, 8, 18); g.fillStyle = C.accent; g.fillRect(cx + 5, cy + 2, 4, 12); }
    g.textAlign = 'center'; g.fillStyle = C.muted; g.font = `22px ${MONO}`; g.fillText('Любой может прийти, бросить d20 и остаться другом. Или призраком.', W / 2, cy + 100);
    g.fillStyle = C.green; g.font = `24px ${MONO}`; g.fillText(url, W / 2, cy + 150); g.textAlign = 'left';
  }
  return canvas;
}

const enc = encodeURIComponent;
export function shareTargets(url, text) {
  return {
    threads: `https://www.threads.net/intent/post?text=${enc(text + ' ' + url)}`,
    tg: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`,
    fb: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`,
    vk: `https://vk.com/share.php?url=${enc(url)}&title=${enc(text)}`,
    inst: 'https://www.instagram.com/',
  };
}
export const canvasBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));
export function download(canvas, name) { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
export async function nativeShare(canvas, text, url) {
  if (!navigator.share) return false;
  try {
    const blob = await canvasBlob(canvas); const file = new File([blob], 'skeleton.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, url }); return true; }
    await navigator.share({ text, url }); return true;
  } catch (e) { return e && e.name === 'AbortError' ? null : false; }
}
