// Сборка города из запечённых OSM-данных по тайлам: здания, дороги, вода, парки,
// деревья, тыквы у подъездов, фонари. Каждый тайл — своя группа, которую можно выгрузить.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const C = {
  ground: 0x261c36, green: 0x26381f, forest: 0x1c2c1a, water: 0x16254e,
  major: 0x4e4460, minor: 0x443a54, service: 0x3a3148, path: 0x5e516e, rail: 0x5a4c66,
  res: 0xa696bc, com: 0x93a4c2, pub: 0xcdb892, church: 0xeadbb4, ind: 0x80758f, yes: 0xa092ad,
};
const vary = (hex, seed, amt = 0.12) => {
  const c = new THREE.Color(hex); const k = 1 + (seed - 0.5) * 2 * amt;
  c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return c;
};
// детерминированный шум по координате: цвет здания не меняется при перезагрузке тайла
const hashf = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
const makeRnd = seed => { let s = (seed >>> 0) || 1234567; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function toShape(p, holes) {
  const pts = []; for (let i = 0; i < p.length; i += 2) pts.push(new THREE.Vector2(p[i], -p[i + 1]));
  if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 0.01) pts.pop();
  if (pts.length < 3) return null;
  const sh = new THREE.Shape(pts);
  if (holes) for (const h of holes) {
    const hp = []; for (let i = 0; i < h.length; i += 2) hp.push(new THREE.Vector2(h[i], -h[i + 1]));
    if (hp.length > 2) sh.holes.push(new THREE.Path(hp));
  }
  return sh;
}
function colorize(geo, color) {
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
}
function flatPolys(list, y, colorFn) {
  const geos = [];
  for (const it of list) {
    const sh = toShape(it.p, it.holes); if (!sh) continue;
    try {
      const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
      geos.push(colorize(g, colorFn(it)));
    } catch (e) { /* кривой полигон, пропускаем */ }
  }
  return geos.length ? mergeGeometries(geos, false) : null;
}

// плоские ленты для дорог
class FlatBuilder {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, col) {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2];
    if (ux * vz - uz * vx > 0) { const t = b; b = c; c = t; } // нормаль вверх
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.col.push(col.r, col.g, col.b); }
  }
  ribbon(p, w, y, col) {
    const hw = w / 2;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3];
      let dx = x1 - x0, dz = z1 - z0; const len = Math.hypot(dx, dz); if (len < 0.01) continue; dx /= len; dz /= len;
      const nx = -dz * hw, nz = dx * hw;
      const a = [x0 + nx, y, z0 + nz], b = [x1 + nx, y, z1 + nz], c = [x1 - nx, y, z1 - nz], d = [x0 - nx, y, z0 - nz];
      this.tri(a, b, c, col); this.tri(a, c, d, col);
      if (i > 0 && w > 3) this.disc(x0, z0, hw, y, col, 6);
    }
  }
  disc(x, z, r, y, col, n) {
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      this.tri([x, y, z], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], col);
    }
  }
  build() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const n = this.pos.length / 3, nor = new Float32Array(n * 3); for (let i = 0; i < n; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return g;
  }
}

