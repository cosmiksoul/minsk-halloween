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
import { Game, fmtAt } from './game.js';
import { Cards } from './cards.js';
import { Quests } from './quests.js';
import { Sfx } from './sfx.js';
import { initIntro } from './intro.js';
import { icon, installFrames, registerIcons, statLine } from './ui.js';
import { beaten, cardLabel } from './poker.js';
import { local, makeRemote, scoreOf, deviceId } from './store.js';
import { statsOf, PURSUIT, THROW_ICON, THROW_NAME, migrate, logPush, slotsOf, cardOfSlot, QUESTS } from './rules.js';
import { hostOf } from './hosts.js';
import { Hunters, genitiveCem } from './hunters.js';
import { buildLandmarks, TYPE_LABEL } from './landmarks.js';
import { Tarot, ARCANA_BY_ID } from './tarot.js';
import { Shops } from './shops.js';
import { generateCharacter } from './gen.js';
import { ensureFonts, renderShareCard, shareTargets, download, nativeShare } from './share.js';

const $ = id => document.getElementById(id);
installFrames(); registerIcons(); // рамки панелей и стили иконок до первого рендера

// --- экран загрузки: прогресс по этапам (сеть улиц самая тяжёлая) и сменные подписи
const LOAD_LINES = ['собираем кости…', 'зовём скелетов с Комаровки…', 'точим кубик d20…', 'раскладываем арканы по городу…', 'включаем фасад Футуриса…', 'наливаем пиво в барах…', 'будим упырей на кладбищах…', 'красим тыквы…', 'заводим Чижовку и Уручье…'];
const loader = {
  p: 0, target: 3, line: 0,
  start() {
    this.tick = setInterval(() => { const goal = Math.min(99, this.target + 12); this.p = Math.min(goal, this.p + (goal - this.p) * (this.p < this.target ? 0.12 : 0.012)); $('ldBar').style.width = this.p.toFixed(1) + '%'; $('ldPct').textContent = Math.round(this.p) + '%'; }, 80);
    this.iv = setInterval(() => { this.line = (this.line + 1) % LOAD_LINES.length; $('ldText').textContent = LOAD_LINES[this.line]; }, 1700);
  },
  to(v) { this.target = Math.max(this.target, Math.min(100, v)); },
  done() { this.to(100); this.p = 100; clearInterval(this.iv); clearInterval(this.tick); $('ldBar').style.width = '100%'; $('ldPct').textContent = '100%'; const l = $('loading'); setTimeout(() => { l.classList.add('out'); setTimeout(() => l.remove(), 400); }, 200); },
};
loader.start();
const canvas = $('c');
const isMobile = innerWidth < 700;
const ARCH_LABEL = { it: 'айтишник', doc: 'медик', build: 'строитель', office: 'офисный', art: 'творческий', witch: 'ведьма / маг', vamp: 'вампир', sport: 'спортсмен', transit: 'транспортник', trade: 'торговля', student: 'студент', pension: 'пенсионер', pump: 'тыквоголовый', pirate: 'пират', knight: 'рыцарь', angel: 'ангел', raver: 'рейвер', goth: 'гот', tourist: 'турист', cosmo: 'космонавт' };

// --- данные: индекс тайлов, пешеходная сеть, заведения, афиша
const BASE = 'data/map/';
const j = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
// большой файл читаем потоком, чтобы двигать прогресс по байтам; при gzip размер неизвестен, тогда полоска ползёт по времени
async function jProgress(u, from, to) {
  const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status);
  const total = r.headers.get('content-encoding') ? 0 : +r.headers.get('content-length') || 0;
  if (!r.body || !total) { const d = await r.json(); loader.to(to); return d; }
  const reader = r.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; loader.to(from + (to - from) * Math.min(1, got / total)); }
  const buf = new Uint8Array(got); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.length; }
  loader.to(to); return JSON.parse(new TextDecoder().decode(buf));
}
const [index, net, pois, eventsFile, cemFile] = await Promise.all([j(BASE + 'index.json').then(d => (loader.to(8), d)), jProgress(BASE + 'net.json', 10, 48), j(BASE + 'pois.json').then(d => (loader.to(50), d)), j('data/events.json').catch(() => ({ events: [] })), j(BASE + 'cemeteries.json').catch(() => ({ items: [] }))]);
loader.to(54);
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
await tiles.loadBig(); loader.to(64);

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

const sim = new Sim(scene, net, venues, { skelH: 8, center: index.center, hotspots: projectHotspots(index.center) }); loader.to(80);
sim.blockedAt = (x, z) => tiles.blockedAt(x, z); // препятствия для срезок: здания, вода, река, проезжие части загруженных тайлов
const markers = buildMarkers(venues, sim.danceZones); scene.add(markers.group); markers.setScale(sim.H);
const tarot = new Tarot(scene, sim, index.center, lms.items); mats.tarot = tarot.zones; tarot.setScale(sim.H);
const shops = new Shops(scene, sim, index.center); shops.setScale(sim.H);
// кладбища с проходимым узлом рядом: оттуда выходят охотники
const cems = (cemFile.items || []).map(c => ({ ...c, node: sim.graph.nearest(c.x, c.z, PURSUIT.cemNodeR) })).filter(c => c.node >= 0);
// посев по оживлённым районам; остальная толпа появляется вокруг камеры (sim.crowd)
sim.cap = isMobile ? 450 : 900;
sim.setPopulation(isMobile ? 120 : 260);

// --- пользовательские скелеты: localStorage + ссылка (+ Supabase, если настроен)
let mine = local.load();
const saveMine = () => local.save(mine);
const remote = makeRemote(); let remoteTimer = 0;
const own = () => mine.filter(d => !d.guest && !d.dead).map(def => ({ def, agent: sim.agents.find(a => a.def === def) })).filter(o => o.agent);
// слоты живых скелетов на устройстве: один по умолчанию, слот за каждую собранную руку, до пяти; старые устройства с несколькими живыми ничего не теряют
const slots = () => slotsOf(local.get('slots', 0), mine.filter(d => !d.guest && !d.dead).length);
local.set('slots', slots());
const addSlot = () => { const s = slots(); if (s >= 5) return false; local.set('slots', s + 1); renderMine(); game.renderHUD(); return true; };
const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
const shareLink = def => { const st = statsOf(def.game); return location.origin + location.pathname + '#s=' + b64(JSON.stringify({ n: def.name, g: def.gender, a: def.age, j: def.job, c: def.arch, s: def.seed, o: def.costume || undefined, b: def.about ? def.about.slice(0, 240) : undefined, st: [st.kills, st.friends, st.tarot, st.visits], sc: st.score })); };
let fromLink = null;
if (location.hash.startsWith('#s=')) { try { const o = JSON.parse(unb64(location.hash.slice(3))); fromLink = { name: o.n, gender: o.g, age: o.a, job: o.j, arch: o.c, seed: o.s, costume: o.o, about: o.b, stats: o.st, score: o.sc, guest: true }; } catch { } }

