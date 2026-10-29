// Ленивая подгрузка тайлов карты: грузим только то, что попадает в кадр (плюс запас),
// выгружаем далёкое. Сетка улиц для скелетов при этом общая и загружена целиком.
import * as THREE from 'three';
import { buildTile, buildBig, disposeGroup, pointInPoly } from './city.js';
import { animateRoofs } from './landmarks.js';

export class TileManager {
  constructor(scene, index, mats, base = 'data/map/') {
    this.scene = scene; this.index = index; this.M = mats; this.base = base;
    this.tile = index.tile; this.keys = new Set(Object.keys(index.tiles));
    this.loaded = new Map();   // key -> group
    this.pending = new Map();  // key -> promise
    this.queue = [];           // загруженные данные, ждущие сборки (по одному тайлу за кадр)
    this.group = new THREE.Group(); scene.add(this.group);
    this.margin = 1; this.keep = 3; this.maxConcurrent = 3; this.built = 0; this.bytes = 0;
    this.wanted = new Set(); this.lastKeys = '';
    this.corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }
  async loadBig() {
    try { const big = await fetch(this.base + 'big.json').then(r => r.json()); this.group.add(buildBig(big, this.M)); } catch (e) { console.warn('big.json', e); }
  }
  key(x, z) { return Math.floor(x / this.tile) + '_' + Math.floor(z / this.tile); }
  // пересечение углов экрана с землёй: какие тайлы видны
  footprint(camera) {
    const ndc = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity; const hit = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      this.ray.setFromCamera({ x: ndc[i][0], y: ndc[i][1] }, camera);
      if (!this.ray.ray.intersectPlane(this.plane, hit)) continue;
      minx = Math.min(minx, hit.x); maxx = Math.max(maxx, hit.x); minz = Math.min(minz, hit.z); maxz = Math.max(maxz, hit.z);
    }
    if (!isFinite(minx)) return null;
    return [minx, minz, maxx, maxz];
  }
  update(camera, force) {
    const fp = this.footprint(camera); if (!fp) return;
    const T = this.tile, m = this.margin;
    const ix0 = Math.floor(fp[0] / T) - m, ix1 = Math.floor(fp[2] / T) + m, iz0 = Math.floor(fp[1] / T) - m, iz1 = Math.floor(fp[3] / T) + m;
    const sig = ix0 + ',' + ix1 + ',' + iz0 + ',' + iz1;
    if (sig !== this.lastKeys || force) {
      this.lastKeys = sig; this.wanted.clear();
      const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2; const want = [];
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) { const k = ix + '_' + iz; if (this.keys.has(k)) { this.wanted.add(k); want.push([k, (ix - cx) ** 2 + (iz - cz) ** 2]); } }
      want.sort((a, b) => a[1] - b[1]);
      for (const [k] of want) if (!this.loaded.has(k) && !this.pending.has(k)) this.request(k);
      // выгружаем то, что далеко за кадром
      const k2 = this.keep;
      for (const [k, g] of this.loaded) {
        const [ix, iz] = k.split('_').map(Number);
        if (ix < ix0 - k2 || ix > ix1 + k2 || iz < iz0 - k2 || iz > iz1 + k2) { this.group.remove(g); disposeGroup(g); this.loaded.delete(k); }
      }
    }
    // собираем тайлы в рамках бюджета кадра (хотя бы один), чтобы не было рывков
    const t0 = performance.now();
    while (this.queue.length) {
      const [k, data] = this.queue.shift();
      if (this.wanted.has(k) && !this.loaded.has(k)) { const [ix, iz] = k.split('_').map(Number); const g = buildTile(data, this.M, (ix * 73856093) ^ (iz * 19349663)); this.group.add(g); this.loaded.set(k, g); this.built++; }
      if (performance.now() - t0 > 8) break;
    }
  }
  request(k) {
    if (this.pending.size >= this.maxConcurrent) { if (!this.waiting) this.waiting = []; if (!this.waiting.includes(k)) this.waiting.push(k); return; }
    const p = fetch(this.base + 't/' + k + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(data => { this.queue.push([k, data]); this.bytes += (this.index.tiles[k]?.kb || 0); })
      .catch(e => console.warn('тайл', k, e))
      .finally(() => { this.pending.delete(k); const next = this.waiting && this.waiting.find(w => this.wanted.has(w) && !this.loaded.has(w) && !this.pending.has(w)); if (this.waiting) this.waiting = this.waiting.filter(w => w !== next); if (next) this.request(next); });
    this.pending.set(k, p);
  }
  // ждём, пока соберутся тайлы вокруг стартовой точки (для экрана загрузки)
  async ready(camera, timeout = 6000) {
    const t0 = performance.now(); this.update(camera, true);
    while (performance.now() - t0 < timeout) {
      this.update(camera);
      const done = [...this.wanted].every(k => this.loaded.has(k));
      if (done) return true;
      await new Promise(r => setTimeout(r, 30));
    }
    return false;
  }
  get stats() { return { loaded: this.loaded.size, pending: this.pending.size, queued: this.queue.length, built: this.built, kb: this.bytes }; }
  animate(t) { for (const g of this.loaded.values()) if (g.userData.anim) animateRoofs(g, t); }
  // клик по зданию: луч против зданий ближних тайлов, потом ищем именованный контур под точкой попадания
  pickBuilding(ray, gx, gz) {
    const T = this.tile; const cands = [];
    for (const [k, g] of this.loaded) {
      const [ix, iz] = k.split('_').map(Number); const x0 = ix * T, z0 = iz * T;
      if (gx < x0 - 300 || gx > x0 + T + 300 || gz < z0 - 300 || gz > z0 + T + 300) continue;
      if (g.userData.buildingMesh) cands.push(g.userData.buildingMesh);
    }
    if (!cands.length) return null;
    const hits = ray.intersectObjects(cands, false); if (!hits.length) return null;
    const h = hits[0]; const x = h.point.x, z = h.point.z; const named = h.object.parent.userData.named || [];
    let best = null, bd = 2.5 * 2.5;
    for (const b of named) {
      if (pointInPoly(x, z, b.p)) return { ...b, hit: h.point };
      for (let i = 0; i < b.p.length - 2; i += 2) { const d = segDist2(x, z, b.p[i], b.p[i + 1], b.p[i + 2], b.p[i + 3]); if (d < bd) { bd = d; best = b; } }
    }
    return best ? { ...best, hit: h.point } : { n: null, hit: h.point, h: 0 };
  }
}
function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1e-9; let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qz = az + dz * t; return (px - qx) ** 2 + (pz - qz) ** 2;
}
