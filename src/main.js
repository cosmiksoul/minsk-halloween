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
import { local, makeRemote, scoreOf, deviceId } from './store.js';
import { buildLandmarks, TYPE_LABEL } from './landmarks.js';
import { Tarot } from './tarot.js';
import { Shops } from './shops.js';
import { generateCharacter } from './gen.js';
import { ensureFonts, renderShareCard, shareTargets, download, nativeShare } from './share.js';

const $ = id => document.getElementById(id);
const canvas = $('c');
const isMobile = innerWidth < 700;
const MAX_OWN = 5;
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
const lms = buildLandmarks(index.center); scene.add(lms.group); mats.skip = lms.zones;
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
const tarot = new Tarot(scene, sim, index.center, lms.items); mats.tarot = tarot.zones; tarot.setScale(sim.H);
const shops = new Shops(scene, sim, index.center); shops.setScale(sim.H);
// посев по оживлённым районам; остальная толпа появляется вокруг камеры (sim.crowd)
sim.cap = isMobile ? 450 : 900;
sim.setPopulation(isMobile ? 120 : 260);

// --- пользовательские скелеты: localStorage + ссылка (+ Supabase, если настроен)
let mine = local.load();
const saveMine = () => local.save(mine);
const remote = makeRemote(); let remoteTimer = 0;
const own = () => mine.filter(d => !d.guest).map(def => ({ def, agent: sim.agents.find(a => a.def === def) })).filter(o => o.agent);
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const shareLink = def => { const g = def.game || {}; return location.origin + location.pathname + '#s=' + b64(JSON.stringify({ n: def.name, g: def.gender, a: def.age, j: def.job, c: def.arch, s: def.seed, o: def.costume || undefined, b: def.about ? def.about.slice(0, 240) : undefined, st: [(g.skulls || []).length, (g.friends || []).length, (g.tarot || []).length, (g.visits || []).length] })); };
let fromLink = null;
if (location.hash.startsWith('#s=')) { try { const o = JSON.parse(unb64(location.hash.slice(3))); fromLink = { name: o.n, gender: o.g, age: o.a, job: o.j, arch: o.c, seed: o.s, costume: o.o, about: o.b, stats: o.st, guest: true }; } catch { } }

const game = new Game(sim, scene, {
  tarot, shops, save: saveMine, own,
  showCard: (a, refresh) => { showCard(a, refresh); if (refresh && !$('profile').hidden && profileAgent === a) renderProfile(a); },
  onChange: () => { if (remote && game.player) { clearTimeout(remoteTimer); remoteTimer = setTimeout(() => remote.upsert(game.player.def, game.player.def.game), 4000); } if (!$('tabBoard').hidden) renderBoard(false); },
});
for (const def of mine) sim.spawnCustom(def, def.game?.x, def.game?.z);
if (fromLink && !mine.some(d => d.seed === fromLink.seed && d.name === fromLink.name)) { const a = sim.spawnCustom(fromLink); setTimeout(() => { showCard(a); flyTo(a.x, a.z); }, 300); }
{
  const playable = mine.find(d => d.player && !d.guest) || mine.find(d => !d.guest);
  if (playable) { const a = sim.agents.find(x => x.def === playable); if (a) { game.setPlayer(a); flyTo(a.x, a.z); } }
}
game.renderHUD();

