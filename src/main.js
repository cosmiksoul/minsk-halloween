import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { buildMarkers, makeMaterials, buildGround } from './city.js';
import { TileManager } from './tiles.js';
import { PixelPass } from './post.js';
import { Sim } from './sim.js';
import { drawPortrait, randomCostume } from './skeletons.js';
import { ageWord, ARCHETYPES, makeRng } from './bio.js';
import { buildVenues, skulls, VENUE_TYPES } from './venues.js';
import { projectHotspots } from './districts.js';
import { Game } from './game.js';
import { local, makeRemote } from './store.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const isMobile = innerWidth < 700;
const ARCH_LABEL = { it: 'айтишник', doc: 'медик', build: 'строитель', office: 'офисный', art: 'творческий', witch: 'ведьма / маг', vamp: 'вампир', sport: 'спортсмен', transit: 'транспортник', trade: 'торговля', student: 'студент', pension: 'пенсионер', pump: 'тыквоголовый', pirate: 'пират', knight: 'рыцарь', angel: 'ангел', raver: 'рейвер' };

// --- данные: индекс тайлов, пешеходная сеть, заведения, афиша
const BASE = 'data/map/';
const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const [index, net, pois, eventsFile] = await Promise.all([j(BASE + 'index.json'), j(BASE + 'net.json'), j(BASE + 'pois.json'), j('data/events.json').catch(() => ({ events: [] }))]);
const events = eventsFile.events || [];
const venues = buildVenues({ pois, center: index.center }, events);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x2a1540, 2700, 4400);
scene.add(new THREE.HemisphereLight(0x9a86d8, 0x3a2a40, 2.2));
scene.add(new THREE.AmbientLight(0x403060, 1.0));
const moon = new THREE.DirectionalLight(0xbfc8ff, 1.8); moon.position.set(-900, 1300, 700); scene.add(moon);
scene.add(buildGround());
const mats = makeMaterials();
const tiles = new TileManager(scene, index, mats, BASE);
await tiles.loadBig();

// камера
const VIEW = 260;
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 7000);
const bb = index.bbox; const inBox = (x, z) => x > bb[0] && x < bb[2] && z > bb[1] && z < bb[3];
const target = new THREE.Vector3(-295, 0, 55); if (!inBox(target.x, target.z)) target.set((bb[0] + bb[2]) / 2, 0, (bb[1] + bb[3]) / 2);
const dist = 2500; const polar = 55 * Math.PI / 180, azim = 35 * Math.PI / 180;
camera.position.set(target.x + dist * Math.sin(polar) * Math.cos(azim), dist * Math.cos(polar), target.z + dist * Math.sin(polar) * Math.sin(azim));
camera.lookAt(target);
const controls = new MapControls(camera, canvas);
controls.target.copy(target); controls.enableDamping = true; controls.dampingFactor = 0.12;
controls.minZoom = 0.5; controls.maxZoom = 16; controls.minPolarAngle = 22 * Math.PI / 180; controls.maxPolarAngle = 72 * Math.PI / 180;
controls.screenSpacePanning = false; controls.zoomToCursor = true;
camera.zoom = isMobile ? 2.2 : 3; camera.updateProjectionMatrix();

const pixel = new PixelPass(renderer, 2);
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  renderer.setSize(w, h, false);
  camera.left = -VIEW * a; camera.right = VIEW * a; camera.top = VIEW; camera.bottom = -VIEW; camera.updateProjectionMatrix();
  pixel.setSize(w, h);
}
addEventListener('resize', resize); resize();

const sim = new Sim(scene, net, venues, { skelH: 8, center: index.center, hotspots: projectHotspots(index.center) });
const markers = buildMarkers(venues, sim.danceZones); scene.add(markers.group); markers.setScale(sim.H);
const POP0 = isMobile ? 200 : 600;
sim.setPopulation(POP0);

