// Особые здания, которые рисуются всегда и не зависят от тайлов. Пока одно:
// башня «Футурис» на Независимости, 173 с зелёным LED-фасадом: диодные колонки,
// бегущие волны света, буква B на фасаде и логотип на торцах; раз в цикл фасад
// гаснет на миг, и остаётся одна B. Координаты и размеры — по контуру здания из OSM.
import * as THREE from 'three';

export const LANDMARKS = [
  // башня — квадратный блок в северном конце контура «БЦ Футурис», к югу от неё низкое крыло
  { id: 'futuris', name: 'Башня «Футурис»', lat: 53.94120, lon: 27.66725, w: 40, d: 40, h: 104, rot: -0.07, zone: 110,
    wing: { dx: 0, dz: 74, w: 28, d: 108, h: 22 } },
];

function pixTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function letterB(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  const x0 = Math.round(W * 0.2), y0 = Math.round(H * 0.18), bw = Math.round(W * 0.6), bh = Math.round(H * 0.64), t = Math.max(2, Math.round(W * 0.16));
  g.fillRect(x0, y0, t, bh);
  g.fillRect(x0, y0, Math.round(bw * 0.75), t); g.fillRect(x0, y0 + Math.round(bh / 2) - Math.round(t / 2), Math.round(bw * 0.8), t); g.fillRect(x0, y0 + bh - t, Math.round(bw * 0.9), t);
  g.fillRect(x0 + Math.round(bw * 0.75) - t, y0, t, Math.round(bh / 2)); g.fillRect(x0 + Math.round(bw * 0.9) - t, y0 + Math.round(bh / 2), t, Math.round(bh / 2));
}
function logo(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  const cx = W / 2, r = W * 0.3; g.beginPath(); g.arc(cx, H * 0.36, r, 0, Math.PI * 2); g.fill();
  const s = W * 0.56; g.fillRect(cx - s / 2, H * 0.5, s, s * 0.9);
}

const VERT = `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
uniform float time; uniform sampler2D tB; uniform sampler2D tLogo; uniform float cols; uniform float colsSide;
varying vec2 vUv; varying vec3 vN;
void main(){
  if (abs(vN.y) > 0.5) { gl_FragColor = vec4(0.05, 0.04, 0.08, 1.0); return; }
  bool side = abs(vN.x) > 0.5;
  float n = side ? colsSide : cols;
  float led = step(0.32, fract(vUv.x * n));
  float rows = 0.8 + 0.2 * step(0.3, fract(vUv.y * n * 2.2));
  float phase = fract(time / 16.0);
  vec3 green = vec3(0.12, 0.95, 0.30);
  // волна света бежит снизу вверх по колонкам, поверх — медленное дыхание всего фасада
  float wave = 0.6 + 0.4 * sin(vUv.y * 26.0 - time * 2.5);
  float breath = 0.85 + 0.15 * sin(time * 0.8);
  float mask;
  if (side) mask = texture2D(tLogo, vUv).r;
  else mask = texture2D(tB, vec2(vUv.x, fract(vUv.y - time * 0.045))).r;
  vec3 col = mix(green * 0.45 * wave * breath, vec3(0.96, 0.98, 1.0), mask);
  // раз в цикл фасад гаснет на миг, и остаётся одна буква B — как в легенде
  float blink = 1.0 - smoothstep(0.0, 0.025, abs(phase - 0.25));
  col = mix(col, vec3(0.02, 0.02, 0.04) + vec3(0.96, 0.98, 1.0) * mask, blink * 0.95);
  gl_FragColor = vec4(col * led * rows, 1.0);
}`;

export function buildLandmarks(center) {
  const group = new THREE.Group(); const [lat0, lon0] = center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
  const mats = []; const zones = []; const items = [];
  const dark = new THREE.MeshLambertMaterial({ color: 0x241838 });
  for (const lm of LANDMARKS) {
    const x = (lm.lon - lon0) * kx, z = -(lm.lat - lat0) * kz;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { time: { value: 0 }, tB: { value: pixTex(24, 52, letterB) }, tLogo: { value: pixTex(16, 52, logo) }, cols: { value: lm.w / 0.8 }, colsSide: { value: lm.d / 0.8 } } });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(lm.w, lm.h, lm.d), mat); mesh.position.set(x, lm.h / 2, z); mesh.rotation.y = lm.rot;
    // тёмный цоколь и зелёные маяки на крыше
    const base = new THREE.Mesh(new THREE.BoxGeometry(lm.w + 6, 3, lm.d + 6), dark); base.position.set(x, 1.5, z); base.rotation.y = lm.rot;
    // смещение в локальных осях башни -> мировые координаты
    const loc = (dx, dz) => [x + dx * Math.cos(lm.rot) + dz * Math.sin(lm.rot), z - dx * Math.sin(lm.rot) + dz * Math.cos(lm.rot)];
    const pts = []; for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = loc(sx * lm.w / 2 * 0.9, sz * lm.d / 2 * 0.9); pts.push(px, lm.h + 2, pz); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const beacons = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0x4df21e, size: 3, sizeAttenuation: false }));
    group.add(mesh, base, beacons);
    // низкое крыло здания (по контуру из OSM), без подсветки
    if (lm.wing) { const w = lm.wing; const [wx, wz] = loc(w.dx, w.dz); const wing = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), dark); wing.position.set(wx, w.h / 2, wz); wing.rotation.y = lm.rot; group.add(wing); }
    mats.push(mat); zones.push([x, z, lm.zone]); items.push({ ...lm, x, z, mesh, beacons });
  }
  return { group, zones, items, update(t) { for (const m of mats) m.uniforms.time.value = t; for (const it of items) it.beacons.visible = Math.floor(t * 1.5) % 2 === 0; } };
}