// --- меню настроек и действий
const ui = { pop: $('pop'), spd: $('spd'), pix: $('pix') };
const fmtX = v => (+v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×';
$('popV').textContent = fmtX(ui.pop.value);
ui.pop.oninput = () => { $('popV').textContent = fmtX(ui.pop.value); sim.density = +ui.pop.value; sim.cap = Math.round((isMobile ? 450 : 900) * Math.max(0.5, sim.density)); };
ui.spd.oninput = () => { $('spdV').textContent = fmtX(ui.spd.value); };
ui.pix.oninput = () => { $('pixV').textContent = ui.pix.value; pixel.setPixelSize(+ui.pix.value); };
$('menuBtn').onclick = () => { const m = $('menu'); m.hidden = !m.hidden; $('menuBtn').classList.toggle('on', !m.hidden); };
$('bReset').onclick = () => location.reload();
$('bRot').onclick = () => { rotateTo = (rotateTo ?? controls.getAzimuthalAngle()) + Math.PI / 2; };
$('bNorth').onclick = () => { rotateTo = 0; };
$('compass').onclick = () => { rotateTo = 0; };
$('bParty').onclick = () => { sim.party(controls.target.x, controls.target.z, 160); };
$('bRand').onclick = () => { const a = sim.agents[Math.floor(Math.random() * sim.agents.length)]; if (a) { showCard(a); flyTo(a.x, a.z); } $('menu').hidden = true; $('menuBtn').classList.remove('on'); };
$('bNew').onclick = () => { openMine(); $('menu').hidden = true; $('menuBtn').classList.remove('on'); };

// --- выезжающая панель: места, афиша, лидеры, легенда
const DRAWER_TITLES = { places: 'Места', events: 'Афиша', board: 'Лидеры', legend: 'Карта и правила' };
let drawerTab = null;
function openDrawer(name) {
  if (drawerTab === name) { closeDrawer(); return; }
  drawerTab = name; $('drawer').hidden = false; $('drawerTitle').textContent = DRAWER_TITLES[name];
  for (const id of ['places', 'events', 'board', 'legend']) $('tab' + id[0].toUpperCase() + id.slice(1)).hidden = name !== id;
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('on', b.dataset.drawer === name);
  document.body.classList.add('drawerOpen'); placeDrawer();
  if (name === 'places') renderPlaces(); if (name === 'board') renderBoard(true);
}
function placeDrawer() { if (isMobile) return; $('drawer').style.top = Math.round($('hud').getBoundingClientRect().bottom + 8) + 'px'; }
new ResizeObserver(() => { if (drawerTab) placeDrawer(); }).observe($('hud'));
function closeDrawer() { drawerTab = null; $('drawer').hidden = true; document.body.classList.remove('drawerOpen'); for (const b of document.querySelectorAll('.tbtn')) b.classList.remove('on'); }
for (const b of document.querySelectorAll('.tbtn')) b.onclick = () => openDrawer(b.dataset.drawer);
$('drawerClose').onclick = closeDrawer;

// --- свой скелет: взять управление, переключить, создать
function takeControl(a) {
  if (!a || !a.custom || a.def.guest) return;
  if (game.player !== a) game.setPlayer(a);
  game.select(true); showCard(a); flyTo(a.x, a.z); follow = a; $('bFollow').classList.add('on'); renderMine();
}
$('hud').onclick = e => {
  if (e.target.closest('.hudNew') || e.target.closest('.avAdd')) { openMine(); return; }
  const av = e.target.closest('canvas.av'); if (av) { const o = own().find(x => String(x.def.seed) === av.dataset.seed); if (o) takeControl(o.agent); return; }
  if (game.player) takeControl(game.player);
};
$('mnClose').onclick = () => closeMine();
$('mine').addEventListener('click', e => { if (e.target === $('mine')) closeMine(); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('mine').hidden) closeMine(); if (!$('profile').hidden) closeProfile(); if (!$('menu').hidden) { $('menu').hidden = true; $('menuBtn').classList.remove('on'); } }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); if (game.player) takeControl(game.player); else openMine(); }
});
$('bClose').onclick = () => { $('card').hidden = true; follow = null; hideTip(); };
$('bFollow').onclick = () => { follow = follow ? null : cardAgent; $('bFollow').classList.toggle('on', !!follow); };
$('bPlay').onclick = () => takeControl(cardAgent);
$('bSelect').onclick = () => { if (game.selected && cardAgent === game.player) { game.select(false); showCard(cardAgent); } else takeControl(cardAgent); };
$('bProfile').onclick = () => openProfile(cardAgent);
$('bGen').onclick = () => { const c = generateCharacter(); $('mName').value = c.name; $('mGender').value = c.gender; $('mAge').value = c.age; $('mJob').value = c.job; $('mAbout').value = c.about; mArch.value = c.arch; mineSeed = c.costumeSeed; previewMine(); };
function openMine() { const full = own().length >= MAX_OWN; $('mnLimit').hidden = !full; $('mSubmit').disabled = full; $('mine').hidden = false; renderMine(); previewMine(); if (!isMobile && !full) setTimeout(() => $('mName').focus(), 50); }
function closeMine() { $('mine').hidden = true; }
function pickPlayer() { if (game.player) return; const d = mine.find(x => !x.guest); if (d) { const a = sim.agents.find(x => x.def === d); if (a) game.setPlayer(a); } game.renderHUD(); }

