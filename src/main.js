import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { buildCity } from './city.js';
import { PixelPass } from './post.js';
import { Sim } from './sim.js';
import { drawPortrait } from './skeletons.js';
import { ageWord } from './bio.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const isMobile = innerWidth < 640;

const data = await (await fetch('data/minsk.json')).json();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1540, 2700, 4400);

// свет: луна и небо
scene.add(new THREE.HemisphereLight(0x9a86d8, 0x3a2a40, 2.2));
scene.add(new THREE.AmbientLight(0x403060, 1.0));
const moon = new THREE.DirectionalLight(0xbfc8ff, 1.8); moon.position.set(-900, 1300, 700); scene.add(moon);

const city = buildCity(data); scene.add(city.group);

// камера: ортографическая, вид сверху-сбоку
const VIEW = 260;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 7000);
const target = new THREE.Vector3(-295, 0, 55); // проспект Независимости у Октябрьской
const dist = 2500; let polar = 55 * Math.PI / 180, azim = 35 * Math.PI / 180;
camera.position.set(target.x + dist * Math.sin(polar) * Math.cos(azim), dist * Math.cos(polar), target.z + dist * Math.sin(polar) * Math.sin(azim));
camera.lookAt(target);
const controls = new MapControls(camera, canvas);
controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minZoom = 0.5; controls.maxZoom = 16; controls.minPolarAngle = 22 * Math.PI / 180; controls.maxPolarAngle = 72 * Math.PI / 180;
controls.screenSpacePanning = false; controls.zoomToCursor = true; controls.zoom0 = 1;
camera.zoom = isMobile ? 2.2 : 3; camera.updateProjectionMatrix();

const pixel = new PixelPass(renderer, 2);
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  camera.left = -VIEW * a; camera.right = VIEW * a; camera.top = VIEW; camera.bottom = -VIEW; camera.updateProjectionMatrix();
  pixel.setSize(w, h);
}
addEventListener('resize', resize); resize();

const sim = new Sim(scene, data, { skelH: 8 });
sim.setPopulation(isMobile ? 150 : 400);

// --- интерфейс
const ui = { pop: $('pop'), spd: $('spd'), pix: $('pix') };
if (isMobile) ui.pop.value = 150;
$('popV').textContent = ui.pop.value;
ui.pop.oninput = () => { $('popV').textContent = ui.pop.value; };
ui.pop.onchange = () => sim.setPopulation(+ui.pop.value);
ui.spd.oninput = () => { $('spdV').textContent = (+ui.spd.value).toLocaleString('ru-RU') + '×'; };
ui.pix.oninput = () => { $('pixV').textContent = ui.pix.value; pixel.setPixelSize(+ui.pix.value); };
$('bFold').onclick = () => $('panel').classList.toggle('folded');
if (isMobile) $('panel').classList.add('folded');
$('bReset').onclick = () => location.reload();
$('bRot').onclick = () => { rotateTo = (rotateTo ?? controls.getAzimuthalAngle()) + Math.PI / 2; };
$('bParty').onclick = () => { sim.party(controls.target.x, controls.target.z, 160); };
$('bRand').onclick = () => { const a = sim.agents[Math.floor(Math.random() * sim.agents.length)]; if (a) { showCard(a); flyTo(a.x, a.z); } };
$('bClose').onclick = () => { $('card').hidden = true; follow = null; };
$('bFollow').onclick = () => { follow = follow ? null : cardAgent; $('bFollow').classList.toggle('on', !!follow); };

let rotateTo = null, follow = null, cardAgent = null;
function flyTo(x, z) {
  const off = camera.position.clone().sub(controls.target);
  controls.target.set(x, 0, z); camera.position.copy(controls.target).add(off);
}
const stateName = { walk: 'гуляет', talk: 'болтает', drink: 'пьёт пиво', dance: 'танцует' };
function showCard(a) {
  cardAgent = a; $('card').hidden = false;
  drawPortrait(a.costume, $('cardPic'));
  $('cName').textContent = a.bio.name;
  $('cMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'}`;
  $('cJob').textContent = (a.bio.gender === 'm' ? 'При жизни: ' : 'При жизни: ') + a.bio.job;
  $('cStatus').textContent = 'Сейчас: ' + a.bio.status;
  $('bFollow').classList.toggle('on', follow === a);
}

// клик по скелету
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(sim.sprites, false);
  if (hits.length) { const a = hits[0].object.userData.agent; showCard(a); if (follow) follow = a; }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  canvas.style.cursor = ray.intersectObjects(sim.sprites, false).length ? 'pointer' : 'grab';
});

// пузыри реплик: HTML поверх холста
const bubLayer = $('bubbles'); const pool = []; const v3 = new THREE.Vector3();
function drawBubbles() {
  let n = 0; const w = innerWidth, h = innerHeight;
  for (const a of sim.agents) {
    if (!a.bubble || a.bubble.until < sim.time) { a.bubble = null; continue; }
    v3.set(a.x, sim.H + 0.8 + (a.state === 'dance' ? 0.6 : 0), a.z).project(camera);
    if (v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) continue;
    let el = pool[n]; if (!el) { el = document.createElement('div'); bubLayer.appendChild(el); pool.push(el); }
    el.className = 'bub ' + a.bubble.kind; el.textContent = a.bubble.text;
    el.style.transform = `translate(${((v3.x + 1) / 2 * w) | 0}px, ${((1 - v3.y) / 2 * h) | 0}px) translate(-50%,-100%)`;
    el.style.display = ''; n++;
    if (n > 80) break;
  }
  for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
}

// --- главный цикл
const clock = new THREE.Clock(); let acc = 0;
let frameMs = 0, frames = 0;
function frame() {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.1);
  if (rotateTo != null) {
    const cur = controls.getAzimuthalAngle(); let d = rotateTo - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    const step = Math.sign(d) * Math.min(Math.abs(d), dt * 3);
    const off = camera.position.clone().sub(controls.target); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), step); camera.position.copy(controls.target).add(off);
    if (Math.abs(d) < 0.002) rotateTo = null;
  }
  if (follow) { const off = camera.position.clone().sub(controls.target); controls.target.lerp(new THREE.Vector3(follow.x, 0, follow.z), 0.15); camera.position.copy(controls.target).add(off); }
  controls.update();
  const e = camera.matrixWorld.elements; sim.camRight.set(e[0], 0, e[2]).normalize();
  sim.update(dt * +ui.spd.value);
  drawBubbles();
  acc += dt; if (acc > 0.5) { acc = 0; $('stPop').textContent = sim.agents.length; $('stMeet').textContent = sim.stats.meetings; $('stBeer').textContent = sim.stats.beers; $('stDance').textContent = sim.stats.dances; if (cardAgent && !$('card').hidden) $('cState').textContent = 'Состояние: ' + (stateName[cardAgent.state] || cardAgent.state); }
  pixel.render(scene, camera, clock.elapsedTime);
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05; frames++;
}
frame();
$('loading').remove();
window.__app = { camera, controls, sim, flyTo, showCard, renderer, perf: () => ({ frameMs: +frameMs.toFixed(2), frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }) }; // для отладки из консоли
console.log('город собран:', data.buildings.length, 'зданий,', city.treeCount, 'деревьев,', sim.graph.walkable.length, 'узлов пешеходного графа,', sim.bars.length, 'баров');
