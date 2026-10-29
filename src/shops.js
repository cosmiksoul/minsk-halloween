// Магазины одежды на карте: торговые центры Минска. Внутри за монетки выпадает случайная вещь.
import * as THREE from 'three';

export const SHOPS = [
  { id: 'gum', name: 'ГУМ', addr: 'пр. Независимости, 21', lat: 53.9018, lon: 27.5595 },
  { id: 'cum', name: 'ЦУМ', addr: 'пр. Независимости, 54', lat: 53.9160, lon: 27.5838 },
  { id: 'galleria', name: 'Galleria Minsk', addr: 'пр. Победителей, 9', lat: 53.9105, lon: 27.5485 },
  { id: 'stolica', name: 'ТЦ «Столица»', addr: 'пл. Независимости', lat: 53.8958, lon: 27.5465 },
  { id: 'nemiga3', name: 'ТЦ «Немига 3»', addr: 'ул. Немига, 3', lat: 53.9028, lon: 27.5510 },
  { id: 'korona', name: 'Корона Сити', addr: 'ул. Кальварийская, 24', lat: 53.9068, lon: 27.5177 },
  { id: 'zybitskaya', name: 'Секонд на Зыбицкой', addr: 'ул. Зыбицкая', lat: 53.9043, lon: 27.5600 },
  { id: 'arena', name: 'Arena City', addr: 'пр. Победителей, 84', lat: 53.9290, lon: 27.5160 },
  { id: 'dana', name: 'Dana Mall', addr: 'ул. Петра Мстиславца, 11', lat: 53.9345, lon: 27.6515 },
  { id: 'expobel', name: 'Экспобел', addr: 'Логойский тракт, 37', lat: 53.9455, lon: 27.6208 },
];
export const PRICES = { hat: 3, body: 4, prop: 3, pattern: 2, face: 2, extra: 3, colors: 1 };

function shopTexture() {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16; const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(2, 3, 12, 11, '#ff5fa2'); R(1, 3, 2, 4, '#ff5fa2'); R(13, 3, 2, 4, '#ff5fa2'); R(5, 2, 6, 1, '#ff5fa2'); R(6, 3, 4, 2, '#1b1326');
  R(3, 8, 10, 1, '#ff8ac0'); R(7, 10, 2, 2, '#ffd23a'); R(1, 7, 1, 1, '#c0392b'); R(14, 7, 1, 1, '#c0392b');
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Shops {
  constructor(scene, sim, center) {
    this.group = new THREE.Group(); scene.add(this.group);
    const [lat0, lon0] = center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
    const tex = shopTexture();
    this.items = SHOPS.map(s => {
      const x = (s.lon - lon0) * kx, z = -(s.lat - lat0) * kz; const node = sim.graph.nearest(x, z, 160);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog: false })); sp.center.set(0.5, 0); sp.position.set(x, 14, z); sp.userData.phase = Math.random() * 6;
      const it = { ...s, x, z, node, sp }; sp.userData.shop = it; this.group.add(sp); return it;
    });
    this.byNode = new Map(); for (const it of this.items) if (it.node >= 0) this.byNode.set(it.node, it);
    this.pickables = this.items.map(it => it.sp);
  }
  setScale(h) { for (const it of this.items) it.sp.scale.set(h * 1.2, h * 1.2, 1); }
  update(t) { for (const it of this.items) it.sp.position.y = 14 + Math.sin(t * 2 + it.sp.userData.phase) * 1.2; }
}