let rotateTo = null, follow = null, cardAgent = null;
function flyTo(x, z) { follow = null; const off = camera.position.clone().sub(controls.target); controls.target.set(x, 0, z); camera.position.copy(controls.target).add(off); }
const stateName = { walk: 'гуляет', talk: 'болтает', drink: 'пьёт пиво', dance: 'танцует', idle: 'стоит', wait: 'ждёт', follow: 'идёт следом', dead: 'рассыпался', ghost: 'летает' };
const stateOf = a => a.ghost ? stateName.ghost : stateName[a.state] || a.state;
function showCard(a, refresh) {
  if (refresh && (cardAgent !== a || $('card').hidden)) return;
  cardAgent = a; $('card').hidden = false;
  game.portrait(a, $('cardPic'));
  $('cName').textContent = a.bio.name; $('cName').className = 'name' + (a === game.player ? ' player' : a.custom ? ' mine' : a.ghost ? ' ghost' : '');
  $('cMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'}` + (a.custom ? (a.def.guest ? (a.def.remote ? ' · гость из сети' : ' · гость по ссылке') : a === game.player ? (game.selected ? ' · вы управляете' : ' · ваш скелет, гуляет сам') : ' · ваш скелет') : '');
  $('cJob').textContent = 'При жизни: ' + a.bio.job;
  $('cStatus').textContent = 'Сейчас: ' + a.bio.status + (a.custom && a.def.guest && a.def.stats ? ` · 💀 ${a.def.stats[0]} · 💚 ${a.def.stats[1]} · 🃏 ${a.def.stats[2]} · 🎃 ${a.def.stats[3]}` : '');
  $('cState').textContent = 'Состояние: ' + stateOf(a);
  $('cGame').innerHTML = game.cardHtml(a);
  $('bFollow').classList.toggle('on', follow === a);
  const ownAgent = a.custom && !a.def.guest;
  $('bSelect').hidden = !(ownAgent && a === game.player); $('bSelect').textContent = game.selected ? 'отпустить' : 'управлять'; $('bSelect').classList.toggle('on', game.selected && a === game.player);
  $('bPlay').hidden = !(ownAgent && a !== game.player);
  $('bProfile').hidden = !a.custom;
}
// --- профиль своего скелета: статистика, описание, колода, шаринг, ссылка, удаление
let profileAgent = null;
function renderProfile(a) {
  $('pfName').textContent = a.bio.name; game.portrait(a, $('pfPic'));
  $('pfMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'} · ${ARCH_LABEL[a.arch] || ''}` + (a.def.guest ? ' · гость' : a === game.player ? (game.selected ? ' · под управлением' : ' · гуляет сам') : ' · ваш скелет');
  $('pfJob').textContent = 'При жизни: ' + a.bio.job; $('pfStatus').textContent = 'Сейчас: ' + a.bio.status + ' · ' + stateOf(a);
  $('pfAbout').textContent = a.def.about ? 'О себе: ' + a.def.about : '';
  $('pfGame').innerHTML = a.def.guest ? (a.def.stats ? `<div class="line">💀 ${a.def.stats[0]} · 💚 ${a.def.stats[1]} · 🃏 ${a.def.stats[2]} · 🎃 ${a.def.stats[3]}</div>` : '') : game.profileHtml(a);
  const ownAgent = !a.def.guest;
  $('pfSelect').hidden = !ownAgent || (a === game.player && game.selected); $('pfPlay').hidden = true;
  $('pfDeck').hidden = !(ownAgent && a === game.player); $('pfShare').hidden = !(ownAgent && a === game.player);
  $('pfDelete').hidden = !ownAgent;
}
function openProfile(a) { if (!a || !a.custom) return; profileAgent = a; renderProfile(a); $('profile').hidden = false; }
function closeProfile() { $('profile').hidden = true; profileAgent = null; hideTip(); }
$('pfClose').onclick = closeProfile;
$('profile').addEventListener('click', e => { if (e.target === $('profile')) closeProfile(); });
$('pfSelect').onclick = () => { takeControl(profileAgent); closeProfile(); };
$('pfDeck').onclick = () => { closeProfile(); game.openDeck(); };
$('pfShare').onclick = () => { closeProfile(); openShare(); };
$('pfLink').onclick = async () => { const link = shareLink(profileAgent.def); try { await navigator.clipboard.writeText(link); $('pfLink').textContent = 'скопировано'; setTimeout(() => $('pfLink').textContent = '🔗 ссылка', 1500); } catch { prompt('Ссылка на скелета', link); } };
$('pfDelete').onclick = () => { const a = profileAgent; if (!a) return; if (!confirm(`Удалить скелета ${a.bio.name}?`)) return; if (a === game.player) game.clearPlayer(); mine = mine.filter(d => d !== a.def); saveMine(); if (remote) remote.remove(a.def); sim.remove(a); if (cardAgent === a) $('card').hidden = true; closeProfile(); renderMine(); pickPlayer(); };
// подсказки к черепам и сердечкам в профиле
const tip = $('tip');
function showTip(el) { const k = el.dataset.tip; if (!game.tips[k]) return; tip.innerHTML = game.tips[k]; tip.hidden = false; const r = el.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, r.left) + 'px'; tip.style.top = (r.top - tip.offsetHeight - 6) + 'px'; }
function hideTip() { tip.hidden = true; }
$('profile').addEventListener('mouseover', e => { const el = e.target.closest('[data-tip]'); if (el) showTip(el); });
$('profile').addEventListener('mouseout', e => { if (e.target.closest('[data-tip]')) hideTip(); });
$('profile').addEventListener('click', e => { const el = e.target.closest('[data-tip]'); if (el) { if (tip.hidden) showTip(el); else hideTip(); } });