// --- пользовательские скелеты: localStorage + ссылка (+ Supabase, если настроен)
let mine = local.load();
const saveMine = () => local.save(mine);
const remote = makeRemote(); let remoteTimer = 0;
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const shareLink = def => location.origin + location.pathname + '#s=' + b64(JSON.stringify({ n: def.name, g: def.gender, a: def.age, j: def.job, c: def.arch, s: def.seed }));
let fromLink = null;
if (location.hash.startsWith('#s=')) { try { const o = JSON.parse(unb64(location.hash.slice(3))); fromLink = { name: o.n, gender: o.g, age: o.a, job: o.j, arch: o.c, seed: o.s, guest: true }; } catch { } }

const game = new Game(sim, scene, {
  save: saveMine,
  showCard: (a, refresh) => showCard(a, refresh),
  onChange: () => { if (remote && game.player) { clearTimeout(remoteTimer); remoteTimer = setTimeout(() => remote.upsert(game.player.def, game.player.def.game), 4000); } },
});
for (const def of mine) sim.spawnCustom(def, def.game?.x, def.game?.z);
if (fromLink && !mine.some(d => d.seed === fromLink.seed && d.name === fromLink.name)) { const a = sim.spawnCustom(fromLink); setTimeout(() => { showCard(a); flyTo(a.x, a.z); }, 300); }
{
  const playable = mine.find(d => d.player && !d.guest) || mine.find(d => !d.guest);
  if (playable) { const a = sim.agents.find(x => x.def === playable); if (a) { game.setPlayer(a); flyTo(a.x, a.z); } }
}
game.renderHUD();

// --- интерфейс
const ui = { pop: $('pop'), spd: $('spd'), pix: $('pix') };
ui.pop.value = POP0;
$('popV').textContent = ui.pop.value;
ui.pop.oninput = () => { $('popV').textContent = ui.pop.value; };
ui.pop.onchange = () => sim.setPopulation(+ui.pop.value);
ui.spd.oninput = () => { $('spdV').textContent = (+ui.spd.value).toLocaleString('ru-RU') + '×'; };
ui.pix.oninput = () => { $('pixV').textContent = ui.pix.value; pixel.setPixelSize(+ui.pix.value); };
$('bFold').onclick = () => $('panel').classList.toggle('folded');
$('bFeed').onclick = () => $('right').classList.toggle('showFeed');
if (isMobile) $('panel').classList.add('folded');
$('bReset').onclick = () => location.reload();
$('bRot').onclick = () => { rotateTo = (rotateTo ?? controls.getAzimuthalAngle()) + Math.PI / 2; };
$('bParty').onclick = () => { sim.party(controls.target.x, controls.target.z, 160); };
$('bRand').onclick = () => { const a = sim.agents[Math.floor(Math.random() * sim.agents.length)]; if (a) { showCard(a); flyTo(a.x, a.z); } };
$('bMe').onclick = () => { if (game.player) { game.select(true); showCard(game.player); flyTo(game.player.x, game.player.z); follow = game.player; $('bFollow').classList.add('on'); } else openTab('mine'); };
$('hud').onclick = () => $('bMe').onclick();
$('bClose').onclick = () => { $('card').hidden = true; follow = null; hideTip(); };
$('bFollow').onclick = () => { follow = follow ? null : cardAgent; $('bFollow').classList.toggle('on', !!follow); };
$('bShare').onclick = async () => { const link = shareLink(cardAgent.def); try { await navigator.clipboard.writeText(link); $('bShare').textContent = 'скопировано'; setTimeout(() => $('bShare').textContent = 'ссылка', 1500); } catch { prompt('Ссылка на скелета', link); } };
$('bDelete').onclick = () => { const a = cardAgent; if (a === game.player) game.clearPlayer(); mine = mine.filter(d => d !== a.def); saveMine(); if (remote) remote.remove(a.def); sim.remove(a); $('card').hidden = true; renderMine(); pickPlayer(); };
$('bPlay').onclick = () => { const a = cardAgent; if (!a || !a.custom || a.def.guest) return; game.setPlayer(a); game.select(true); follow = a; $('bFollow').classList.add('on'); showCard(a); renderMine(); };
$('bSelect').onclick = () => { game.select(!game.selected); showCard(cardAgent); };
function openTab(name) { for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === name); for (const id of ['places', 'events', 'mine']) $('tab' + id[0].toUpperCase() + id.slice(1)).hidden = name !== id; if (isMobile) $('right').classList.add('showFeed'); }
for (const t of document.querySelectorAll('.tab')) t.onclick = () => openTab(t.dataset.tab);
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.code === 'Space') { e.preventDefault(); $('bMe').onclick(); } });
function pickPlayer() { if (game.player) return; const d = mine.find(x => !x.guest); if (d) { const a = sim.agents.find(x => x.def === d); if (a) game.setPlayer(a); } game.renderHUD(); }