// объявлены до первого flyTo при старте: иначе ReferenceError (TDZ) у тех, у кого уже есть сохранённый скелет
let rotateTo = null, follow = null, cardAgent = null;
const game = new Game(sim, scene, {
  tarot, shops, save: saveMine, own, slots,
  showCard: (a, refresh) => { showCard(a, refresh); if (refresh && !$('profile').hidden && profileAgent === a) renderProfile(a); },
  onChange: () => { if (remote && game.player) { const p = game.player; clearTimeout(remoteTimer); remoteTimer = setTimeout(() => remote.upsert(p.def, p.def.game), 4000); } if (!$('tabBoard').hidden) renderBoard(false); },
  onPerish: p => { if (remote) { clearTimeout(remoteTimer); remote.upsert(p.def, p.def.game); } renderMine(); if (cardAgent === p) showCard(p); if (!$('tabBoard').hidden) renderBoard(false); },
});
const hunters = new Hunters({ sim, game, cemeteries: cems, remote }); game.hunters = hunters;
const cards = new Cards({ sim, game, scene, remote, hunters, addSlot, flyTo, showCard }); game.cards = cards; // карты часа: колода из рейтинга, боссы вокруг игрока
for (const def of mine) { const a = sim.spawnCustom(def, def.game?.x, def.game?.z); if (def.dead) sim.ghostify(a, 'player'); } // упокоенные стоят в городе золотыми призраками
if (fromLink && !mine.some(d => d.seed === fromLink.seed && d.name === fromLink.name)) { const a = sim.spawnCustom(fromLink); setTimeout(() => { showCard(a); flyTo(a.x, a.z); }, 300); }
{
  const playable = mine.find(d => d.player && !d.guest && !d.dead) || mine.find(d => !d.guest && !d.dead);
  if (playable) { const a = sim.agents.find(x => x.def === playable); if (a) { game.setPlayer(a); flyTo(a.x, a.z); } }
}
const quests = new Quests({ game, sim }); game.quests = quests; // онбординг: цепочка квестов на устройство
game.renderHUD(); cards.start();
// интро один раз на устройство без своих скелетов; после последнего слайда — форма, заполненная генератором
const intro = initIntro({ drawCard: (cv, c) => cards.drawCard(cv, c) }); // после интро — карта и кнопка «создать», форму не навязываем

// --- меню настроек и действий
const ui = { pop: $('pop'), spd: $('spd'), pix: $('pix') };
const fmtX = v => (+v).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×';
$('popV').textContent = fmtX(ui.pop.value);
ui.pop.oninput = () => { $('popV').textContent = fmtX(ui.pop.value); sim.density = +ui.pop.value; sim.cap = Math.round((isMobile ? 450 : 900) * Math.max(0.5, sim.density)); };
ui.spd.oninput = () => { $('spdV').textContent = fmtX(ui.spd.value); };
ui.pix.oninput = () => { $('pixV').textContent = ui.pix.value; pixel.setPixelSize(+ui.pix.value); };
$('menuBtn').innerHTML = icon('menu', 1);
$('menuBtn').onclick = () => { const m = $('menu'); m.hidden = !m.hidden; $('menuBtn').classList.toggle('on', !m.hidden); };
// звук: кнопка в шапке переключает все эффекты, флаг переживает перезагрузку
const paintSnd = () => { $('sndBtn').innerHTML = icon(Sfx.muted ? 'mute' : 'sound', 1); $('sndBtn').classList.toggle('off', Sfx.muted); $('sndBtn').title = Sfx.muted ? 'звук выключен' : 'звук включён'; };
$('sndBtn').onclick = () => { Sfx.mute(!Sfx.muted); paintSnd(); if (!Sfx.muted) Sfx.play('coin'); }; paintSnd();
$('ambChk').checked = Sfx.ambientOn; $('ambChk').onchange = () => Sfx.ambient($('ambChk').checked); // фоновый эмбиент отдельно от эффектов
$('bReset').onclick = () => location.reload();
$('bRot').onclick = () => { rotateTo = (rotateTo ?? controls.getAzimuthalAngle()) + Math.PI / 2; };
$('bNorth').onclick = () => { rotateTo = 0; };
$('compass').onclick = () => { rotateTo = 0; };
$('bParty').onclick = () => { sim.party(controls.target.x, controls.target.z, 160); };
$('bRand').onclick = () => { const a = sim.agents[Math.floor(Math.random() * sim.agents.length)]; if (a) { showCard(a); flyTo(a.x, a.z); } $('menu').hidden = true; $('menuBtn').classList.remove('on'); };
$('bNew').onclick = () => { openMine(); $('menu').hidden = true; $('menuBtn').classList.remove('on'); };