// --- всплывающая карточка: заведения, арканы, магазины, здания
let popupVenue = null, popupTarot = null, popupShop = null, popupBld = null; const maxVisits = () => Math.max(1, ...venues.map(v => v.visits));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = d => ({ '2026-10-29': '29 октября', '2026-10-30': '30 октября', '2026-10-31': '31 октября', '2026-11-01': '1 ноября', '2026-11-02': '2 ноября' }[d] || d);
function resetPopup() { popupVenue = popupTarot = popupShop = popupBld = null; for (const id of ['pType', 'pAddr', 'pHours', 'pRate', 'pInside']) $(id).textContent = ''; $('pEvents').innerHTML = ''; $('pWeb').innerHTML = ''; $('popup').hidden = false; }
function closePopup() { $('popup').hidden = true; popupVenue = popupTarot = popupShop = popupBld = null; }
const nearCount = (x, z, r = 60) => sim.agents.filter(a => !a.ghost && (a.x - x) ** 2 + (a.z - z) ** 2 < r * r).length;
function showShopPopup(sh) {
  resetPopup(); popupShop = sh;
  $('pName').textContent = sh.name; $('pType').textContent = 'магазин одежды' + (sh.node < 0 ? ' · вне пешеходной сети' : ''); $('pAddr').textContent = sh.addr ? 'адрес: ' + sh.addr : '';
  $('pInside').textContent = 'случайная вещь за монетки: шляпы, одежда, предметы, узоры, аксессуары';
  $('pGo').hidden = !(game.player && sh.node >= 0); $('pGo').textContent = '🛍 зайти своим скелетом';
}
function showTarotMarker(it) {
  resetPopup(); popupTarot = it;
  const done = game.g && game.g.tarot.some(t => t.id === it.a.id);
  $('pName').textContent = done ? `${it.a.roman} · ${it.a.name}` : 'аркана таро';
  $('pType').textContent = done ? 'найдена' : 'ещё не найдена' + (it.node < 0 ? ' · вне пешеходной сети' : '');
  $('pAddr').textContent = it.a.place; $('pInside').textContent = done ? '' : 'дойди до зелёной метки на тротуаре рядом, и карта откроется';
  $('pWeb').innerHTML = done ? '<a href="#" id="pOpenCard">посмотреть карту</a>' : '';
  if (done) $('pOpenCard').onclick = e => { e.preventDefault(); game.showTarot(it.a, false); };
  $('pGo').hidden = !(game.player && it.node >= 0 && !done); $('pGo').textContent = '🃏 дойти своим скелетом';
}
function showVenue(v) {
  resetPopup(); popupVenue = v; $('pGo').textContent = '🎃 зайти своим скелетом';
  $('pName').textContent = v.name;
  $('pType').textContent = (VENUE_TYPES[v.type] || v.type) + (v.node < 0 ? ' · вне пешеходной сети' : '');
  $('pAddr').textContent = v.addr ? 'адрес: ' + v.addr : '';
  $('pHours').textContent = v.hours ? 'часы: ' + v.hours : '';
  $('pEvents').innerHTML = v.events.map(e => `<div class="pe"><b>${esc(e.title)}</b><br>${fmtDate(e.date)}${e.time ? ', ' + esc(e.time) : ''}${e.price ? ' · ' + esc(e.price) : ''}${e.age ? ' · ' + esc(e.age) : ''}<br><span class="muted">${esc(e.desc || '')}</span>${e.url ? `<br><a href="${esc(e.url)}" target="_blank" rel="noopener">подробнее</a>` : ''}</div>`).join('');
  $('pWeb').innerHTML = v.web ? `<a href="${esc(/^http/.test(v.web) ? v.web : 'https://' + v.web)}" target="_blank" rel="noopener">сайт заведения</a>` : '';
  $('pGo').hidden = !(game.player && v.node >= 0);
  updatePopup();
}
// заметное здание: имя, адрес и описание из таблицы или только имя из OSM
function showBuilding(b) {
  resetPopup(); const info = b.info || (b.landmark ? b.landmark : null); popupBld = { x: b.cx ?? b.x, z: b.cz ?? b.z, top: b.h || 10 };
  // в этом здании спрятана аркана: «дойти» ведёт к её точке подбора на тротуаре
  const arc = tarot.items.find(it => !it.done && (it.x - popupBld.x) ** 2 + (it.z - popupBld.z) ** 2 < 60 * 60);
  if (arc) { popupBld.go = [arc.nx, arc.nz]; $('pHours').textContent = '🃏 здесь спрятана аркана таро: иди к зелёной метке на тротуаре'; }
  $('pName').textContent = info ? info.name : b.n;
  $('pType').textContent = info ? (b.t ? TYPE_LABEL[b.t] || 'здание' : 'достопримечательность') : (TYPE_LABEL[b.t] || 'здание') + (b.h ? ` · примерно ${Math.max(1, Math.round(b.h / 3.2))} эт.` : '');
  $('pAddr').textContent = info && info.addr ? 'адрес: ' + info.addr : '';
  $('pRate').textContent = info && info.blurb ? info.blurb : '';
  $('pGo').hidden = !game.player; $('pGo').textContent = '🚶 дойти своим скелетом';
  updatePopup();
}
function updatePopup() {
  if (popupVenue) { const v = popupVenue; $('pRate').textContent = 'рейтинг в скелетах: ' + skulls(v, maxVisits()) + ` (${v.visits} заход${v.visits % 10 === 1 && v.visits % 100 !== 11 ? '' : 'ов'})`; $('pInside').textContent = v.inside ? `сейчас внутри: ${v.inside} скел.` : 'сейчас пусто, заходи'; }
  if (popupBld) { const n = nearCount(popupBld.x, popupBld.z); $('pInside').textContent = n ? `рядом сейчас: ${n} скел.` : 'рядом сейчас никого'; }
}
$('pClose').onclick = closePopup;
$('pGo').onclick = () => {
  if (!game.player) return; takeControl(game.player);
  if (popupVenue) game.clickVenue(popupVenue); else if (popupTarot) game.clickGround(popupTarot.nx, popupTarot.nz); else if (popupShop) game.clickShop(popupShop); else if (popupBld) { const [gx, gz] = popupBld.go || [popupBld.x, popupBld.z]; game.clickGround(gx, gz); }
};