// материал зданий: окна считаются в шейдере по мировым координатам
function buildingMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLit = { value: 0.38 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uLit;\nfloat hash21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 n = normalize(vWN);
          if (abs(n.y) < 0.35 && vWP.y > 1.2) {
            float along = abs(n.x) > abs(n.z) ? vWP.z : vWP.x;
            vec2 g = vec2(along / 3.2, (vWP.y - 1.2) / 3.1);
            vec2 cell = floor(g); vec2 f = fract(g);
            float h = hash21(cell + vec2(n.x * 7.0, n.z * 13.0));
            if (f.x > 0.32 && f.x < 0.68 && f.y > 0.3 && f.y < 0.75) {
              if (h < uLit) {
                vec3 wc = h < uLit * 0.3 ? vec3(1.0, 0.45, 0.10) : vec3(1.0, 0.80, 0.38);
                totalEmissiveRadiance += wc * 0.95; diffuseColor.rgb = wc * 0.3;
              } else diffuseColor.rgb *= 0.35;
            }
          } else if (n.y > 0.5) { diffuseColor.rgb *= 0.8; } }`);
  };
  return m;
}

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] * p[i + 1] - p[i] * p[j + 1]); return a / 2; }

// --- маркеры заведений: оранжевая пиксельная тыква парит над крышей
function pumpkinTexture(glow) {
  const cv = document.createElement('canvas'); cv.width = 18; cv.height = 18; const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  if (glow) { R(1, 4, 16, 13, '#ffd23a'); R(2, 3, 14, 15, '#ffd23a'); }
  R(2, 5, 14, 11, '#ff8a2a'); R(3, 4, 12, 13, '#ff8a2a'); R(4, 3, 10, 1, '#ff8a2a');
  R(5, 4, 1, 12, '#d05a10'); R(9, 3, 1, 14, '#d05a10'); R(12, 4, 1, 12, '#d05a10');
  R(8, 1, 2, 3, '#2fb312'); R(10, 1, 1, 1, '#2fb312');
  R(5, 7, 3, 2, '#1b0b0b'); R(10, 7, 3, 2, '#1b0b0b'); R(8, 10, 2, 1, '#1b0b0b');
  R(5, 12, 8, 1, '#1b0b0b'); R(4, 11, 1, 1, '#1b0b0b'); R(13, 11, 1, 1, '#1b0b0b'); R(7, 13, 1, 1, '#1b0b0b'); R(10, 13, 1, 1, '#1b0b0b');
  if (glow) { R(6, 7, 1, 1, '#ffd23a'); R(11, 7, 1, 1, '#ffd23a'); }
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export function buildMarkers(venues, danceZones) {
  const group = new THREE.Group();
  const texA = pumpkinTexture(false), texB = pumpkinTexture(true);
  const sprites = [];
  for (const v of venues) {
    if (v.top == null) v.top = 6;
    const major = v.type === 'nightclub' || v.type === 'event' || v.events.length > 0;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: major ? texB : texA, transparent: true, alphaTest: 0.5, fog: false }));
    sp.center.set(0.5, 0); sp.position.set(v.x, v.top + 2, v.z); sp.userData.venue = v; sp.userData.major = major; sp.userData.phase = Math.random() * 6;
    group.add(sp); sprites.push(sp);
  }
  const zoneMat = new THREE.MeshBasicMaterial({ color: 0x5a2a0e });
  for (const z of danceZones) { const g = new THREE.TorusGeometry(z[3], 1.0, 4, 32); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, zoneMat); m.position.set(z[0], 0.5, z[1]); group.add(m); }
  let size = 7;
  return {
    group, pickables: sprites,
    setScale(h) { size = h * 0.85; for (const sp of sprites) { const k = sp.userData.major ? 1.5 : 1; sp.scale.set(size * k, size * k, 1); } },
    update(t) { for (const sp of sprites) sp.position.y = sp.userData.venue.top + 2 + Math.sin(t * 2 + sp.userData.phase) * 1.2; },
  };
}

// --- общие материалы и геометрии для всех тайлов
export function makeMaterials() {
  return {
    flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    water: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0b1a3a, emissiveIntensity: 0.6 }),
    building: buildingMaterial(),
    tree: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x2b1d2a }),
    pumpkin: new THREE.MeshLambertMaterial({ color: 0xd05a10, emissive: 0xff7a1a, emissiveIntensity: 0.7 }),
    lamp: new THREE.PointsMaterial({ color: 0xffb75a, size: 1.6, sizeAttenuation: false }),
    cone: new THREE.ConeGeometry(2.0, 6.5, 5), blob: new THREE.IcosahedronGeometry(2.4, 0), trunkG: new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5),
    pumpG: (() => { const g = new THREE.SphereGeometry(0.9, 6, 4); g.scale(1, 0.75, 1); return g; })(),
  };
}

export function buildGround(size = 60000) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: C.ground }));
  ground.rotateX(-Math.PI / 2); ground.position.y = -0.05; return ground;
}

const W = { major: 14, minor: 9, service: 4.5, path: 2.6 }, Y = { major: 0.42, minor: 0.38, service: 0.32, path: 0.28 };

// большие полигоны (парки, озёра), которые не влезают в тайл — рисуются всегда
export function buildBig(big, M) {
  const group = new THREE.Group();
  const green = flatPolys(big.green || [], 0.12, it => vary(it.f ? C.forest : C.green, hashf(it.p[0], it.p[1]), 0.15));
  if (green) group.add(new THREE.Mesh(green, M.flat));
  const water = flatPolys(big.water || [], 0.18, () => new THREE.Color(C.water));
  if (water) group.add(new THREE.Mesh(water, M.water));
  return group;
}

// один тайл карты
export function buildTile(t, M, seed = 1) {
  const group = new THREE.Group(); const rnd = makeRnd(seed * 2654435761);
  const stats = { trees: 0 };

  const green = flatPolys(t.green || [], 0.12, it => vary(it.f ? C.forest : C.green, hashf(it.p[0], it.p[1]), 0.15));
  if (green) group.add(new THREE.Mesh(green, M.flat));
  const water = flatPolys(t.water || [], 0.18, () => new THREE.Color(C.water));
  if (water) group.add(new THREE.Mesh(water, M.water));

  const fb = new FlatBuilder();
  for (const r of t.roads || []) fb.ribbon(r.p, r.w && r.k !== 'path' ? Math.min(r.w, 24) : W[r.k], Y[r.k], new THREE.Color(C[r.k]));
  for (const r of t.rails || []) fb.ribbon(r.p, r.k === 'tram' ? 2.2 : 3.2, 0.45, new THREE.Color(C.rail));
  for (const r of t.river || []) fb.ribbon(r.p, 26, 0.2, new THREE.Color(C.water));
  const roadGeo = fb.build(); if (roadGeo) group.add(new THREE.Mesh(roadGeo, M.flat));

  const bgeos = []; const skip = M.skip || [], tarot = M.tarot || [];
  for (const b of t.buildings || []) {
    const bx = b.p[0], bz = b.p[1];
    if (skip.some(z => (bx - z[0]) ** 2 + (bz - z[1]) ** 2 < z[2] * z[2])) continue; // под особым зданием
    const sh = toShape(b.p, b.holes); if (!sh) continue;
    // дом с арканой таро: зелёный
    const marked = tarot.some(z => pointInPoly(z[0], z[1], b.p) || (bx - z[0]) ** 2 + (bz - z[1]) ** 2 < 30 * 30);
    try {
      const g = new THREE.ExtrudeGeometry(sh, { depth: b.h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      bgeos.push(colorize(g, marked ? vary(0x5fe060, hashf(bx, bz), 0.1) : vary(C[b.t] || C.yes, hashf(bx, bz), 0.18)));
    } catch (e) { /* пропускаем */ }
  }
  if (bgeos.length) { const bgeo = mergeGeometries(bgeos, false); bgeo.computeVertexNormals(); group.add(new THREE.Mesh(bgeo, M.building)); }

  // деревья: из OSM плюс насыпанные в парки
  const treePts = (t.trees || []).map(tr => [tr[0], tr[1]]);
  for (const g of t.green || []) {
    const a = Math.abs(polyArea(g.p)); if (a < 200) continue;
    let n = Math.min(300, Math.floor(a / 260));
    let xs = Infinity, xe = -Infinity, zs = Infinity, ze = -Infinity;
    for (let i = 0; i < g.p.length; i += 2) { xs = Math.min(xs, g.p[i]); xe = Math.max(xe, g.p[i]); zs = Math.min(zs, g.p[i + 1]); ze = Math.max(ze, g.p[i + 1]); }
    let tries = n * 6;
    while (n > 0 && tries-- > 0) {
      const x = xs + rnd() * (xe - xs), z = zs + rnd() * (ze - zs);
      if (!pointInPoly(x, z, g.p)) continue;
      if (g.holes && g.holes.some(h => pointInPoly(x, z, h))) continue;
      treePts.push([x, z]); n--;
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  if (treePts.length) {
    const crownCols = [0xd2601a, 0xe0a020, 0xb0301a, 0x2a4a28, 0x3a2650, 0x7a3a14, 0x355a2a];
    const coneM = new THREE.InstancedMesh(M.cone, M.tree, treePts.length);
    const blobM = new THREE.InstancedMesh(M.blob, M.tree, treePts.length);
    const trunkM = new THREE.InstancedMesh(M.trunkG, M.trunk, treePts.length);
    let nc = 0, nb = 0;
    treePts.forEach(([x, z], i) => {
      const sc = 0.7 + rnd() * 0.8, isCone = rnd() < 0.35;
      q.identity();
      m4.compose(v.set(x, 1.6 * sc, z), q, s.set(sc, sc, sc)); trunkM.setMatrixAt(i, m4);
      const col = new THREE.Color(crownCols[Math.floor(rnd() * crownCols.length)]);
      q.setFromAxisAngle(up, rnd() * 6);
      if (isCone) { m4.compose(v.set(x, 6.4 * sc, z), q, s.set(sc, sc, sc)); coneM.setMatrixAt(nc, m4); coneM.setColorAt(nc, col); nc++; }
      else { m4.compose(v.set(x, 4.8 * sc, z), q, s.set(sc, sc * 0.9, sc)); blobM.setMatrixAt(nb, m4); blobM.setColorAt(nb, col); nb++; }
    });
    coneM.count = nc; blobM.count = nb;
    for (const im of [coneM, blobM, trunkM]) { im.frustumCulled = false; }
    group.add(coneM, blobM, trunkM);
    stats.trees = treePts.length;
  }

  // тыквы у подъездов
  const blds = t.buildings || [];
  const pumpN = Math.min(90, blds.length);
  if (pumpN) {
    const pumpM = new THREE.InstancedMesh(M.pumpG, M.pumpkin, pumpN); pumpM.frustumCulled = false;
    q.identity(); let np = 0;
    for (let k = 0; k < pumpN; k++) {
      const b = blds[Math.floor(rnd() * blds.length)]; const p = b.p; if (p.length < 8) continue;
      const i = Math.floor(rnd() * (p.length / 2 - 1)) * 2;
      const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3]; const len = Math.hypot(x1 - x0, z1 - z0); if (len < 4) continue;
      const tt = 0.3 + rnd() * 0.4; let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      if (polyArea(p) > 0) { nx = -nx; nz = -nz; }
      const sc = 0.7 + rnd() * 0.6;
      m4.compose(v.set(x0 + (x1 - x0) * tt + nx * 1.6, 0.6 * sc, z0 + (z1 - z0) * tt + nz * 1.6), q, s.set(sc, sc, sc));
      pumpM.setMatrixAt(np++, m4);
    }
    pumpM.count = np; group.add(pumpM);
  }

  // фонари вдоль улиц
  const lp = [];
  for (const r of t.roads || []) {
    if (r.k !== 'major' && r.k !== 'minor') continue;
    const hw = W[r.k] / 2 + 1.5; let acc = 0;
    for (let i = 0; i + 3 < r.p.length; i += 2) {
      const x0 = r.p[i], z0 = r.p[i + 1], x1 = r.p[i + 2], z1 = r.p[i + 3]; const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.1) continue;
      const dx = (x1 - x0) / len, dz = (z1 - z0) / len;
      for (let d = 0; d < len; d += 1) {
        acc += 1;
        if (acc >= 36) { acc = 0; const x = x0 + dx * d, z = z0 + dz * d; lp.push(x - dz * hw, 6, z + dx * hw, x + dz * hw, 6, z - dx * hw); }
      }
    }
  }
  if (lp.length) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); const pts = new THREE.Points(lg, M.lamp); pts.frustumCulled = false; group.add(pts); }

  group.userData.stats = stats;
  return group;
}

// освобождаем геометрии тайла (материалы общие — их не трогаем)
export function disposeGroup(group) {
  group.traverse(o => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); if (o.isInstancedMesh) { o.dispose(); } });
}