// --- выезжающая панель: места, афиша, лидеры, легенда
const DRAWER_TITLES = { places: 'Места', events: 'Афиша', board: 'Лидеры', legend: 'Легенда', quests: 'Квесты' };
let drawerTab = null;
function openDrawer(name) {
  if (drawerTab === name) { closeDrawer(); return; }
  drawerTab = name; $('drawer').hidden = false; $('drawerTitle').textContent = DRAWER_TITLES[name];
  for (const id of ['places', 'events', 'board', 'legend', 'quests']) $('tab' + id[0].toUpperCase() + id.slice(1)).hidden = name !== id;
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('on', b.dataset.drawer === name);
  document.body.classList.add('drawerOpen'); placeDrawer();
  if (name === 'places') renderPlaces(); if (name === 'board') renderBoard(true); if (name === 'quests') renderQuests(true); if (name === 'legend') renderChestList();
}
// полоса статистики внизу: весь город при текущей плотности, в кадре, встречи, пиво, танцы — с падежами
const pluralOf = (n, f) => { const a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b > 1 && b < 5 ? 1 : b === 1 ? 0 : 2]; };
function renderStats() {
  const st = sim.stats, pot = sim.potential();
  $('stats').innerHTML = `в городе ≈ <b class="city">${pot.toLocaleString('ru-RU')}</b> ${pluralOf(pot, ['скелет', 'скелета', 'скелетов'])} · в кадре <b>${sim.agents.length}</b> · <b>${st.meetings}</b> ${pluralOf(st.meetings, ['встреча', 'встречи', 'встреч'])} · <b>${st.beers}</b> пива · <b>${st.dances}</b> ${pluralOf(st.dances, ['танец', 'танца', 'танцев'])}`;
}
// список сундуков в легенде: по близости к центру кадра, открытые в этом часу — галочкой; клик летит к сундуку
function renderChestList() {
  const el = $('chestList'); if (el.hidden) return; const tx = controls.target.x, tz = controls.target.z;
  const rows = [...game.chests.items].sort((a, b) => ((a.x - tx) ** 2 + (a.z - tz) ** 2) - ((b.x - tx) ** 2 + (b.z - tz) ** 2));
  el.innerHTML = rows.map(c => `<div class="cl${c.open ? ' open' : ''}" data-x="${c.x.toFixed(1)}" data-z="${c.z.toFixed(1)}"><span>${c.open ? '✓ ' : ''}${esc(c.name)}</span><span class="muted">${fmtDist(Math.hypot(c.x - tx, c.z - tz))}</span></div>`).join('');
}
$('lgChests').onclick = () => { const el = $('chestList'); el.hidden = !el.hidden; $('lgChests').textContent = el.hidden ? 'все сундуки ▾' : 'все сундуки ▴'; renderChestList(); };
$('chestList').onclick = e => { const it = e.target.closest('.cl'); if (it) flyTo(+it.dataset.x, +it.dataset.z); };
// вкладка квестов: вся цепочка онбординга со статусом — пройдено, текущий (подсвечен), впереди
let questsKey = '';
function renderQuests(force = false) {
  const done = quests.done, cur = quests.current(); const key = done.join(',') + '|' + (game.player ? 1 : 0); if (!force && key === questsKey) return; questsKey = key;
  const rows = QUESTS.map(q => { const st = done.includes(q.id) ? 'done' : q === cur ? 'cur' : 'todo'; return `<div class="q ${st}"><span class="qi">${st === 'done' ? '✓' : st === 'cur' ? icon('quest', 1) : '·'}</span><div><b>${esc(q.title)}</b><div class="qh">${esc(q.hint)}</div></div></div>`; }).join('');
  $('tabQuests').innerHTML = `<div class="qHead">онбординг · ${done.length}/${QUESTS.length}${cur ? '' : ' · цепочка пройдена'}</div>${rows}<div class="hint">${game.player ? '' : 'квесты засчитываются своему скелету — создай его внизу. '}закрытый квест даёт столько же XP, сколько само действие (не меньше пяти); вся цепочка — спас-бросок.</div>`;
}
function placeDrawer() { if (isMobile) return; const hud = $('hud'); $('drawer').style.top = (hud.classList.contains('has') ? Math.round(hud.getBoundingClientRect().bottom + 8) : 52) + 'px'; } // без скелета панель внизу — ящик под шапкой
new ResizeObserver(() => { if (drawerTab) placeDrawer(); }).observe($('hud'));
function closeDrawer() { drawerTab = null; $('drawer').hidden = true; document.body.classList.remove('drawerOpen'); for (const b of document.querySelectorAll('.tbtn')) b.classList.remove('on'); }
const TAB_ICON = { places: 'places', events: 'afisha', board: 'leaders', legend: 'map', quests: 'quest', deck: 'arcana', how: 'dice' };
// кнопки шапки: ящики по data-drawer, остальные действия по data-act (колода арканов, «как играть»)
const TOP_ACT = { deck: () => game.openDeck(), how: () => { closeDrawer(); intro.show(); } };
for (const b of document.querySelectorAll('.tbtn')) { const k = b.dataset.drawer || b.dataset.act; b.innerHTML = icon(TAB_ICON[k] || 'map', 1) + `<span class="tlabel">${b.textContent.replace(/^[^\wА-Яа-яЁё]+/, '')}</span>`; b.onclick = () => (b.dataset.drawer ? openDrawer(b.dataset.drawer) : TOP_ACT[b.dataset.act]?.()); }
$('drawerClose').onclick = closeDrawer;