// --- списки: места (с «рядом»), афиша, лидеры
const distTo = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const fmtDist = d => d < 950 ? Math.round(d / 10) * 10 + ' м' : (d / 1000).toFixed(1).replace('.', ',') + ' км';
function renderPlaces() {
  const mx = maxVisits(); let html = '';
  const p = game.player;
  if (p) {
    const near = [];
    for (const v of venues) if (v.node >= 0) near.push({ d: distTo(v, p), label: `🎃 ${v.name}`, go: () => { flyTo(v.x, v.z); showVenue(v); } });
    for (const s of shops.items) if (s.node >= 0) near.push({ d: distTo(s, p), label: `🛍 ${s.name}`, go: () => { flyTo(s.x, s.z); showShopPopup(s); } });
    for (const t of tarot.items) if (t.node >= 0 && !t.done) near.push({ d: Math.hypot(t.nx - p.x, t.nz - p.z), label: `🃏 аркана · ${t.a.place.split(',')[0]}`, go: () => { flyTo(t.x, t.z); showTarotMarker(t); } });
    near.sort((a, b) => a.d - b.d); nearItems = near.slice(0, 6);
    html += '<div class="day">рядом с вами</div>' + nearItems.map((n, i) => `<div class="near" data-n="${i}"><span>${esc(n.label)}</span><span class="d">${fmtDist(n.d)}</span></div>`).join('');
  }
  const list = [...venues].filter(v => v.node >= 0).sort((a, b) => (b.inside * 3 + b.visits + b.events.length * 5) - (a.inside * 3 + a.visits + a.events.length * 5)).slice(0, 18);
  html += '<div class="day">самые людные</div>' + list.map(v => `<div class="item" data-v="${v.id}"><span class="n">${esc(v.name)}</span><span class="r">${skulls(v, mx)}</span><span class="s">${VENUE_TYPES[v.type] || v.type}${v.addr ? ' · ' + esc(v.addr) : ''}${v.inside ? ` · внутри ${v.inside}` : ''}${v.events.length ? ' · <b>афиша</b>' : ''}</span></div>`).join('');
  if (html !== lastPlacesHtml) { lastPlacesHtml = html; $('tabPlaces').innerHTML = html; }
}
let lastPlacesHtml = '';
let nearItems = [];
$('tabPlaces').onclick = e => { const nr = e.target.closest('.near'); if (nr) { nearItems[+nr.dataset.n]?.go(); return; } const it = e.target.closest('.item'); if (!it) return; const v = venues[+it.dataset.v]; flyTo(v.x, v.z); showVenue(v); };
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

