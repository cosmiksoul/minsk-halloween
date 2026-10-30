// Миникарта в углу: вся пешеходная сеть серым (проспекты светлее) рисуется один раз в офскрин, заведения точками;
// поверх — свой скелет, охотники, боссы часа и рамка видимой области. Клик или перетаскивание — камера в эту точку мира.
const BG = '#120b1f', ROAD = '#6d58a0', MAJOR = '#a696bc', VENUE = '#ff8a2a', VIEW = '#fff8e7', ME = '#4df21e', HUNTER = '#ff3a5c', BOSS = '#ffd23a', INK = '#1b1326';

export class Minimap {
  constructor({ canvas, graph, venues = [], bbox, onJump, px = 360 }) {
    this.cv = canvas; this.graph = graph; this.venues = venues; this.onJump = onJump;
    const [x0, z0, x1, z1] = bbox; this.x0 = x0; this.z0 = z0; this.w = x1 - x0; this.h = z1 - z0;
    this.pw = px; this.ph = Math.max(40, Math.round(px * this.h / this.w)); this.scale = px / this.w; // без полей: холст повторяет пропорции города
    canvas.width = this.pw; canvas.height = this.ph;
    this.bg = this.buildBg();
    this.bind();
  }
  toPx(x, z) { return [(x - this.x0) * this.scale, (z - this.z0) * this.scale]; }
  toWorld(px, pz) { return [this.x0 + px / this.scale, this.z0 + pz / this.scale]; }
  buildBg() {
    const cv = document.createElement('canvas'); cv.width = this.pw; cv.height = this.ph; const g = cv.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, this.pw, this.ph);
    const G = this.graph; if (!G) return cv;
    const pass = (major, color, alpha, lw) => {
      g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = lw; g.beginPath();
      for (let i = 0; i < G.x.length; i++) {
        if (G.ok && !G.ok[i]) continue; const ax = (G.x[i] - this.x0) * this.scale, az = (G.z[i] - this.z0) * this.scale;
        for (const e of G.adj[i]) { if (e.to < i || !!e.major !== major) continue; g.moveTo(ax, az); g.lineTo((G.x[e.to] - this.x0) * this.scale, (G.z[e.to] - this.z0) * this.scale); }
      }
      g.stroke();
    };
    pass(false, ROAD, 0.45, 1); pass(true, MAJOR, 0.9, 1.2); // дворы и тротуары тусклее, проспекты читаются
    g.globalAlpha = 1; g.fillStyle = VENUE; for (const v of this.venues) { const [px, pz] = this.toPx(v.x, v.z); g.fillRect(Math.round(px) - 1, Math.round(pz) - 1, 2, 2); }
    return cv;
  }
  // динамика: рамка кадра (минимум 4 px, чтобы была видна при любом зуме), боссы золотым, охотники красным, свой скелет зелёным с тёмной обводкой
  draw({ player = null, hunters = [], bosses = [], footprint = null } = {}) {
    if (this.cv.hidden) return;
    const g = this.cv.getContext('2d'); g.drawImage(this.bg, 0, 0);
    if (footprint) {
      const [ax, az] = this.toPx(footprint[0], footprint[1]), [bx, bz] = this.toPx(footprint[2], footprint[3]);
      g.strokeStyle = VIEW; g.lineWidth = 2; g.globalAlpha = 0.9; g.strokeRect(Math.round(ax) + 0.5, Math.round(az) + 0.5, Math.max(4, Math.round(bx - ax)), Math.max(4, Math.round(bz - az))); g.globalAlpha = 1;
    }
    const dot = (a, c, r) => { const [px, pz] = this.toPx(a.x, a.z); g.fillStyle = c; g.fillRect(Math.round(px) - r, Math.round(pz) - r, r * 2, r * 2); };
    for (const a of bosses) dot(a, BOSS, 3);
    for (const a of hunters) dot(a, HUNTER, 3);
    if (player) { dot(player, INK, 5); dot(player, ME, 3); }
  }
  bind() {
    const cv = this.cv; let down = false;
    const jump = e => {
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      const [x, z] = this.toWorld((e.clientX - r.left) / r.width * this.pw, (e.clientY - r.top) / r.height * this.ph);
      this.onJump(Math.max(this.x0, Math.min(this.x0 + this.w, x)), Math.max(this.z0, Math.min(this.z0 + this.h, z)));
    };
    cv.addEventListener('pointerdown', e => { down = true; try { cv.setPointerCapture(e.pointerId); } catch { } jump(e); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (down) jump(e); });
    for (const ev of ['pointerup', 'pointercancel']) cv.addEventListener(ev, () => { down = false; });
  }
}