// --- свой скелет: взять управление, переключить, создать
function takeControl(a) {
  if (!a || !a.custom || a.def.guest || a.def.dead) return;
  if (game.player !== a) game.setPlayer(a);
  game.select(true); showCard(a); flyTo(a.x, a.z); follow = a; $('bFollow').classList.add('on'); renderMine();
}
// панель персонажа: свёрнутая строка → клик разворачивает карточку; в карточке «–» сворачивает, «управлять/отпустить» — управление,
// клик по самой карточке — подробный профиль. На телефоне карточка сама сворачивается через 5 с.
$('hud').onclick = e => {
  const hud = $('hud');
  if (hud.classList.contains('has') && hud.classList.contains('min')) { if (!e.target.closest('.hc, canvas.av')) expandHud(); return; }
  if (e.target.closest('.hudFold')) { foldHud(); return; }
  if (e.target.closest('.hudCtl')) { if (!game.player) return; if (game.selected) { game.select(false); showCard(game.player); } else takeControl(game.player); return; }
  if (e.target.closest('.deck')) { game.openDeck(); return; } // 🃏 на панели открывает колоду без взятия управления
  if (e.target.closest('.hudNew') || e.target.closest('.avAdd') || e.target.closest('.hudPick')) { openMine(); return; }
  const hc = e.target.closest('.hc'); if (hc) { cards.flyTo(+hc.dataset.slot); return; } // карта в полосе руки: камера к боссу
  const av = e.target.closest('canvas.av'); if (av) { const o = own().find(x => String(x.def.seed) === av.dataset.seed); if (o) takeControl(o.agent); return; }
  if (game.player && !e.target.closest('button')) openProfile(game.player); // ещё клик — подробная карточка
};
let hudTimer = 0;
function expandHud() { const hud = $('hud'); hud.classList.remove('min'); clearTimeout(hudTimer); if (isMobile) hudTimer = setTimeout(() => hud.classList.add('min'), 5000); }
function foldHud() { $('hud').classList.add('min'); clearTimeout(hudTimer); }
$('hud').classList.add('min'); // свёрнута по умолчанию: строка статуса слева сверху
function updateMbar() {
  if (!isMobile) return;
  const run = $('mbRun'); run.hidden = !game.selected; // «бег» только под управлением; полоса — запас дыхания
  if (game.selected) { run.classList.toggle('on', game.sprinting && !game.exhausted); run.classList.toggle('ex', game.exhausted); run.querySelector('.stam').style.width = `calc((100% - 8px) * ${game.stamina.toFixed(2)})`; }
  const act = $('mbAct'); const cardOpen = !$('card').hidden && cardAgent; const fb = $('bFight'), bs = $('bSelect'), bp = $('bPlay'), pg = $('pGo');
  let label = 'создать', ic = 'dice', fn = openMine, dis = false;
  if (cardOpen && !fb.hidden) { label = fb.disabled ? 'отдышись' : 'сразиться'; ic = 'boss'; fn = () => fb.click(); dis = fb.disabled; }
  else if (cardOpen && !bp.hidden) { label = 'играть'; ic = 'hand'; fn = () => bp.click(); }
  else if (cardOpen && !bs.hidden) { label = game.selected ? 'отпустить' : 'управлять'; ic = 'quest'; fn = () => bs.click(); }
  else if (!$('popup').hidden && !pg.hidden) { label = 'зайти'; ic = 'places'; fn = () => pg.click(); }
  else if (game.player) { label = game.selected ? 'отпустить' : 'управление'; ic = 'quest'; fn = () => { if (game.selected) { game.select(false); showCard(game.player); } else takeControl(game.player); }; }
  const key = ic + '|' + label + '|' + dis; if (act.dataset.key !== key) { act.dataset.key = key; act.innerHTML = icon(ic, 2) + `<small>${label}</small>`; act.disabled = dis; }
  act.onclick = fn;
}
// телефон: спринт, пока палец на кнопке «бег» (аналог Shift)
$('mbRun').innerHTML = icon('run', 2) + '<small>бег</small><i class="stam"></i>';
$('mbRun').addEventListener('pointerdown', e => { e.preventDefault(); game.sprinting = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('mbRun').addEventListener(ev, () => { game.sprinting = false; });
$('mbHand').innerHTML = icon('hand', 2) + '<small>рука</small>'; $('mbHand').onclick = () => { const hud = $('hud'); hud.classList.toggle('handOpen'); if (hud.classList.contains('handOpen')) hud.classList.add('min'); };
$('mbMap').innerHTML = icon('map', 2) + '<small>легенда</small>'; $('mbMap').onclick = () => openDrawer('legend');
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
function openMine() { const full = own().length >= slots(); $('mnLimit').hidden = !full; $('mSubmit').disabled = full; $('mine').hidden = false; renderMine(); previewMine(); if (!isMobile && !full) setTimeout(() => $('mName').focus(), 50); }
function closeMine() { $('mine').hidden = true; }
function pickPlayer() { if (game.player) return; const d = mine.find(x => !x.guest && !x.dead); if (d) { const a = sim.agents.find(x => x.def === d); if (a) game.setPlayer(a); } game.renderHUD(); }

function flyTo(x, z) { follow = null; const off = camera.position.clone().sub(controls.target); controls.target.set(x, 0, z); camera.position.copy(controls.target).add(off); }
const stateName = { walk: 'гуляет', talk: 'болтает', drink: 'пьёт пиво', dance: 'танцует', idle: 'стоит', wait: 'ждёт', follow: 'идёт следом', dead: 'рассыпался', ghost: 'летает' };
const stateOf = a => a.ghost ? stateName.ghost : stateName[a.state] || a.state;
// статистика гостя: по ссылке приходит массив [💀, 💚, 🃏, 🎃], из базы — объект { kills, friends } и счёт
const guestStats = d => { const s = d.stats; if (!s) return ''; const v = Array.isArray(s) ? { kills: s[0], friends: s[1], tarot: s[2], visits: s[3] } : s; return statLine({ score: d.score, kills: v.kills ?? 0, friends: v.friends ?? 0, tarot: v.tarot, visits: v.visits }); };
const ripText = d => `${icon('skull', 1)} упокоен навсегда${d.diedStreet ? ' у ' + esc(d.diedStreet) : ''}${d.diedAt ? ', ' + fmtAt(d.diedAt) : ''}`;
function showCard(a, refresh) {
  if (refresh && (cardAgent !== a || $('card').hidden)) return;
  cardAgent = a; $('card').hidden = false;
  game.portrait(a, $('cardPic'));
  $('cName').textContent = a.bio.name; $('cName').className = 'name' + (a === game.player ? ' player' : a.custom ? ' mine' : a.ghost ? ' ghost' : '');
  const hh = a.custom && a.def.hunter ? hunters.list.find(x => x.a === a) : null;
  $('cMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'}` + (a.custom ? (a.def.dead ? ' · упокоен навсегда' : a.def.guest ? (a.def.boss ? ' · босс часа' : a.def.ghoul ? ' · упырь' : a.def.remote ? ' · гость из сети' : ' · гость по ссылке') : a === game.player ? (game.selected ? ' · вы управляете' : ' · ваш скелет, гуляет сам') : ' · ваш скелет') : '') + (hh ? ` · охотник · ${hh.state === 'leave' ? 'уходит' : 'идёт к тебе'} · ${hh.intent === 'kill' ? '👀 убивать' : '🤝 дружить'}` : '');
  $('cJob').textContent = 'При жизни: ' + a.bio.job;
  const gs = a.custom && a.def.guest ? guestStats(a.def) : ''; $('cStatus').innerHTML = a.custom && a.def.dead ? ripText(a.def) : 'Сейчас: ' + esc(a.bio.status) + (gs ? ' · ' + gs : '');
  $('cState').textContent = 'Состояние: ' + stateOf(a);
  $('cGame').innerHTML = game.cardHtml(a);
  $('bFollow').classList.toggle('on', follow === a);
  const ownAgent = a.custom && !a.def.guest;
  $('bSelect').hidden = !(ownAgent && a === game.player); $('bSelect').textContent = game.selected ? 'отпустить' : 'управлять'; $('bSelect').classList.toggle('on', game.selected && a === game.player);
  $('bPlay').hidden = !(ownAgent && a !== game.player && !a.def.dead);
  $('bProfile').hidden = !a.custom;
  // босс часа: кнопка боя по состоянию карты (лицом — сразиться, отдыхает — секунды, бита)
  const bc = cards.cardOf(a); const fb = $('bFight'); fb.hidden = !bc || !game.player || !!a.def.dead;
  if (bc) { fb.disabled = bc.state !== 'up'; fb.innerHTML = bc.state === 'up' ? icon('boss', 1) + 'сразиться' : bc.state === 'cool' ? `${icon('clock', 1)}отдышись · ${Math.max(0, Math.ceil((bc.coolUntil - Date.now()) / 1000))} с` : 'бита'; }
}
$('bFight').onclick = () => { const a = cardAgent; if (!a || !game.player) return; const bc = cards.cardOf(a); if (!bc) return; if (!game.selected) takeControl(game.player); cards.fight(bc); };
// --- профиль своего скелета: статистика, описание, колода, шаринг, ссылка, удаление
let profileAgent = null;
function renderProfile(a) {
  $('pfName').textContent = a.bio.name; game.portrait(a, $('pfPic'));
  $('pfMeta').textContent = `${a.bio.age} ${ageWord(a.bio.age)} · ${a.bio.gender === 'm' ? 'мужчина' : 'женщина'} · ${ARCH_LABEL[a.arch] || ''}` + (a.def.guest ? ' · гость' : a === game.player ? (game.selected ? ' · под управлением' : ' · гуляет сам') : ' · ваш скелет');
  $('pfJob').textContent = 'При жизни: ' + a.bio.job; $('pfStatus').innerHTML = a.def.dead ? ripText(a.def) : 'Сейчас: ' + esc(a.bio.status) + ' · ' + stateOf(a);
  $('pfAbout').textContent = a.def.about ? 'О себе: ' + a.def.about : '';
  $('pfGame').innerHTML = a.def.guest ? (a.def.stats ? `<div class="line">${guestStats(a.def)}</div>` : '') : game.profileHtml(a);
  const ownAgent = !a.def.guest;
  $('pfSelect').hidden = !ownAgent || !!a.def.dead || (a === game.player && game.selected); $('pfPlay').hidden = true;
  $('pfDeck').hidden = !ownAgent; $('pfShare').hidden = !(ownAgent && a === game.player);
  $('pfDelete').hidden = !ownAgent; $('pfKill').hidden = !(ownAgent && a === game.player && !a.def.dead);
  renderLog();
}
function openProfile(a) { if (!a || !a.custom) return; profileAgent = a; renderProfile(a); $('profile').hidden = false; }
// --- журнал персонажа: лента боёв, набегов и находок в профиле; клик по записи с участником открывает его карточку
const LOG_ICON = { card: '🎴', cardBit: '🩸', hand: '🏆', quest: '🎯', kill: '💀', friend: '💚', fail: '💢', spawn: '🪦', bit: '🩸', win: '👑', lost: '🌫', raid_bit: '🩸', raid_beaten: '👑', raid_lost: '🌫', tarot: '🃏', visit: '🎃', buy: '🛍', death: '☠', rip: '☠', rps: '🎲', chest: '🧰' };
function logText(e, fem) {
  const v = (m, f) => fem ? f : m, nm = esc(e.name || '?'), his = e.gender === 'f' ? 'а' : '';
  const vs = `${e.foe ?? '?'}${e.bonus ? '+' + e.bonus : ''} против ${e.roll ?? '?'}${e.meBonus ? '+' + e.meBonus : ''}`;
  const rr = Array.isArray(e.rolls) && e.rolls.length >= 3 ? `, ${e.rolls[0]}${e.rolls[1] ? '+' + e.rolls[1] : ''} против ${e.rolls[2]}` : '';
  switch (e.kind) {
    case 'kill': return `гадость удалась: ${nm}, d20 ${e.roll ?? '?'}`;
    case 'friend': return `сладость удалась: ${nm}` + (e.inTail === false ? ' · машет из толпы' : '');
    case 'fail': return `провал (${e.action === 'kill' ? 'гадость' : 'сладость'}): ${nm}, d20 ${e.roll ?? '?'}`;
    case 'spawn': return `с ${e.cem ? esc(genitiveCem(e.cem)) : 'кладбища'} вылез${his} ${nm}`;
    case 'bit': return `${nm} укусил${his}, ${vs}`;
    case 'win': return `победа над охотником: ${nm}, ${e.boss ? 'босс-' : ''}${e.intent === 'kill' ? 'череп' : 'сердечко'}, ${vs}`;
    case 'lost': return `${nm} потерял${his} след`;
    case 'raid_bit': return e.outcome === 'rip' ? `твой скелет упокоил навсегда гостя: ${nm}${e.place ? ' · ' + esc(e.place) : ''}${rr}` : `твой скелет укусил гостя: ${nm}${e.place ? ' · ' + esc(e.place) : ''}${rr}`;
    case 'raid_beaten': return `${nm} побил${his} твоего скелета${e.place ? ' · ' + esc(e.place) : ''}${rr}`;
    case 'raid_lost': return `твой скелет потерял гостя: ${nm}${e.place ? ' · ' + esc(e.place) : ''}`;
    case 'card': return `${esc(e.cardName || e.card || 'карта')} ${beaten(e.rank)}: ${nm}, ${vs}`;
    case 'cardBit': return `${nm} (${esc(e.card || '?')}) укусил${his}, ${vs}`;
    case 'hand': return `рука собрана: ${esc(e.name || '?')} ×${e.mult ?? 1}, +${e.xp ?? 0} XP`;
    case 'quest': return `квест «${esc(e.title || e.id || '?')}»: +${e.bonus ?? 0} XP`;
    case 'tarot': return `аркана ${nm}`;
    case 'visit': return `заведение ${nm}`;
    case 'buy': return `купил${v('', 'а')} ${esc(e.item || '')}`;
    case 'death': return `рассыпал${v('ся', 'ась')}${e.coinsLost ? `, −${e.coinsLost} 🪙` : ''}`;
    case 'rip': return `упокоен${v('', 'а')} навсегда`;
    case 'rps': { const bonus = e.bonus === 'shield' ? '+щит' : e.bonus === 'refund' ? 'ставка обратно' : '+' + esc(e.bonus || ''); const reset = e.reset >= 100 ? 'чист' : `−${(e.reset || 0) / 20}`; return `сыграл${v('', 'а')} с ${esc(e.host || '?')} в «${esc(e.place || '?')}»: ${THROW_ICON[e.mine] || '?'} против ${THROW_ICON[e.theirs] || '?'}, ${e.won ? 'выиграл' : 'проиграл'}${v('', 'а')} · ${bonus} · розыск ${reset}`; }
    case 'chest': return e.outcome === 'locked' ? `сундук «${nm}» заперт` : e.outcome === 'mimic' ? `мимик в сундуке «${nm}»` : `сундук «${nm}»: +${e.coins ?? 0} 🪙${e.token ? ' · 🎟 +1' : ''}`;
    default: return esc(e.kind);
  }
}
const journalAgent = () => profileAgent && !profileAgent.def.guest ? profileAgent : game.player;
function renderLog() {
  const a = journalAgent(); const box = $('journal');
  if (!a || !a.def.game || a.def.guest) { box.hidden = true; box.innerHTML = ''; return; }
  const g = migrate(a.def.game); const fem = a.bio.gender === 'f';
  const rows = g.log.slice(0, 50).map((e, i) => `<div class="e${e.boss || e.kind === 'raid_beaten' ? ' boss' : ''}${['fail', 'bit', 'death', 'raid_beaten'].includes(e.kind) ? ' bad' : ''}${e.uid || (e.kind === 'tarot' && e.id != null) ? ' clickable' : ''}" data-i="${i}"><span class="t">${esc(fmtAt(e.at))}</span><span class="ic">${LOG_ICON[e.kind] || '·'}</span><span class="x">${logText(e, fem)}</span></div>`).join('');
  box.innerHTML = rows ? `<div class="day">журнал · ${g.log.length}</div>${rows}` : '<div class="hint">журнал пуст: иди к прохожим и в заведения</div>'; box.hidden = false;
}
$('journal').onclick = e => { const el = e.target.closest('.e'); if (!el) return; const a = journalAgent(); const entry = a && a.def.game && a.def.game.log[+el.dataset.i]; if (!entry) return; if (entry.kind === 'tarot' && entry.id != null) { const ar = ARCANA_BY_ID[entry.id]; if (ar) game.showTarot(ar, false, migrate(a.def.game)); return; } if (!entry.uid) return; const who = sim.agents.find(x => x.uid === entry.uid); if (who) { closeProfile(); showCard(who); flyTo(who.x, who.z); } };
game.o.onLog = () => { if (!$('profile').hidden) renderLog(); };
function closeProfile() { $('profile').hidden = true; profileAgent = null; hideTip(); }
$('pfClose').onclick = closeProfile;
$('profile').addEventListener('click', e => { if (e.target === $('profile')) closeProfile(); });
$('pfSelect').onclick = () => { takeControl(profileAgent); closeProfile(); };
$('pfDeck').onclick = () => { if (!profileAgent) return; closeProfile(); game.openDeck(migrate(profileAgent.def.game)); };
$('pfGame').addEventListener('click', e => { const el = e.target.closest('.arc'); if (!el || !profileAgent) return; const a = ARCANA_BY_ID[el.dataset.arc]; if (a) game.showTarot(a, false, migrate(profileAgent.def.game)); }); // фишка арканы в профиле открывает карту
$('pfShare').onclick = () => { closeProfile(); openShare(); };
// подтверждение в игре вместо браузерного confirm (тот блокирует страницу)
function confirmBox(text, yes = 'да') {
  return new Promise(res => { const b = $('confirm'); $('cfText').textContent = text; $('cfYes').textContent = yes; b.hidden = false;
    const done = v => { b.hidden = true; $('cfYes').onclick = $('cfNo').onclick = $('cfClose').onclick = null; res(v); };
    $('cfYes').onclick = () => done(true); $('cfNo').onclick = $('cfClose').onclick = () => done(false); });
}
// «убить»: упокоить своего скелета навсегда (пермасмерть как без монет — призрак, dead в базе) и сразу завести нового
$('pfKill').onclick = async () => {
  const a = profileAgent; if (!a || a !== game.player || a.def.dead) return; closeProfile();
  const ok = await confirmBox(`Убить ${a.bio.name} и завести нового? Скелет станет призраком навсегда, XP обнулится; его история и арканы останутся в профиле.`, 'убить');
  if (!ok) return; game.perish(); openMine();
};
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
function resetPopup() { popupVenue = popupTarot = popupShop = popupBld = null; for (const id of ['pType', 'pAddr', 'pHours', 'pRate', 'pInside', 'pHost']) $(id).textContent = ''; $('pEvents').innerHTML = ''; $('pWeb').innerHTML = ''; $('popup').hidden = false; }
function closePopup() { $('popup').hidden = true; popupVenue = popupTarot = popupShop = popupBld = null; }
const nearCount = (x, z, r = 60) => sim.agents.filter(a => !a.ghost && (a.x - x) ** 2 + (a.z - z) ** 2 < r * r).length;
// хозяин заведения: имя всегда, любимый жест после первой партии (его помнит прогресс)
function hostLine(kind, place) { const h = hostOf(kind, place); const fav = game.g && game.g.hosts && game.g.hosts[h.key]; return `хозяин: ${h.name}` + (fav ? ` · любит ${THROW_NAME[fav]}` : ''); }
function showShopPopup(sh) {
  resetPopup(); popupShop = sh; $('pHost').textContent = hostLine('shop', sh);
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
  resetPopup(); popupVenue = v; $('pGo').textContent = '🎃 зайти своим скелетом'; $('pHost').textContent = hostLine('bar', v);
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
$('hmark').onclick = () => { const h = hunters.nearest(); if (h) { flyTo(h.a.x, h.a.z); showCard(h.a); } };
$('bmark').innerHTML = icon('boss', 2); $('bmark').onclick = () => { const slot = +$('bmark').dataset.slot; if (slot) cards.flyTo(slot); }; // стрелка на босса руки
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
  if (own().length >= slots()) { $('mnLimit').hidden = false; return; }
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
  const alive = list.filter(d => !d.dead).length;
  $('mineList').innerHTML = list.length ? `<div class="day">ваши скелеты · ${alive}/${slots()}${slots() < 5 ? ' · следующий слот за собранную руку' : ''}</div>` + list.map(d => `<div class="item${d.player ? ' cur' : ''}${d.dead ? ' dead' : ''}" data-s="${d.seed}"><span class="n">${d.dead ? '☠ ' : ''}${esc(d.name)}</span><span class="r">${d.age} ${ageWord(d.age)}</span>${d.dead ? `<span class="k">упокоен ${esc(fmtAt(d.diedAt))}</span>` : d.player ? '<span class="k">играет</span>' : `<button class="play" data-s="${d.seed}">играть</button>`}<span class="s">${esc(d.job)} · ${ARCH_LABEL[d.arch] || ''}${d.game ? (st => ` · XP ${st.score} · ❤ ${st.hearts} · 💚 ${st.tail} · 💀 ${st.kills} · 🃏 ${st.tarot}`)(statsOf(d.game)) : ''}</span></div>`).join('') : '';
  if (!$('tabBoard').hidden) renderBoard(false);
}
$('mineList').onclick = e => {
  const pb = e.target.closest('.play'); const it = e.target.closest('.item'); if (!it) return;
  const def = mine.find(d => String(d.seed) === it.dataset.s); const a = def && sim.agents.find(x => x.def === def); if (!a) return;
  closeMine(); if (pb) takeControl(a); else { showCard(a); flyTo(a.x, a.z); }
};

// --- лидеры: свои скелеты из этого браузера, а при настроенном Supabase — общая доска почёта
let boardRows = null;
const SCORE_HINT = 'XP: победа +2, поражение −1, аркана +5, новое заведение +1, босс 2 × старшинство';
// строка доски: карта колоды часа canvas'ом по данным колоды (та же строка id), без базы карт нет; статы одной функцией с иконками
function boardRow(r, i, me) {
  const slot = remote && cards.deck.length && !r.dead ? cards.deck.findIndex(x => x.id === r.id) + 1 : 0;
  const cv = slot >= 1 && slot <= 52 ? `<canvas class="bcv" width="24" height="33" data-slot="${slot}" title="карта в колоде часа"></canvas>` : '<span class="bcv"></span>';
  const st = r.dead ? `${icon('skull', 1)} упокоен` : statLine({ hearts: r.hearts ?? '?', tail: r.tail ?? 0 });
  return `<div class="item${me ? ' me' : ''}"><span class="rank">${i + 1}</span>${cv}<span class="n">${esc(r.name)}</span><span class="sc">${icon('xp', 1)} ${r.score ?? 0}</span><span class="st" title="сердца и хвост">${st}</span><span class="s">${esc(r.job || '')} · ${statLine({ kills: r.kills ?? 0, friends: r.friends ?? 0, tarot: r.tarot ?? 0, visits: r.visits ?? 0, deaths: r.deaths || 0 }, { tail: false })}</span></div>`;
}
function drawBoardCards() {
  for (const cv of document.querySelectorAll('#tabBoard canvas.bcv')) { const slot = +cv.dataset.slot; if (!slot) continue; const tmp = document.createElement('canvas'); tmp.width = 32; tmp.height = 44; cards.drawCard(tmp, { ...cardOfSlot(slot), state: 'up' }); const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 24, 33); g.drawImage(tmp, 0, 0, 24, 33); }
}
function renderBoard(fetchRemote = true) {
  const body = $('tabBoard'); const myId = game.player ? deviceId() + ':' + game.player.def.seed : null;
  const localRows = mine.filter(d => !d.guest).map(d => { const st = statsOf(d.game); return { id: deviceId() + ':' + d.seed, name: d.name, job: d.job, kills: st.kills, friends: st.friends, tarot: st.tarot, visits: st.visits, deaths: st.deaths, score: st.score, hearts: st.hearts, tail: st.tail, wins: st.wins, losses: st.losses, dead: !!d.dead }; }).sort((a, b) => b.score - a.score);
  const list = (rows, empty) => rows.length ? rows.map((r, i) => boardRow(r, i, r.id === myId)).join('') : `<div class="hint">${empty}</div>`;
  if (!remote) {
    body.innerHTML = '<div class="day">скелеты в этом браузере</div>' + list(localRows, 'пока никого: создай своего скелета') + `<div class="hint">${SCORE_HINT}. Общий рейтинг всех игроков появится, когда в config.js будет вписан Supabase (README, раздел «База»)</div>`;
    drawBoardCards(); return;
  }
  const draw = (rows, note) => { body.innerHTML = '<div class="day">доска почёта</div>' + list(rows, 'пока пусто — будь первым') + `<div class="hint">${SCORE_HINT}${note ? ' · ' + note : ''}</div>`; drawBoardCards(); };
  if (boardRows) draw(boardRows); else body.innerHTML = '<div class="hint">загружаем…</div>';
  if (fetchRemote) remote.top(52).then(rows => { if (rows) { boardRows = rows; draw(rows); } else draw(boardRows || localRows, 'сервер недоступен, показаны ' + (boardRows ? 'последние данные' : 'только свои скелеты')); });
}
setInterval(() => { if (remote && !$('tabBoard').hidden) renderBoard(true); }, 30000);
renderMine();
// набеги моих скелетов в чужих городах: всё новое с прошлого входа ложится в журнал хозяина; где я жертва, уже записано в момент дуэли
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return h >= 11 && h <= 14 ? c : m === 1 ? a : m >= 2 && m <= 4 ? b : c; };
if (remote) remote.raids(local.get('raids.seen', '1970-01-01T00:00:00Z')).then(rows => {
  if (!rows || !rows.length) return;
  let n = 0, newest = local.get('raids.seen', '1970-01-01T00:00:00Z');
  for (const row of rows) {
    if (row.at > newest) newest = row.at;
    if (row.hunter_device !== deviceId()) continue;
    const def = mine.find(d => !d.guest && deviceId() + ':' + d.seed === row.hunter); if (!def) continue;
    const kind = row.outcome === 'bit' || row.outcome === 'killed' || row.outcome === 'rip' ? 'raid_bit' : row.outcome === 'skull' || row.outcome === 'heart' ? 'raid_beaten' : 'raid_lost';
    def.game = migrate(def.game); logPush(def.game, { kind, name: row.victim_name, place: row.place, rolls: row.rolls, level: row.level, outcome: row.outcome, at: row.at }); n++;
  }
  local.set('raids.seen', newest); if (!n) return; saveMine();
  if (game.player) game.notify(`пока тебя не было: ${n} ${plural(n, 'набег', 'набега', 'набегов')}`, 'afisha', 4000);
  if (game.o.onLog) game.o.onLog();
});
if (remote) remote.others(20).then(rows => { if (!rows) return; for (const r of rows) { if (mine.some(d => d.seed === r.seed && d.name === r.name)) continue; const a = sim.spawnCustom({ name: r.name, gender: r.gender, age: r.age, job: r.job, arch: r.arch, seed: r.seed, guest: true, remote: true, rid: r.id, device: r.device, stats: { kills: r.kills || 0, friends: r.friends || 0 }, costume: r.costume || undefined, score: r.score || 0, dead: !!r.dead }); if (r.dead) sim.ghostify(a, 'player'); } });

// --- поделиться карточкой персонажа
let shareFormat = 'post';
async function renderShare() {
  const p = game.player; if (!p) return;
  await ensureFonts();
  const friends = (p.followers || []).map(f => f.costume);
  renderShareCard($('shrCv'), { def: p.def, costume: p.costume, friends, format: shareFormat, myCard: cards.myCard(), url: shareLink(p.def).replace(/^https?:\/\//, '').slice(0, 70) + '…' });
  $('shrTok').textContent = game.g.shared ? 'карточка уже публиковалась' : 'первая публикация: +1 🎟';
}
function openShare() { if (!game.player || (game.modal && game.modal !== 'share')) return; game.setModal('share'); $('shrNative').hidden = !navigator.share; renderShare(); }
$('shrClose').onclick = () => { if (game.modal === 'share') game.setModal(null); };
for (const b of document.querySelectorAll('.tabs2 button')) b.onclick = () => { document.querySelectorAll('.tabs2 button').forEach(x => x.classList.toggle('on', x === b)); shareFormat = b.dataset.f; renderShare(); };
const shareText = () => { const p = game.player, st = statsOf(game.g); return `Мой скелет ${p.bio.name} гуляет по Хэллоуину в Минске: XP ${st.score} · 💀 ${st.kills} · 💚 ${st.friends} · 🃏 ${st.tarot}/22 · 🎃 ${st.visits}`; };
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
const SLOP = e => e.pointerType === 'touch' ? 18 : 6; // пальцем тап дрожит сильнее мыши
canvas.addEventListener('pointermove', e => { if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > SLOP(e) + 2) follow = null; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > SLOP(e)) return;
  if (downAt[2] !== 0) return;
  if (!$('menu').hidden) { $('menu').hidden = true; $('menuBtn').classList.remove('on'); }
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const onGround = !!ray.ray.intersectPlane(groundPlane, hit);
  const th = ray.intersectObjects(tarot.pickables, false);
  if (th.length) { showTarotMarker(tarot.byId[th[0].object.userData.tarot.id]); return; }
  const a = onGround ? sim.pickAgent(ray, hit.x, hit.z, e.pointerType === 'touch' ? sim.H * 0.6 : 0) : null; // пальцем — с допуском вокруг фигурки
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
  const place = (a, text, cls, dy, html = null) => {
    v3.set(a.x, sim.H + dy + (a.state === 'dance' ? sim.H * 0.07 : 0) + (a.ghost ? sim.H * 0.2 : 0), a.z).project(camera);
    if (v3.z > 1 || v3.x < -1.1 || v3.x > 1.1 || v3.y < -1.1 || v3.y > 1.1) return;
    let el = pool[n]; if (!el) { el = document.createElement('div'); bubLayer.appendChild(el); pool.push(el); }
    el.className = cls; if (html) el.innerHTML = html; else el.textContent = text;
    el.style.transform = `translate(${((v3.x + 1) / 2 * w) | 0}px, ${((1 - v3.y) / 2 * h) | 0}px) translate(-50%,-100%)`;
    el.style.display = ''; n++;
  };
  for (const a of sim.agents) {
    if (n > 90) break;
    if (a.bubble && a.bubble.until < sim.time) a.bubble = null;
    if (a.bubble) place(a, a.bubble.text, 'bub ' + a.bubble.kind, 0.8);
    else if (a.custom) { // у босса подпись золотая: сверху карта часа, под ней имя; у себя оранжевая
      const boss = a !== game.player && cards.cardOf(a); const nm = a.bio.name.split(' ')[0];
      place(a, nm, 'bub tag' + (a === game.player ? ' me' : boss ? ' boss' : ''), 0.4, boss ? `<i class="tagCard" style="background-image:url(${cards.cardImage(boss)})"></i><span>${nm.replace(/[<&]/g, ch => ch === '<' ? '&lt;' : '&amp;')}</span>` : null);
    }
    else if (game.player && a.leader === game.player) place(a, '💚', 'bub tag fr', 0.4);
    else if (game.player && a.state === 'wait' && a.waitFor === game.player) place(a, '…', 'bub tag', 0.4);
  }
  for (let i = n; i < pool.length; i++) pool[i].style.display = 'none';
  // метка направления на ближайшего охотника у края экрана, пока он вне кадра; в кадре его и так видно
  const hm = $('hmark'); const nh = hunters.nearest();
  if (nh && game.player) {
    v3.set(nh.a.x, sim.H, nh.a.z).project(camera);
    if (v3.x > -1 && v3.x < 1 && v3.y > -1 && v3.y < 1) hm.hidden = true;
    else {
      const k = 1 / Math.max(Math.abs(v3.x), Math.abs(v3.y), 1e-6); const m = 24;
      hm.style.left = Math.max(m, Math.min(w - m, (v3.x * k + 1) / 2 * w)) + 'px'; hm.style.top = Math.max(m, Math.min(h - m, (1 - v3.y * k) / 2 * h)) + 'px';
      const d = Math.hypot(nh.a.x - game.player.x, nh.a.z - game.player.z); hm.classList.toggle('hot', d < PURSUIT.nearWarn); hm.title = `${nh.a.bio.name} · ${Math.round(d)} м`; hm.hidden = false;
    }
  } else hm.hidden = true;
  // стрелка на ближайшего босса руки (карта лицом) у края экрана, пока он вне кадра: только под управлением и когда рука есть
  const bm = $('bmark'); const nb = game.player && game.selected && cards.hand ? cards.nearestUp() : null;
  if (nb) {
    v3.set(nb.a.x, sim.H, nb.a.z).project(camera);
    if (v3.x > -1 && v3.x < 1 && v3.y > -1 && v3.y < 1) bm.hidden = true;
    else {
      const k = 1 / Math.max(Math.abs(v3.x), Math.abs(v3.y), 1e-6); const m = 26, mTop = isMobile ? 26 : 64; // сверху ниже шапки, чтобы стрелка не пряталась под кнопками
      bm.style.left = Math.max(m, Math.min(w - m, (v3.x * k + 1) / 2 * w)) + 'px'; bm.style.top = Math.max(mTop, Math.min(h - (isMobile ? 80 : m), (1 - v3.y * k) / 2 * h)) + 'px';
      bm.title = `${cardLabel(nb.card.rank, nb.card.suit)} · ${nb.card.name} · ${Math.round(nb.d)} м`; bm.dataset.slot = nb.card.slot; bm.hidden = false;
    }
  } else bm.hidden = true;
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
  hunters.update(sdt);
  cards.update(sdt);
  drawBubbles();
  acc += dt; if (acc > 0.5) { acc = 0; updateMbar(); if (drawerTab === 'quests') renderQuests(); renderStats(); if (cardAgent && !$('card').hidden) $('cState').textContent = 'Состояние: ' + stateOf(cardAgent); updatePopup(); updateCompass(); }
  feedAcc += dt; if (feedAcc > 2.5) { feedAcc = 0; if (drawerTab === 'places') renderPlaces(); if (drawerTab === 'legend') renderChestList(); }
  pixel.render(scene, camera, clock.elapsedTime);
  frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05; frames++;
}
loader.to(88); await tiles.ready(camera);
frame();
loader.done();
if (!mine.some(d => !d.guest) && !intro.seen) setTimeout(() => intro.show(), 400);
window.__app = { camera, controls, sim, game, tiles, venues, tarot, lms, shops, hunters, renderShare, openShare, openDrawer, openProfile, takeControl, unfollow: () => { follow = null; }, project: (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; }, flyTo, showCard, showVenue, showBuilding, renderer, remote, mine: () => mine, slots, addSlot, cards, quests, intro, perf: () => ({ frameMs: +frameMs.toFixed(2), frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, tiles: tiles.stats }) };
console.log('город собран:', index.stats?.buildings, 'зданий в', Object.keys(index.tiles).length, 'тайлах,', sim.graph.walkable.length, 'узлов,', venues.length, 'заведений,', events.length, 'событий,', sim.hotspots.length, 'оживлённых мест,', cems.length, 'кладбищ с узлами');