// --- свой скелет: форма
const mArch = $('mArch');
for (const a of ARCHETYPES) { const o = document.createElement('option'); o.value = a.id; o.textContent = ARCH_LABEL[a.id] || a.id; mArch.appendChild(o); }
mArch.value = 'raver';
let mineSeed = Math.floor(Math.random() * 1e9);
function previewMine() { const arch = ARCHETYPES.find(a => a.id === mArch.value); drawPortrait(randomCostume(makeRng(mineSeed * 2654435761 + 7), arch), $('minePic')); }
mArch.onchange = previewMine; $('bReroll').onclick = () => { mineSeed = Math.floor(Math.random() * 1e9); previewMine(); }; previewMine();
$('mineForm').onsubmit = e => {
  e.preventDefault();
  if (own().length >= MAX_OWN) { $('mnLimit').hidden = false; return; }
  const age = Math.max(18, Math.min(120, +$('mAge').value || 18));
  const def = { name: $('mName').value.trim(), gender: $('mGender').value, age, job: $('mJob').value.trim(), arch: mArch.value, seed: mineSeed, about: $('mAbout').value.trim().slice(0, 240) };
  if (!def.name || !def.job) return;
  mine.push(def); saveMine();
  const a = sim.spawnCustom(def, controls.target.x, controls.target.z);
  takeControl(a);
  mineSeed = Math.floor(Math.random() * 1e9); previewMine(); renderMine(); $('mAbout').value = ''; $('mName').value = ''; $('mJob').value = '';
  closeMine();
};
function renderMine() {
  const list = mine.filter(d => !d.guest);
  $('mineList').innerHTML = list.length ? `<div class="day">ваши скелеты · ${list.length}/${MAX_OWN}</div>` + list.map(d => `<div class="item${d.player ? ' cur' : ''}" data-s="${d.seed}"><span class="n">${esc(d.name)}</span><span class="r">${d.age} ${ageWord(d.age)}</span>${d.player ? '<span class="k">играет</span>' : `<button class="play" data-s="${d.seed}">играть</button>`}<span class="s">${esc(d.job)} · ${ARCH_LABEL[d.arch] || ''}${d.game ? ` · 💀 ${d.game.skulls.length} · 💚 ${d.game.friends.length} · 🃏 ${d.game.tarot?.length || 0}` : ''}</span></div>`).join('') : '';
  if (!$('tabBoard').hidden) renderBoard(false);
}
$('mineList').onclick = e => {
  const pb = e.target.closest('.play'); const it = e.target.closest('.item'); if (!it) return;
  const def = mine.find(d => String(d.seed) === it.dataset.s); const a = def && sim.agents.find(x => x.def === def); if (!a) return;
  closeMine(); if (pb) takeControl(a); else { showCard(a); flyTo(a.x, a.z); }
};

// --- лидеры: свои скелеты из этого браузера, а при настроенном Supabase — общая доска почёта
let boardRows = null;
const SCORE_HINT = 'счёт: 💀 и 💚 по 3, 🃏 по 5, 🎃 по 1';
function boardRow(r, i, me) { return `<div class="item${me ? ' me' : ''}"><span class="rank">${i + 1}</span><span class="n">${esc(r.name)}</span><span class="sc">★ ${r.score ?? 0}</span><span class="s">${esc(r.job || '')} · 💀 ${r.kills ?? 0} · 💚 ${r.friends ?? 0} · 🃏 ${r.tarot ?? 0} · 🎃 ${r.visits ?? 0}${r.deaths ? ` · ☠ ${r.deaths}` : ''}</span></div>`; }
function renderBoard(fetchRemote = true) {
  const body = $('tabBoard'); const myId = game.player ? deviceId() + ':' + game.player.def.seed : null;
  const localRows = mine.filter(d => !d.guest).map(d => { const g = d.game || {}; return { id: deviceId() + ':' + d.seed, name: d.name, job: d.job, kills: (g.skulls || []).length, friends: (g.friends || []).length, tarot: (g.tarot || []).length, visits: (g.visits || []).length, deaths: g.deaths || 0, score: scoreOf(g) }; }).sort((a, b) => b.score - a.score);
  const list = (rows, empty) => rows.length ? rows.map((r, i) => boardRow(r, i, r.id === myId)).join('') : `<div class="hint">${empty}</div>`;
  if (!remote) {
    body.innerHTML = '<div class="day">скелеты в этом браузере</div>' + list(localRows, 'пока никого: создай своего скелета') + `<div class="hint">${SCORE_HINT}. Общий рейтинг всех игроков появится, когда в config.js будет вписан Supabase (README, раздел «База»)</div>`;
    return;
  }
  const draw = (rows, note) => { body.innerHTML = '<div class="day">доска почёта</div>' + list(rows, 'пока пусто — будь первым') + `<div class="hint">${SCORE_HINT}${note ? ' · ' + note : ''}</div>`; };
  if (boardRows) draw(boardRows); else body.innerHTML = '<div class="hint">загружаем…</div>';
  if (fetchRemote) remote.top(20).then(rows => { if (rows) { boardRows = rows; draw(rows); } else draw(boardRows || localRows, 'сервер недоступен, показаны ' + (boardRows ? 'последние данные' : 'только свои скелеты')); });
}
setInterval(() => { if (remote && !$('tabBoard').hidden) renderBoard(true); }, 30000);
renderMine();
if (remote) remote.others(20).then(rows => { if (!rows) return; for (const r of rows) { if (mine.some(d => d.seed === r.seed && d.name === r.name)) continue; sim.spawnCustom({ name: r.name, gender: r.gender, age: r.age, job: r.job, arch: r.arch, seed: r.seed, guest: true, remote: true }); } });