let rotateTo = null, follow = null, cardAgent = null;
function flyTo(x, z) { const off = camera.position.clone().sub(controls.target); controls.target.set(x, 0, z); camera.position.copy(controls.target).add(off); }
const stateName = { walk: 'гуляет', talk: 'болтает', drink: 'пьёт пиво', dance: 'танцует', idle: 'стоит', wait: 'ждёт', follow: 'идёт следом', dead: 'рассыпался', ghost: 'летает' };
function showCard(a, refresh) {
  if (refresh && (cardAgent !== a || $('card').hidden)) return;
  cardAgent = a; $('card').hidden = false;
  game.portrait(a, $('cardPic'));
  $('cName').textContent = a.bio.name; $('cName').className = 'name' + (a === game.player ? ' player' : a.custom ? ' mine' : a.ghost ? ' ghost' : '');
  $('cMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'}` + (a.custom ? (a.def.guest ? (a.def.remote ? ' · гость из сети' : ' · гость по ссылке') : a === game.player ? ' · вы' : ' · ваш скелет') : '');
  $('cJob').textContent = 'При жизни: ' + a.bio.job;
  $('cStatus').textContent = 'Сейчас: ' + a.bio.status;
  $('cState').textContent = 'Состояние: ' + (a.ghost ? stateName.ghost : stateName[a.state] || a.state);
  $('cGame').innerHTML = game.cardHtml(a);
  $('bFollow').classList.toggle('on', follow === a);
  $('bShare').hidden = !a.custom; $('bDelete').hidden = !(a.custom && !a.def.guest);
  $('bPlay').hidden = !(a.custom && !a.def.guest && a !== game.player);
  $('bSelect').hidden = a !== game.player; $('bSelect').textContent = game.selected ? 'снять выделение' : 'управлять'; $('bSelect').classList.toggle('on', game.selected);
}
// подсказки к черепам и сердечкам в карточке
const tip = $('tip');
function showTip(el) { const k = el.dataset.tip; if (!game.tips[k]) return; tip.innerHTML = game.tips[k]; tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, r.left) + 'px'; tip.style.top = (r.top - tip.offsetHeight - 6) + 'px'; }
function hideTip() { tip.hidden = true; }
$('card').addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
$('card').addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
$('card').addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el) { if (tip.hidden) showTip(el); else hideTip(); } });

// --- заведения: всплывающая карточка
let popupVenue = null; const maxVisits = () => Math.max(1, ...venues.map(v => v.visits));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = d => ({ '2026-10-29': '29 октября', '2026-10-30': '30 октября', '2026-10-31': '31 октября', '2026-11-01': '1 ноября', '2026-11-02': '2 ноября' }[d] || d);
function showVenue(v) {
  popupVenue = v; $('popup').hidden = false;
  $('pName').textContent = v.name;
  $('pType').textContent = (VENUE_TYPES[v.type] || v.type) + (v.node < 0 ? ' · вне пешеходной сети' : '');
  $('pAddr').textContent = v.addr ? 'адрес: ' + v.addr : '';
  $('pHours').textContent = v.hours ? 'часы: ' + v.hours : '';
  $('pEvents').innerHTML = v.events.map(e => `<div class="pe"><b>${esc(e.title)}</b><br>${fmtDate(e.date)}${e.time ? ', ' + esc(e.time) : ''}${e.price ? ' · ' + esc(e.price) : ''}${e.age ? ' · ' + esc(e.age) : ''}<br><span class="muted">${esc(e.desc || '')}</span>${e.url ? `<br><a href="${esc(e.url)}" target="_blank" rel="noopener">подробнее</a>` : ''}</div>`).join('');
  $('pWeb').innerHTML = v.web ? `<a href="${esc(/^http/.test(v.web) ? v.web : 'https://' + v.web)}" target="_blank" rel="noopener">сайт заведения</a>` : '';
  $('pGo').hidden = !(game.player && v.node >= 0);
  updatePopup();
}
function updatePopup() {
  if (!popupVenue) return;
  const v = popupVenue;
  $('pRate').textContent = 'рейтинг в скелетах: ' + skulls(v, maxVisits()) + ` (${v.visits} заход${v.visits % 10 === 1 && v.visits % 100 !== 11 ? '' : 'ов'})`;
  $('pInside').textContent = v.inside ? `сейчас внутри: ${v.inside} скел.` : 'сейчас пусто, заходи';
}
$('pClose').onclick = () => { $('popup').hidden = true; popupVenue = null; };
$('pGo').onclick = () => { if (!popupVenue || !game.player) return; game.select(true); game.clickVenue(popupVenue); follow = game.player; $('bFollow').classList.add('on'); };

// --- лента: места и афиша
function renderPlaces() {
  const mx = maxVisits();
  const list = [...venues].filter(v => v.node >= 0).sort((a, b) => (b.inside * 3 + b.visits + b.events.length * 5) - (a.inside * 3 + a.visits + a.events.length * 5)).slice(0, 18);
  $('tabPlaces').innerHTML = list.map(v => `<div class="item" data-v="${v.id}"><span class="n">${esc(v.name)}</span><span class="r">${skulls(v, mx)}</span><span class="s">${VENUE_TYPES[v.type] || v.type}${v.addr ? ' · ' + esc(v.addr) : ''}${v.inside ? ` · внутри ${v.inside}` : ''}${v.events.length ? ' · <b>афиша</b>' : ''}</span></div>`).join('');
}
$('tabPlaces').onclick = e => { const it = e.target.closest('.item'); if (!it) return; const v = venues[+it.dataset.v]; flyTo(v.x, v.z); showVenue(v); };
function renderEvents() {
  const sorted = [...events].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  let html = '', day = '';
  for (const e of sorted) {
    if (e.date !== day) { day = e.date; html += `<div class="day">${fmtDate(day)}</div>`; }
    const v = e.venueId != null ? venues[e.venueId] : null;
    html += `<div class="item ev ${e.kind}" data-e="${events.indexOf(e)}"><span class="n">${esc(e.title)}</span><span class="k">${{ party: 'вечеринка', concert: 'концерт', family: 'семейное' }[e.kind] || e.kind}</span><span class="s">${esc(e.venue || '')}${e.addr ? ', ' + esc(e.addr) : ''}${e.time ? ' · ' + esc(e.time) : ''}${e.price ? ' · ' + esc(e.price) : ''}${e.age ? ' · ' + esc(e.age) : ''}${v ? '' : ' · <i>вне карты</i>'}</span></div>`;
  }
  $('tabEvents').innerHTML = html + `<div class="hint">афиша собрана ${esc(eventsFile.updated || '')} с bezkassira.by и family.by; клик по событию ведёт к площадке, если она на карте</div>`;
}
$('tabEvents').onclick = e => { const it = e.target.closest('.item'); if (!it) return; const ev = events[+it.dataset.e]; if (ev.venueId != null) { const v = venues[ev.venueId]; flyTo(v.x, v.z); showVenue(v); } else if (ev.url) open(ev.url, '_blank', 'noopener'); };
renderEvents();

// --- свой скелет
const mArch = $('mArch');
for (const a of ARCHETYPES) { const o = document.createElement('option'); o.value = a.id; o.textContent = ARCH_LABEL[a.id] || a.id; mArch.appendChild(o); }
mArch.value = 'raver';
let mineSeed = Math.floor(Math.random() * 1e9);
function previewMine() { const arch = ARCHETYPES.find(a => a.id === mArch.value); drawPortrait(randomCostume(makeRng(mineSeed * 2654435761 + 7), arch), $('minePic')); }
mArch.onchange = previewMine; $('bReroll').onclick = () => { mineSeed = Math.floor(Math.random() * 1e9); previewMine(); }; previewMine();
$('mineForm').onsubmit = e => {
  e.preventDefault();
  const age = Math.max(18, Math.min(120, +$('mAge').value || 18));
  const def = { name: $('mName').value.trim(), gender: $('mGender').value, age, job: $('mJob').value.trim(), arch: mArch.value, seed: mineSeed };
  if (!def.name || !def.job) return;
  mine.push(def); saveMine();
  const a = sim.spawnCustom(def, controls.target.x, controls.target.z);
  game.setPlayer(a); game.select(true);
  showCard(a); flyTo(a.x, a.z); follow = a; $('bFollow').classList.add('on');
  mineSeed = Math.floor(Math.random() * 1e9); previewMine(); renderMine();
  if (isMobile) $('right').classList.remove('showFeed');
};
function renderMine() {
  $('mineList').innerHTML = mine.length ? '<div class="day">ваши скелеты</div>' + mine.map((d, i) => `<div class="item${d.player ? ' cur' : ''}" data-i="${i}"><span class="n">${esc(d.name)}</span><span class="r">${d.age} ${ageWord(d.age)}</span>${d.player ? '<span class="k">играет</span>' : `<button class="play" data-p="${i}">играть</button>`}<span class="s">${esc(d.job)} · ${ARCH_LABEL[d.arch] || ''}${d.game ? ` · 💀 ${d.game.skulls.length} · 💚 ${d.game.friends.length}` : ''}</span></div>`).join('') : '';
  renderBoard();
}
$('mineList').onclick = e => {
  const pb = e.target.closest('.play'); const it = e.target.closest('.item'); if (!it) return;
  const def = mine[+it.dataset.i]; const a = sim.agents.find(x => x.def === def); if (!a) return;
  if (pb) { game.setPlayer(a); game.select(true); follow = a; $('bFollow').classList.add('on'); renderMine(); }
  showCard(a); flyTo(a.x, a.z);
};
renderMine();

// --- сеть: чужие скелеты и доска почёта (если настроен Supabase)
async function renderBoard() {
  if (!remote) return;
  const top = await remote.top(10); if (!top) return;
  $('board').innerHTML = '<div class="day">доска почёта</div>' + top.map((r, i) => `<div class="item"><span class="n">${i + 1}. ${esc(r.name)}</span><span class="r">💀 ${r.kills} · 💚 ${r.friends}</span><span class="s">${esc(r.job)} · заведений: ${r.visits}${r.deaths ? ` · смертей: ${r.deaths}` : ''}</span></div>`).join('');
}
if (remote) remote.others(20).then(rows => { if (!rows) return; for (const r of rows) { if (mine.some(d => d.seed === r.seed && d.name === r.name)) continue; sim.spawnCustom({ name: r.name, gender: r.gender, age: r.age, job: r.job, arch: r.arch, seed: r.seed, guest: true, remote: true }); } });

// --- клики по сцене: скелеты, маркеры заведений, земля
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let downAt = null; const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3();
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, e.button]; });
canvas.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) follow = null; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  if (downAt[2] !== 0) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const onGround = !!ray.ray.intersectPlane(groundPlane, hit);
  const a = onGround ? sim.pickAgent(ray, hit.x, hit.z) : null;
  if (a) {
    if (game.clickAgent(a)) return;
    showCard(a); if (follow) follow = a;
    if (a === game.player && !game.selected) { game.select(true); showCard(a); }
    return;
  }
  const mh = ray.intersectObjects(markers.pickables, false);
  if (mh.length) { const v = mh[0].object.userData.venue; showVenue(v); game.clickVenue(v); return; }
  if (game.selected && onGround) { game.clickGround(hit.x, hit.z); return; }
  if (popupVenue) { $('popup').hidden = true; popupVenue = null; }
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || downAt) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const onGround = !!ray.ray.intersectPlane(groundPlane, hit);
  const over = (onGround && sim.pickAgent(ray, hit.x, hit.z)) || ray.intersectObjects(markers.pickables, false).length;
  canvas.style.cursor = over ? 'pointer' : game.selected ? 'crosshair' : 'grab';
});
addEventListener('pointerup', () => { downAt = null; });

// --- пузыри реплик и подписи своих скелетов
const bubLayer = $('bubbles'); const pool = []; const v3 = new THREE.Vector3();
function drawBubbles() {
  let n = 0; const w = innerWidth, h = innerHeight;
  const place = (a, text, cls, dy) => {
    v3.set(a.x, sim.H + dy + (a.state === 'dance' ? sim.H * 0.07 : 0) + (a.ghost ? sim.H * 0.2 : 0), a.z).project(camera);
    if (v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) return;
    let el = pool[n]; if (!el) { el = document.createElement('div'); bubLayer.appendChild(el); pool.push(el); }
    el.className = cls; el.textContent = text;
    el.style.transform = `translate(${((v3.x + 1) / 2 * w) | 0}px, ${((1 - v3.y) / 2 * h) | 0}px) translate(-50%,-100%)`;
    el.style.display = ''; n++;
  };
  for (const a of sim.agents) {
    if (n > 90) break;
    if (a.bubble && a.bubble.until < sim.time) a.bubble = null;
    if (a.bubble) place(a, a.bubble.text, 'bub ' + a.bubble.kind, 0.8);
    else if (a.custom) place(a, a.bio.name.split(' ')[0], 'bub tag' + (a === game.player ? ' me' : ''), 0.4);
    else if (a.leader === game.player) place(a, '💚', 'bub tag fr', 0.4);
    else if (a.state === 'wait' && a.waitFor === game.player) place(a, '…', 'bub tag', 0.4);
  }
  for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  if (popupVenue) {
    v3.set(popupVenue.x, (popupVenue.top || 6) + 2 + sim.H * 0.85 * 1.5, popupVenue.z).project(camera);
    $('popup').style.left = ((v3.x + 1) / 2 * w | 0) + 'px'; $('popup').style.top = ((1 - v3.y) / 2 * h | 0) + 'px';
  }
}

// --- главный цикл
const clock = new THREE.Clock(); let acc = 0, feedAcc = 0, frameMs = 0, frames = 0;
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
  tiles.update(camera);
  // чем ближе камера, тем ближе скелет к человеческому росту
  const H = THREE.MathUtils.clamp(8 * Math.pow(3 / camera.zoom, 0.6), 2.4, 13);
  if (Math.abs(H - sim.H) > 0.02) { sim.setHeight(H); markers.setScale(H); }
  markers.update(clock.elapsedTime);
  const e = camera.matrixWorld.elements; sim.camRight.set(e[0], 0, e[2]).normalize();
  const sdt = dt * +ui.spd.value;
  sim.update(sdt);
  game.update(sdt, clock.elapsedTime);
  drawBubbles();
  acc += dt; if (acc > 0.5) { acc = 0; $('stPop').textContent = sim.agents.length; $('stMeet').textContent = sim.stats.meetings; $('stBeer').textContent = sim.stats.beers; $('stDance').textContent = sim.stats.dances; if (cardAgent && !$('card').hidden) $('cState').textContent = 'Состояние: ' + (cardAgent.ghost ? stateName.ghost : stateName[cardAgent.state] || cardAgent.state); updatePopup(); }
  feedAcc += dt; if (feedAcc > 2.5) { feedAcc = 0; if (!$('tabPlaces').hidden) renderPlaces(); }
  pixel.render(scene, camera, clock.elapsedTime);
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05; frames++;
}
renderPlaces();
await tiles.ready(camera);
frame();
$('loading').remove();
window.__app = { camera, controls, sim, game, tiles, venues, flyTo, showCard, showVenue, renderer, remote, perf: () => ({ frameMs: +frameMs.toFixed(2), frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tiles: tiles.stats }) };
console.log('город собран:', index.stats?.buildings, 'зданий в', Object.keys(index.tiles).length, 'тайлах,', sim.graph.walkable.length, 'узлов,', venues.length, 'заведений,', events.length, 'событий,', sim.hotspots.length, 'оживлённых мест');
