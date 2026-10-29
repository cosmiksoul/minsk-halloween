// Сундуки у достопримечательностей (landmarks.SPOTS): по одному на место, раз в час по Минску на скелета.
// Подошёл под управлением — бросок d20 (Game.openChest): от 8 открыт, 20 — вдвое и жетон, 1 — мимик. Закрытый
// ждёт следующего часа. Спрайт стоит у ближайшего узла графа с двумя рёбрами, чтобы до него было дойти с улицы.
import * as THREE from 'three';
import { SPOTS } from './landmarks.js';
import { minskHour } from './rules.js';

function chestCanvas(open) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (open) { R(1, 1, 14, 5, '#a0652a'); R(2, 0, 12, 1, '#2a1608'); R(1, 6, 14, 1, '#2a1608'); R(3, 7, 10, 2, '#ffd23a'); R(4, 6, 8, 1, '#fff6c0'); }
  else { R(1, 4, 14, 5, '#a0652a'); R(2, 3, 12, 1, '#2a1608'); R(1, 9, 14, 1, '#2a1608'); }
  R(1, 9, 14, 6, '#7a4a1e'); R(0, 10, 1, 5, '#2a1608'); R(15, 10, 1, 5, '#2a1608'); R(1, 15, 14, 1, '#2a1608');
  R(7, 9, 2, 3, '#ffd23a'); R(7, 11, 2, 1, '#b8860b'); R(3, 11, 1, 3, '#2a1608'); R(12, 11, 1, 3, '#2a1608');
  return cv;
}
const tex = cv => { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };

export class Chests {
  constructor(sim, scene, spots = SPOTS) {
    this.sim = sim; this.group = new THREE.Group(); scene.add(this.group);
    this.tex = tex(chestCanvas(false)); this.texOpen = tex(chestCanvas(true)); this.items = []; this.hour = null; this.g = undefined;
    const [lat0, lon0] = sim.center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574; const g = sim.graph;
    for (const s of spots) {
      const x0 = (s.lon - lon0) * kx, z0 = -(s.lat - lat0) * kz; let node = g.nearest(x0, z0, 260);
      if (node >= 0 && g.adj[node].length < 2) { let bd = Infinity; for (const n of g.within(x0, z0, 260)) { if (g.adj[n].length < 2) continue; const d = (g.x[n] - x0) ** 2 + (g.z[n] - z0) ** 2; if (d < bd) { bd = d; node = n; } } }
      if (node < 0) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, alphaTest: 0.5, fog: false }));
      sp.center.set(0.5, 0); sp.position.set(g.x[node], 0.6, g.z[node]); sp.userData.phase = this.items.length * 0.9; sp.renderOrder = 2;
      this.group.add(sp); this.items.push({ id: s.id, name: s.name, x: g.x[node], z: g.z[node], node, sp, open: false });
    }
  }
  // открытые в этом часу этим скелетом — открытыми; без скелета все закрыты
  sync(g) {
    this.g = g; this.hour = minskHour(Date.now()); const seen = g && g.chests && typeof g.chests === 'object' ? g.chests : {};
    for (const c of this.items) { const open = seen[c.id] === this.hour; if (open !== c.open) { c.open = open; c.sp.material.map = open ? this.texOpen : this.tex; c.sp.material.needsUpdate = true; } }
  }
  update(player, H, t, g, canOpen, onReach) {
    if (g !== this.g || minskHour(Date.now()) !== this.hour) this.sync(g);
    const s = H * 0.7;
    for (const c of this.items) { c.sp.scale.set(s, s, 1); c.sp.position.y = 0.6 + (c.open ? 0 : Math.sin(t * 2 + c.sp.userData.phase) * 0.25); }
    if (!player || !canOpen) return;
    const r2 = Math.max(3, H * 0.5) ** 2;
    for (const c of this.items) if (!c.open && (c.x - player.x) ** 2 + (c.z - player.z) ** 2 < r2) { onReach(c); return; }
  }
}