// --- поделиться карточкой персонажа
let shareFormat = 'post';
async function renderShare() {
  const p = game.player; if (!p) return;
  await ensureFonts();
  const friends = (p.followers || []).map(f => f.costume);
  renderShareCard($('shrCv'), { def: p.def, costume: p.costume, friends, format: shareFormat, url: shareLink(p.def).replace(/^https?:\/\//, '').slice(0, 70) + '…' });
  $('shrTok').textContent = game.g.shared ? 'карточка уже публиковалась' : 'первая публикация: +1 🎟';
}
function openShare() { if (!game.player) return; $('share').hidden = false; $('shrNative').hidden = !navigator.share; renderShare(); }
$('shrClose').onclick = () => { $('share').hidden = true; };
for (const b of document.querySelectorAll('.tabs2 button')) b.onclick = () => { document.querySelectorAll('.tabs2 button').forEach(x => x.classList.toggle('on', x === b)); shareFormat = b.dataset.f; renderShare(); };
const shareText = () => { const p = game.player, g = game.g; return `Мой скелет ${p.bio.name} гуляет по Хэллоуину в Минске: 💀 ${g.skulls.length} · 💚 ${g.friends.length} · 🃏 ${g.tarot.length}/22 · 🎃 ${g.visits.length}`; };
$('shrDl').onclick = () => { download($('shrCv'), `skeleton-${shareFormat}.png`); };
$('shrCopy').onclick = async () => { const link = shareLink(game.player.def); try { await navigator.clipboard.writeText(link); $('shrCopy').textContent = 'скопировано'; setTimeout(() => $('shrCopy').textContent = '🔗 скопировать ссылку', 1500); } catch { prompt('Ссылка на скелета', link); } };
$('shrNative').onclick = async () => { const ok = await nativeShare($('shrCv'), shareText(), shareLink(game.player.def)); if (ok) { game.onShared('native'); renderShare(); } else if (ok === false) download($('shrCv'), `skeleton-${shareFormat}.png`); };
for (const b of document.querySelectorAll('.socials button')) b.onclick = () => {
  const net = b.dataset.net; const link = shareLink(game.player.def); const t = shareTargets(link, shareText());
  download($('shrCv'), `skeleton-${shareFormat}.png`);
  if (net === 'inst') { navigator.clipboard?.writeText(shareText() + ' ' + link).catch(() => { }); }
  open(t[net], '_blank', 'noopener');
  game.onShared(net); renderShare();
};

// --- клики по сцене: скелеты, маркеры, заметные здания, земля
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let downAt = null; const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); const hit = new THREE.Vector3();
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY, e.button]; });
canvas.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) follow = null; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  if (downAt[2] !== 0) return;
  if (!$('menu').hidden) { $('menu').hidden = true; $('menuBtn').classList.remove('on'); }
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const onGround = !!ray.ray.intersectPlane(groundPlane, hit);
  const th = ray.intersectObjects(tarot.pickables, false);
  if (th.length) { showTarotMarker(tarot.byId[th[0].object.userData.tarot.id]); return; }
  const a = onGround ? sim.pickAgent(ray, hit.x, hit.z) : null;
  if (a) {
    if (game.clickAgent(a)) return;
    showCard(a); if (follow) follow = a;
    if (a === game.player && !game.selected) takeControl(a);
    return;
  }
  const sh = ray.intersectObjects(shops.pickables, false);
  if (sh.length) { const it = sh[0].object.userData.shop; showShopPopup(it); game.clickShop(it); return; }
  const mh = ray.intersectObjects(markers.pickables, false);
  if (mh.length) { const v = mh[0].object.userData.venue; showVenue(v); game.clickVenue(v); return; }
  const lh = ray.intersectObjects(lms.pickables, true);
  if (lh.length) { let o = lh[0].object; while (o && !o.userData.landmark) o = o.parent; if (o) { const it = o.userData.landmark; showBuilding({ landmark: it, n: it.name, x: it.x, z: it.z, h: it.h }); return; } }
  const bld = onGround ? tiles.pickBuilding(ray, hit.x, hit.z) : null;
  if (bld && bld.n) { showBuilding(bld); return; }
  if (game.selected && onGround) { game.clickGround(hit.x, hit.z); return; }
  if (!$('popup').hidden) closePopup();
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || downAt) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const onGround = !!ray.ray.intersectPlane(groundPlane, hit);
  const over = (onGround && sim.pickAgent(ray, hit.x, hit.z)) || ray.intersectObjects(markers.pickables, false).length || ray.intersectObjects(tarot.pickables, false).length || ray.intersectObjects(shops.pickables, false).length;
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
    else if (game.player && a.leader === game.player) place(a, '💚', 'bub tag fr', 0.4);
    else if (game.player && a.state === 'wait' && a.waitFor === game.player) place(a, '…', 'bub tag', 0.4);
  }
  for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  const pt = popupVenue || popupTarot || popupShop || popupBld;
  if (pt) {
    const y = popupVenue ? (popupVenue.top || 6) + 2 + sim.H * 0.85 * 1.5 : popupShop ? 14 + sim.H * 1.3 : popupBld ? (popupBld.top || 10) + 4 : popupTarot.baseY + tarot.size;
    v3.set(pt.x, y, pt.z).project(camera);
    $('popup').style.left = ((v3.x + 1) / 2 * w | 0) + 'px'; $('popup').style.top = ((1 - v3.y) / 2 * h | 0) + 'px';
  }
}
// компас: куда на экране смотрит север
const nA = new THREE.Vector3(), nB = new THREE.Vector3();
function updateCompass() {
  nA.copy(controls.target).project(camera); nB.copy(controls.target).add(new THREE.Vector3(0, 0, -100)).project(camera);
  const ang = Math.atan2(-(nB.y - nA.y), nB.x - nA.x) * 180 / Math.PI + 90;
  $('compassArrow').style.transform = `rotate(${ang.toFixed(0)}deg)`;
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
  if (Math.abs(H - sim.H) > 0.02) { sim.setHeight(H); markers.setScale(H); tarot.setScale(H); shops.setScale(H); }
  markers.update(clock.elapsedTime); lms.update(clock.elapsedTime, dt); shops.update(clock.elapsedTime); tiles.animate(clock.elapsedTime);
  const e = camera.matrixWorld.elements; sim.camRight.set(e[0], 0, e[2]).normalize();
  const sdt = dt * +ui.spd.value;
  sim.crowd(tiles.footprint(camera), dt);
  sim.update(sdt);
  game.update(sdt, clock.elapsedTime);
  drawBubbles();
  acc += dt; if (acc > 0.5) { acc = 0; $('stPop').textContent = sim.agents.length; $('stMeet').textContent = sim.stats.meetings; $('stBeer').textContent = sim.stats.beers; $('stDance').textContent = sim.stats.dances; if (cardAgent && !$('card').hidden) $('cState').textContent = 'Состояние: ' + stateOf(cardAgent); updatePopup(); updateCompass(); }
  feedAcc += dt; if (feedAcc > 2.5) { feedAcc = 0; if (drawerTab === 'places') renderPlaces(); }
  pixel.render(scene, camera, clock.elapsedTime);
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05; frames++;
}
await tiles.ready(camera);
frame();
$('loading').remove();
window.__app = { camera, controls, sim, game, tiles, venues, tarot, lms, shops, renderShare, openShare, openDrawer, openProfile, takeControl, unfollow: () => { follow = null; }, project: (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; }, flyTo, showCard, showVenue, showBuilding, renderer, remote, mine: () => mine, perf: () => ({ frameMs: +frameMs.toFixed(2), frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tiles: tiles.stats }) };
console.log('город собран:', index.stats?.buildings, 'зданий в', Object.keys(index.tiles).length, 'тайлах,', sim.graph.walkable.length, 'узлов,', venues.length, 'заведений,', events.length, 'событий,', sim.hotspots.length, 'оживлённых мест');
