// Сборка города из запечённых OSM-данных: здания, дороги, вода, парки, деревья, тыквы, фонари.
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
const rnd = (() => { let s = 1234567; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

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

function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function polyArea(p) { let a = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += (p[j] * p[i + 1] - p[i] * p[j + 1]); return a / 2; }

export function buildCity(data) {
  const group = new THREE.Group();
  const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  // земля
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: C.ground }));
  ground.rotateX(-Math.PI / 2); ground.position.y = -0.05; group.add(ground);

  // парки, вода
  const green = flatPolys(data.green, 0.12, it => vary(it.f ? C.forest : C.green, rnd(), 0.15));
  if (green) group.add(new THREE.Mesh(green, flatMat));
  const water = flatPolys(data.water, 0.18, () => new THREE.Color(C.water));
  if (water) group.add(new THREE.Mesh(water, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0b1a3a, emissiveIntensity: 0.6 })));

  // дороги, рельсы, река
  const fb = new FlatBuilder();
  const W = { major: 14, minor: 9, service: 4.5, path: 2.6 }, Y = { major: 0.42, minor: 0.38, service: 0.32, path: 0.28 };
  for (const r of data.roads) fb.ribbon(r.p, r.w && r.k !== 'path' ? Math.min(r.w, 24) : W[r.k], Y[r.k], new THREE.Color(C[r.k]));
  for (const r of data.rails) fb.ribbon(r.p, r.k === 'tram' ? 2.2 : 3.2, 0.45, new THREE.Color(C.rail));
  for (const r of data.river) fb.ribbon(r.p, 26, 0.2, new THREE.Color(C.water));
  group.add(new THREE.Mesh(fb.build(), flatMat));

  // здания
  const bgeos = [];
  for (const b of data.buildings) {
    const sh = toShape(b.p, b.holes); if (!sh) continue;
    try {
      const g = new THREE.ExtrudeGeometry(sh, { depth: b.h, bevelEnabled: false, curveSegments: 1 });
      g.rotateX(-Math.PI / 2);
      bgeos.push(colorize(g, vary(C[b.t] || C.yes, rnd(), 0.18)));
    } catch (e) { /* пропускаем */ }
  }
  const bgeo = mergeGeometries(bgeos, false); bgeo.computeVertexNormals();
  group.add(new THREE.Mesh(bgeo, buildingMaterial()));

  // деревья: из OSM плюс насыпанные в парки
  const treePts = data.trees.map(t => [t[0], t[1]]);
  for (const g of data.green) {
    const a = Math.abs(polyArea(g.p)); if (a < 200) continue;
    let n = Math.min(400, Math.floor(a / 260));
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
  const crownCols = [0xd2601a, 0xe0a020, 0xb0301a, 0x2a4a28, 0x3a2650, 0x7a3a14, 0x355a2a];
  const cone = new THREE.ConeGeometry(2.0, 6.5, 5), blob = new THREE.IcosahedronGeometry(2.4, 0), trunk = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 5);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // цвет задаётся на инстанс
  const coneM = new THREE.InstancedMesh(cone, treeMat, treePts.length);
  const blobM = new THREE.InstancedMesh(blob, treeMat, treePts.length);
  const trunkM = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x2b1d2a }), treePts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
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
  coneM.count = nc; blobM.count = nb; group.add(coneM, blobM, trunkM);

  // тыквы у подъездов
  const pumpN = Math.min(700, data.buildings.length);
  const pumpG = new THREE.SphereGeometry(0.9, 6, 4); pumpG.scale(1, 0.75, 1);
  const pumpM = new THREE.InstancedMesh(pumpG, new THREE.MeshLambertMaterial({ color: 0xd05a10, emissive: 0xff7a1a, emissiveIntensity: 0.7 }), pumpN);
  q.identity();
  let np = 0;
  for (let k = 0; k < pumpN; k++) {
    const b = data.buildings[Math.floor(rnd() * data.buildings.length)]; const p = b.p; if (p.length < 8) continue;
    const i = Math.floor(rnd() * (p.length / 2 - 1)) * 2;
    const x0 = p[i], z0 = p[i + 1], x1 = p[i + 2], z1 = p[i + 3]; const len = Math.hypot(x1 - x0, z1 - z0); if (len < 4) continue;
    const t = 0.3 + rnd() * 0.4; let nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
    if (polyArea(p) > 0) { nx = -nx; nz = -nz; }
    const sc = 0.7 + rnd() * 0.6;
    m4.compose(v.set(x0 + (x1 - x0) * t + nx * 1.6, 0.6 * sc, z0 + (z1 - z0) * t + nz * 1.6), q, s.set(sc, sc, sc));
    pumpM.setMatrixAt(np++, m4);
  }
  pumpM.count = np; group.add(pumpM);

  // фонари вдоль улиц
  const lp = [];
  for (const r of data.roads) {
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
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  group.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffb75a, size: 1.6, sizeAttenuation: false })));

  return { group, treeCount: treePts.length };
}
