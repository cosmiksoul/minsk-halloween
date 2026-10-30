// Симуляция: граф улиц из OSM, по которому ходят скелеты; встречи, бары, танцы,
// а также состояния для игры: игрок, ожидание, друг-попутчик, призрак.
import * as THREE from 'three';
import { FRAMES, FW, FH, NF, randomCostume, drawStrip, drawGhostStrip, GHOSTS } from './skeletons.js';
import { LINES, makeRng, pick, pickArchetype, makeBio, ARCHETYPES, chatLine } from './bio.js';
import { Graph } from './graph.js';
import { CUT, shouldCut } from './rules.js';
import { segmentClear } from './geo.js';
export { Graph };

const WALK_SPEED = 3.4; // м/с: скелеты выше людей, поэтому и шаг шире
const PICK_V = new THREE.Vector3();
const ACCEL = 0.22; // с: за сколько управляемый или ведомый набирает скорость (разгон вместо рывка с места)
const HSCALE = { pension: 0.94, student: 0.97, sport: 1.05, knight: 1.05, build: 1.03, cosmo: 1.04 }; // рост по архетипу, плюс личный разброс ±6 %
const COSTUMES_PER_ARCH = 28; // размер пула текстур на архетип: экономим память при тысячах скелетов

export class Sim {
  constructor(scene, net, venues, opts = {}) {
    this.scene = scene; this.H = opts.skelH || 8;
    this.graph = new Graph(net.roads);
    this.agents = []; this.sprites = []; this.stats = { meetings: 0, beers: 0, dances: 0 };
    this.seed = 1; this.time = 0; this.meetTimer = 0;
    this.camRight = new THREE.Vector3(1, 0, 0);
    this.pool = new Map(); this.ghostTex = {}; // текстуры призраков по роли: npc (голубой), player (золотой)
    this.onArrive = null; // колбэк игры: игрок дошёл до узла
    this.onEnter = null;  // колбэк игры: скелет зашёл в заведение
    this.density = 1; this.cap = 900; this.crowdTimer = 0; this.lastFp = null;
    // заведения привязываем к узлам графа
    this.venues = venues; this.venueNode = new Map();
    // узел — для прохожих и списков (80 м); вход для игрока (tx, tz) — точка сети, куда приведёт moveTo, своя у каждого бара:
    // на Революционной три бара делят один узел, и по узлу их не различить — явный визит считается по входу
    for (const v of venues) { v.node = this.graph.nearest(v.x, v.z, 80); const T = this.graph.targetPoint(v.x, v.z, 140); if (T) { v.tx = T.x; v.tz = T.z; if (v.node < 0) v.node = T.node; } if (v.node >= 0) this.venueNode.set(v.node, v); }
    this.active = venues.filter(v => v.node >= 0);
    this.center = opts.center; const [lat0, lon0] = opts.center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
    const pr = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
    this.danceZones = [[...pr(53.9025, 27.5620), 'Октябрьская площадь', 50], [...pr(53.9083, 27.5752), 'площадь Победы', 50], [...pr(53.9045, 27.5560), 'площадь Свободы', 45], [...pr(53.9050, 27.5578), 'Зыбицкая', 40], [...pr(53.9052, 27.5530), 'Немига', 40]];
    [this.cx, this.cz] = pr(53.9030, 27.5600); // центр тусовки
    // оживлённые районы: узлы в радиусе каждого, вес для выбора
    this.hotspots = (opts.hotspots || []).map(h => ({ ...h, nodes: this.graph.within(h.x, h.z, h.r) })).filter(h => h.nodes.length >= 5);
    this.hotTotal = this.hotspots.reduce((s, h) => s + h.w, 0);
  }

  makeTexture(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(1 / NF, 1); return tex;
  }
  // пул костюмов: у тысяч скелетов общие текстуры, различаются только биографии
  pooled(arch, idx) {
    const key = arch.id + ':' + idx; let e = this.pool.get(key);
    if (!e) { const costume = randomCostume(makeRng((idx + 1) * 97 + arch.id.length * 7919), arch); e = { costume, tex: this.makeTexture(drawStrip(costume)) }; this.pool.set(key, e); }
    return e;
  }
  addAgent(arch, costume, baseTex, bio, rng, from, custom) {
    const g = this.graph; const tex = baseTex.clone();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    const hs = custom ? 1 : (HSCALE[arch.id] || 1) * (0.94 + rng() * 0.12); // свой скелет — эталонного роста
    sprite.center.set(0.5, 0); sprite.scale.set(this.H * FW / FH * hs, this.H * hs, 1);
    const e = pick(rng, g.adj[from]);
    const a = { id: this.seed++, uid: 0, arch: arch.id, costume, bio, tex, base: custom ? baseTex : null, sprite, rng, from, to: e.to, len: e.len, t: rng(), speed: WALK_SPEED * (0.8 + rng() * 0.5),
      state: 'walk', timer: 0, anim: rng() * 10, face: 1, cooldown: rng() * 10, thirst: 30 + rng() * 180, path: null, target: null, bubble: null, script: null, partner: null, x: 0, z: 0, lastDance: -100, venue: null, custom: !!custom, hs,
      player: false, ghost: false, leader: null, waitFor: null, home: null, dest: null, moving: false, auto: false, driven: false, ambient: false, ck: null, born: this.time };
    sprite.userData.agent = a;
    this.place(a); this.scene.add(sprite); this.agents.push(a); this.sprites.push(sprite);
    return a;
  }
  spawn() {
    const uid = this.seed; const rng = makeRng(uid * 7919 + 13);
    const arch = pickArchetype(rng); const bio = makeBio(rng, arch);
    const [node, home] = this.spawnNode(rng);
    const ci = Math.floor(rng() * COSTUMES_PER_ARCH); const { costume, tex } = this.pooled(arch, ci);
    const a = this.addAgent(arch, costume, tex, bio, rng, node, false); a.uid = uid; a.home = home; a.ck = arch.id + ':' + ci; return a;
  }
  // прохожий в заданном узле: для толпы вокруг камеры. Дом — ближайшее оживлённое место или сама точка
  spawnAt(node) {
    const uid = this.seed; const rng = makeRng(uid * 7919 + 13);
    const arch = pickArchetype(rng); const bio = makeBio(rng, arch);
    const ci = Math.floor(rng() * COSTUMES_PER_ARCH); const { costume, tex } = this.pooled(arch, ci);
    const a = this.addAgent(arch, costume, tex, bio, rng, node, false); a.uid = uid; a.ck = arch.id + ':' + ci; a.ambient = true;
    const g = this.graph; let home = null;
    for (const h of this.hotspots) if ((h.x - g.x[node]) ** 2 + (h.z - g.z[node]) ** 2 < (h.r * 1.5) ** 2) { home = h; break; }
    a.home = home || { x: g.x[node], z: g.z[node], r: 350 + rng() * 300 };
    return a;
  }
  // друг игрока, которого воссоздаём после перезагрузки по записи в карточке
  spawnFriend(rec, nearX, nearZ) {
    const rng = makeRng((rec.uid || 1) * 7919 + 13);
    const arch = ARCHETYPES.find(x => x.id === rec.arch) || pickArchetype(rng);
    const [ck, ciStr] = (rec.ck || '').split(':'); const ci = ck === arch.id && ciStr ? +ciStr : Math.floor(rng() * COSTUMES_PER_ARCH);
    const { costume, tex } = this.pooled(arch, ci);
    const bio = { name: rec.name, gender: rec.gender, age: rec.age, job: rec.job, status: makeBio(rng, arch).status };
    let node = this.graph.nearest(nearX, nearZ, 300); if (node < 0) node = this.spawnNode(rng)[0];
    const a = this.addAgent(arch, costume, tex, bio, rng, node, false); a.uid = rec.uid || a.id; a.ck = arch.id + ':' + ci; return a;
  }
  // пользовательский скелет: имя, пол, возраст, работа, архетип и зерно для костюма
  spawnCustom(def, nearX, nearZ) {
    const rng = makeRng((def.seed || 1) * 2654435761 + 7);
    const arch = ARCHETYPES.find(a => a.id === def.arch) || pickArchetype(rng);
    let costume = def.costume ? { ...def.costume } : randomCostume(rng, arch); let strip;
    try { strip = drawStrip(costume); } catch { costume = randomCostume(rng, arch); strip = drawStrip(costume); } // битый костюм из базы или ссылки не должен ронять игру
    const bio = { name: def.name, gender: def.gender, age: def.age, job: def.job, status: makeBio(makeRng(def.seed || 1), arch).status };
    let from = nearX != null ? this.graph.nearest(nearX, nearZ, 300) : -1; if (from < 0) from = this.spawnNode(rng)[0];
    const a = this.addAgent(arch, costume, this.makeTexture(strip), bio, rng, from, true); a.def = def; return a;
  }
  // новый костюм для своего скелета (после покупки в магазине)
  recostume(a, costume) {
    if (a.ghost) return;
    a.costume = costume; const base = this.makeTexture(drawStrip(costume)); const oldTex = a.tex, oldBase = a.base;
    a.tex = base.clone(); a.base = base; a.sprite.material.map = a.tex; a.sprite.material.needsUpdate = true;
    oldTex.dispose(); if (oldBase) oldBase.dispose();
  }
  spawnNode(rng) {
    const g = this.graph;
    if (this.hotTotal > 0) {
      let r = rng() * this.hotTotal, h = this.hotspots[0];
      for (const x of this.hotspots) { r -= x.w; if (r <= 0) { h = x; break; } }
      return [pick(rng, h.nodes), h];
    }
    for (let i = 0; i < 40; i++) {
      const n = pick(rng, g.walkable);
      if (Math.hypot(g.x[n] - this.cx, g.z[n] - this.cz) < 700 || rng() < 0.12) return [n, null];
    }
    return [pick(rng, g.walkable), null];
  }
  remove(a) {
    this.scene.remove(a.sprite); a.tex.dispose(); if (a.base) a.base.dispose(); a.sprite.material.dispose();
    this.agents.splice(this.agents.indexOf(a), 1); this.sprites.splice(this.sprites.indexOf(a.sprite), 1);
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.cooldown = 5; }
    if (a.venue) { a.venue.inside--; a.venue = null; }
    if (a.followers) for (const f of [...a.followers]) this.unfriend(f);
    if (a.leader) this.unfriend(a);
  }
  setPopulation(n) {
    const count = () => this.agents.filter(a => !a.custom && !a.ambient).length;
    while (count() < n) this.spawn();
    while (count() > n) { const a = [...this.agents].reverse().find(x => !x.custom && !x.ambient && !x.leader && !x.ghost && x.state !== 'wait'); if (!a) break; this.remove(a); }
  }
  setHeight(h) { this.H = h; for (const a of this.agents) { const s = h * (a.hs || 1); a.sprite.scale.set(s * FW / FH, s, 1); } }
  // сколько скелетов было бы на всех улицах города сразу: та же формула, что у crowd() для кадра, но на всю застроенную площадь графа
  potential() { const km2 = this.graph.grid.size * this.graph.cell ** 2 / 1e6; return Math.round((km2 * 70 + this.hotTotal * 5) * this.density); }

  place(a) {
    if (a.free || a.state === 'cut') { a.sprite.position.set(a.x, 0.5, a.z); return; } // вне графа координаты хранятся прямо
    const g = this.graph; a.x = g.x[a.from] + (g.x[a.to] - g.x[a.from]) * a.t; a.z = g.z[a.from] + (g.z[a.to] - g.z[a.from]) * a.t;
    a.sprite.position.set(a.x, 0.5, a.z);
  }
  say(a, text, kind = '', dur = 2.6) { a.bubble = { text, kind, until: this.time + dur }; }
  // ближайший узел графа к скелету
  nodeOf(a) { return a.t < 0.5 ? a.from : a.to; }
  // улица для журнала: имя узла, иначе ближайший именованный узел в 150 м, иначе «во дворах»
  streetOf(a) { const g = this.graph; return g.names[a.from] || g.names[a.to] || g.nearestNamed(a.x, a.z, 150) || 'во дворах'; }
  // поставить скелета в узел графа
  teleport(a, node) { const g = this.graph; a.free = false; a.cut = null; a.lastLeg = null; if (a.state === 'cut') a.state = 'idle'; a.from = node; const e = pick(a.rng, g.adj[node]); a.to = e ? e.to : node; a.len = e ? e.len : 1; a.t = 0; a.path = null; a.stopT = null; a.target = null; this.place(a); }

  startTalk(a, b) {
    a.state = b.state = 'talk'; a.partner = b; b.partner = a;
    const dur = 5.5 + a.rng() * 3; a.timer = b.timer = dur;
    let pool = LINES.chat;
    if (a.custom || b.custom) pool = LINES.chat.concat(LINES.toYou || []);
    const lines = [chatLine(a.rng, a.arch, pool, 0.45, a.bio?.name), chatLine(b.rng, b.arch, pool, 0.45, b.bio?.name), chatLine(a.rng, a.arch, LINES.chat, 0.45, a.bio?.name)]; // часть реплик — по архетипу, у именных (Папирус) — свои
    a.script = [{ at: dur - 0.2, text: lines[0] }, { at: dur - 4.6, text: lines[2] }]; b.script = [{ at: dur - 2.4, text: lines[1] }];
    this.stats.meetings++;
  }
  enterVenue(a, v) { if (!v) return; a.venue = v; v.inside++; v.visits++; if (this.onEnter) this.onEnter(a, v); }
  leaveVenue(a) { if (a.venue) { a.venue.inside--; a.venue = null; } }
  startDance(a, dur, v) { a.state = 'dance'; a.timer = dur || 8 + a.rng() * 8; a.path = null; a.target = null; this.say(a, pick(a.rng, LINES.dance), 'music', 2.2); this.stats.dances++; a.lastDance = this.time; this.enterVenue(a, v); }
  startDrink(a, v) { a.state = 'drink'; a.timer = 6 + a.rng() * 7; a.path = null; a.target = null; this.say(a, pick(a.rng, LINES.beer), 'beer', 2.8); this.stats.beers++; a.thirst = 50 + a.rng() * 220; this.enterVenue(a, v); }

  party(cx, cz, r) { for (const a of this.agents) if (a.state === 'walk' && (!a.player || a.auto) && !a.ghost && !a.driven && (a.x - cx) ** 2 + (a.z - cz) ** 2 < r * r) this.startDance(a, 12 + a.rng() * 10); }

  // --- игровые состояния
  // NPC останавливается и ждёт, пока к нему подойдут
  wait(a, who, dur = 25) {
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.script = null; a.partner.cooldown = 8; a.partner = null; }
    this.leaveVenue(a); a.state = 'wait'; a.timer = dur; a.waitFor = who; a.script = null; a.path = null; a.target = null;
  }
  release(a) { if (a.state === 'wait') { a.state = 'walk'; a.waitFor = null; a.cooldown = 6; } }
  // убитый скелет становится призраком: прохожий голубым, упокоенный игрок золотым
  ghostify(a, kind = 'npc') {
    if (a.ghost) return;
    if (a.free || a.state === 'cut') this.snap(a);
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.script = null; a.partner.cooldown = 8; a.partner = null; }
    if (a.leader) this.unfriend(a);
    this.leaveVenue(a);
    if (!this.ghostTex[kind]) this.ghostTex[kind] = this.makeTexture(drawGhostStrip(GHOSTS[kind] || GHOSTS.npc));
    a.tex.dispose(); a.tex = this.ghostTex[kind].clone(); a.sprite.material.map = a.tex; a.sprite.material.opacity = 0.85; a.sprite.material.transparent = true; a.sprite.material.needsUpdate = true;
    a.ghost = true; a.ghostKind = kind; a.haunted = false; a.state = 'walk'; a.speed = WALK_SPEED * 0.45; a.script = null; a.path = null; a.target = null; a.waitFor = null; a.bubble = null;
    if (a.from === a.to) this.teleport(a, a.from);
  }
  // NPC идёт за лидером (игроком) по его следу
  befriend(a, leader) {
    if (a.leader) return;
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.script = null; a.partner.cooldown = 8; a.partner = null; }
    this.leaveVenue(a);
    a.leader = leader; a.state = 'follow'; a.script = null; a.path = null; a.target = null; a.waitFor = null;
    if (!leader.followers) leader.followers = []; leader.followers.push(a);
    if (!leader.trail) leader.trail = [];
  }
  unfriend(a) {
    const l = a.leader; if (!l) return;
    l.followers = l.followers.filter(f => f !== a); a.leader = null;
    const n = this.graph.nearest(a.x, a.z, 200); this.teleport(a, n >= 0 ? n : this.nodeOf(l));
    a.state = 'walk'; a.cooldown = 10;
  }
  // охотник-призрак: тот же костюм, но вместо ног хвост и зелёная аура-обводка; парит над землёй
  haunt(a) {
    if (a.ghost || a.haunted) return;
    const base = this.makeTexture(drawStrip(a.costume, { ghost: GHOSTS.hunter })); const oldTex = a.tex, oldBase = a.base;
    a.tex = base.clone(); a.base = base; a.sprite.material.map = a.tex; a.sprite.material.opacity = 0.92; a.sprite.material.transparent = true; a.sprite.material.needsUpdate = true;
    oldTex.dispose(); if (oldBase) oldBase.dispose(); a.haunted = true;
  }
  // --- игрок: путь по графу до точки на карте
  setPlayer(a) { a.player = true; a.trail = a.trail || []; a.followers = a.followers || []; a.speed = WALK_SPEED * 2; a.dest = null; this.setAuto(a, true); } // вдвое быстрее прохожего: охотники берут свою скорость от этой
  unsetPlayer(a) { this.setAuto(a, true); a.player = false; a.auto = false; a.speed = WALK_SPEED * (0.8 + a.rng() * 0.5); }
  // автопилот: без управления свой скелет гуляет, пьёт и танцует как все
  setAuto(a, on) {
    if (a.state === 'dead') { a.auto = on; return; } // мёртвый лежит до респауна, что бы ни нажимали
    if (a.state === 'cut') this.stop(a);
    if (a.auto === on) return;
    // отпустили управление на газоне: сначала срезкой на ближайшее ребро (auto включится по приходе), иначе встать на него сразу
    if (on && a.free) { const P = this.graph.nearestEdgePoint(a.x, a.z, CUT.snapR); if (P && this.clear(a.x, a.z, P.x, P.z, true)) { this.startCut(a, P.x, P.z, { kind: 'auto', P }, false); return; } this.snap(a); }
    a.auto = on; a.path = null; a.stopT = null; a.target = null; a.dest = null; a.script = null; a.lastLeg = null;
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.script = null; a.partner.cooldown = 8; a.partner = null; }
    this.leaveVenue(a); a.waitFor = null;
    if (on) { a.state = 'walk'; a.cooldown = 4; a.thirst = 30 + a.rng() * 120; if (a.from === a.to) this.teleport(a, a.from); }
    else { if (a.from === a.to) { a.state = 'idle'; } else if (a.state !== 'walk') { a.state = 'idle'; a.to = a.from; a.t = 0; this.place(a); } }
  }
  // ведомый агент (охотник): обновляется веткой игрока — только путь, без баров, танцев и разговоров
  drive(a, on) {
    a.driven = !!on;
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.script = null; a.partner.cooldown = 8; a.partner = null; }
    this.leaveVenue(a); a.script = null; a.path = null; a.stopT = null; a.target = null; a.waitFor = null; a.dest = null; a.lastLeg = null;
    if (a.free || a.state === 'cut') this.snap(a);
    if (on) a.state = 'idle'; else { a.state = 'walk'; a.cooldown = 6; if (a.from === a.to) this.teleport(a, a.from); }
  }
  edgePoint(node, x, z) { return this.graph.edgePoint(node, x, z); }
  // идёт ли агент по проезжей части (ребро major): игроку даёт скорость и розыск
  onRoad(a) { return a.state === 'walk' && !a.free && a.from !== a.to && this.graph.isMajor(a.from, a.to); }
  // свободен ли отрезок для срезки: препятствия загруженных тайлов через blockedAt (без него всё открыто).
  // Точки графа открыты по определению (по ним ходит весь город, хоть тротуар у проспекта и лежит в ленте дороги,
  // а вход в арку — на контуре дома): свою точку не проверяем, конец тоже, если он на графе (endOpen); газон проверяем
  clear(ax, az, bx, bz, endOpen = false) {
    const isB = this.blockedAt || (() => false); const len = Math.hypot(bx - ax, bz - az);
    if (len <= CUT.step) return endOpen || !isB(bx, bz);
    const k = CUT.step / len, ex = endOpen ? bx - (bx - ax) * k : bx, ez = endOpen ? bz - (bz - az) * k : bz;
    return segmentClear(ax + (bx - ax) * k, az + (bz - az) * k, ex, ez, CUT.step, isB);
  }
  // мгновенно поставить свободного агента на ближайшее ребро (призраки, запасной случай)
  snap(a) {
    const g = this.graph; const P = g.nearestEdgePoint(a.x, a.z, CUT.snapR);
    a.free = false; a.cut = null; a.lastLeg = null; if (a.state === 'cut') a.state = 'idle';
    if (P) { a.from = P.from; a.to = P.to; a.t = P.t; a.len = Math.hypot(g.x[P.to] - g.x[P.from], g.z[P.to] - g.z[P.from]) || 0.1; this.place(a); }
    else this.teleport(a, g.nearestAny(a.x, a.z));
  }
  // запасной путь: вернуться в точку начала срезки (она на графе по построению) и встать на ребро там
  snapBack(a) { if (a.cutFrom) { a.x = a.cutFrom.x; a.z = a.cutFrom.z; } this.snap(a); }
  // начать срезку: прямой ход к (x, z), по приходе — then (встать на граф, остаться свободным, применить план, включить автопилот)
  startCut(a, x, z, then, say) {
    if (!a.free && a.state !== 'cut') a.cutFrom = { x: a.x, z: a.z };
    a.cut = { x, z, then }; a.state = 'cut'; a.path = null; a.stopT = null; a.dest = null; a.target = null; a.lastLeg = null;
    a.routeCost = Math.hypot(x - a.x, z - a.z) + (then.plan ? then.plan.cost : 0);
    if (say && a.rng() < CUT.say) this.say(a, pick(a.rng, LINES.cut), '', 1.6);
  }
  // положение на графе в конце плана: точка на ребре или узел
  endPose(plan) { return plan.ep ? { from: plan.node, to: plan.ep.to, t: plan.ep.t } : { from: plan.node, to: plan.node, t: 0 }; }
  // применить план маршрута к агенту (прежняя запись moveTo: разворот, путь, точка на ребре, цена)
  applyPlan(a, plan) {
    const g = this.graph; a.stopT = null;
    if (plan.onEdge) {
      if (plan.swap) { const f = a.from; a.from = a.to; a.to = f; a.t = 1 - a.t; }
      a.stopT = plan.stopT; a.path = []; a.dest = plan.node; a.state = 'walk'; a.timer = 0; a.routeCost = plan.cost; return;
    }
    if (plan.atNode) { a.to = a.from; a.t = 0; } else if (plan.swap) { const f = a.from; a.from = a.to; a.to = f; a.t = 1 - a.t; }
    a.path = plan.nodes.slice(); a.dest = plan.node; a.state = 'walk'; a.timer = 0; a.routeCost = plan.cost; a.stopT = plan.stopT;
    if (a.from === a.to) { if (a.path.length) { a.to = a.path.shift(); a.len = Math.hypot(g.x[a.to] - g.x[a.from], g.z[a.to] - g.z[a.from]) || 0.1; a.t = 0; } else { a.state = 'idle'; a.dest = null; } }
  }
  // применить план и запомнить последний отрезок до точки вне графа; план нулевой длины (цель у своего узла) — отрезок стартует сразу
  applyLeg(a, plan, lastLeg) { this.applyPlan(a, plan); a.lastLeg = lastLeg || null; if (a.state === 'idle') this.lastLegCut(a); }
  // идти к точке (x, z): по графу до ближайшего узла или точки на ребре (a.stopT); с opts.cut управляемый скелет срезает напрямик,
  // когда цель близко, а дорожка ведёт вокруг и прямая свободна; клик по газону доводит до самой точки последним отрезком;
  // со свободной точки сначала возвращаемся на ближайшее ребро
  moveTo(a, x, z, opts = {}) {
    const g = this.graph;
    // после прямого подхода (охотник) агент стоит вне ребра: сначала ставим его на ближайший узел
    if (a.state === 'approach' || (!a.free && a.state !== 'cut' && a.from === a.to && Math.hypot(a.x - g.x[a.from], a.z - g.z[a.from]) > 3)) { const n = g.nearest(a.x, a.z, 140); if (n >= 0) this.teleport(a, n); if (a.state === 'approach') a.state = 'idle'; }
    if (a.state === 'cut') { a.state = 'idle'; a.cut = null; a.free = true; } // новый приказ посреди срезки: считаем от текущей точки
    a.lastLeg = null;
    const node = g.nearest(x, z, 140); if (node < 0 && !opts.cut) return false;
    let P = null;
    if (a.free) { P = g.nearestEdgePoint(a.x, a.z, CUT.snapR); if (!P) this.snapBack(a); }
    const pos = a.free ? { from: P.from, to: P.to, t: P.t, len: Math.hypot(g.x[P.to] - g.x[P.from], g.z[P.to] - g.z[P.from]) || 0.1 } : { from: a.from, to: a.to, t: a.t, len: a.len };
    const plan = node >= 0 ? g.planRoute(pos, x, z) : null;
    const d = Math.hypot(x - a.x, z - a.z);
    const L = plan ? Math.hypot(x - plan.endX, z - plan.endZ) : 0; // остаток от конца дорожки до самой точки
    const R = plan ? plan.cost + L + (a.free ? P.d : 0) : null;    // столько пройдёт культурный минчанин по дорожкам и газону
    const onGraph = !!plan && L <= CUT.onPath; // цель на дорожке (узел, прохожий, конфета) или на газоне
    if (opts.cut && shouldCut(d, R) && this.clear(a.x, a.z, x, z, onGraph)) {
      const then = onGraph ? { kind: 'graph', ...this.endPose(plan), node: plan.ep ? -1 : plan.node } : { kind: 'free' };
      this.startCut(a, x, z, then, true); return true;
    }
    if (!plan) return false;
    const lastLeg = opts.cut && L > CUT.onPath && L <= CUT.maxDist ? { x, z } : null;
    if (a.free) {
      if (this.clear(a.x, a.z, P.x, P.z, true)) { this.startCut(a, P.x, P.z, { kind: 'plan', P, plan, lastLeg }, false); return true; }
      this.snapBack(a); const plan2 = g.planRoute({ from: a.from, to: a.to, t: a.t, len: a.len }, x, z); if (!plan2) return false;
      this.applyLeg(a, plan2, lastLeg); return true;
    }
    this.applyLeg(a, plan, lastLeg); return true;
  }
  stop(a) { if (a.state === 'cut') { a.state = 'idle'; a.free = true; a.cut = null; } a.path = null; a.stopT = null; a.dest = null; a.lastLeg = null; if (a.state === 'walk' || a.state === 'approach') a.state = 'idle'; }
  // прямой подход вне графа (последние метры охотника к игроку, как у попутчиков): цель в метрах, путь не нужен
  approach(a, x, z) { a.state = 'approach'; a.ax = x; a.az = z; a.path = null; a.stopT = null; a.dest = null; }
  // стоим на узле заведения?
  venueAt(a) { return a.from === a.to || a.t < 0.05 ? this.venueNode.get(a.from) : a.t > 0.95 ? this.venueNode.get(a.to) : null; }

  // конец маршрута к точке вне графа (клик по газону): последние метры напрямик, если прямая свободна; иначе остаёмся на дорожке
  lastLegCut(a) { const l = a.lastLeg; if (!l) return false; a.lastLeg = null; if (!this.clear(a.x, a.z, l.x, l.z)) return false; this.startCut(a, l.x, l.z, { kind: 'free' }, false); return true; }
  // разгон управляемого и ведомого: скорость подтягивается к целевой за ACCEL с, а не включается рывком; в покое сбрасывается
  ramp(a, dt) { const target = a.speed * (a.speedMul || 1); const v = a.vel || 0; a.vel = v + (target - v) * Math.min(1, dt / ACCEL); return a.vel; }
  updatePlayer(a, dt) {
    const g = this.graph;
    if (a.state !== 'walk' && a.state !== 'cut') a.vel = 0;
    if (a.state === 'walk') {
      if (a.from === a.to) { a.state = 'idle'; return; }
      a.t += this.ramp(a, dt) * dt / a.len;
      // цель посреди ребра (прохожий, конфета): встаём на точке, не доходя до узла; onArrive без узла, чтобы не «зайти» в бар в 30 м
      if (a.stopT != null && !(a.path && a.path.length) && a.t >= a.stopT) {
        a.t = a.stopT; a.stopT = null; a.state = 'idle'; a.dest = null; a.path = null; this.place(a); if (this.lastLegCut(a)) return; if (this.onArrive) this.onArrive(a, -1); return;
      }
      while (a.t >= 1 && a.state === 'walk') {
        a.from = a.to; a.t = 0;
        if (a.path && a.path.length) { a.to = a.path.shift(); a.len = Math.hypot(g.x[a.to] - g.x[a.from], g.z[a.to] - g.z[a.from]) || 0.1; }
        else { a.to = a.from; a.state = 'idle'; const d = a.dest; a.dest = null; a.path = null; this.place(a); if (this.lastLegCut(a)) break; if (this.onArrive) this.onArrive(a, d); }
      }
      if (a.state === 'walk') { this.place(a); const dx = g.x[a.to] - g.x[a.from], dz = g.z[a.to] - g.z[a.from]; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; }
      // след для друзей
      const tr = a.trail; if (tr) { const last = tr[tr.length - 1]; if (!last || (last[0] - a.x) ** 2 + (last[1] - a.z) ** 2 > 2.25) { tr.push([a.x, a.z]); if (tr.length > 600) tr.splice(0, tr.length - 600); } }
    } else if (a.state === 'cut') {
      // срезка: по прямой к точке со своей скоростью и множителем «штормит», с анимацией ходьбы и следом для друзей
      const c = a.cut; if (!c) { a.state = 'idle'; a.free = true; return; }
      const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz); const step = this.ramp(a, dt) * dt;
      if (d > Math.max(step, 0.5)) { a.x += dx / d * step; a.z += dz / d * step; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; a.sprite.position.set(a.x, 0.5, a.z); }
      else {
        a.x = c.x; a.z = c.z; a.cut = null; const th = c.then; const g2 = this.graph;
        const stand = P => { a.from = P.from; a.to = P.to; a.t = P.t; a.len = P.from === P.to ? 1 : Math.hypot(g2.x[P.to] - g2.x[P.from], g2.z[P.to] - g2.z[P.from]) || 0.1; a.free = false; this.place(a); };
        if (th.kind === 'graph') { stand(th); a.state = 'idle'; if (this.onArrive) this.onArrive(a, th.node); }
        else if (th.kind === 'free') { a.free = true; a.state = 'idle'; a.sprite.position.set(a.x, 0.5, a.z); }
        else if (th.kind === 'plan') { stand(th.P); this.applyLeg(a, th.plan, th.lastLeg); }
        else if (th.kind === 'auto') { stand(th.P); a.state = 'idle'; this.setAuto(a, true); }
      }
      const tr = a.trail; if (tr) { const last = tr[tr.length - 1]; if (!last || (last[0] - a.x) ** 2 + (last[1] - a.z) ** 2 > 2.25) { tr.push([a.x, a.z]); if (tr.length > 600) tr.splice(0, tr.length - 600); } }
    } else if (a.state === 'approach') {
      const dx = a.ax - a.x, dz = a.az - a.z, d = Math.hypot(dx, dz);
      if (d < 0.5) a.state = 'idle';
      else { const step = Math.min(d, a.speed * (a.speedMul || 1) * dt); a.x += dx / d * step; a.z += dz / d * step; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; a.sprite.position.set(a.x, 0.5, a.z); }
    } else if (a.state === 'drink' || a.state === 'dead') {
      a.timer -= dt; if (a.timer <= 0 && a.state === 'drink') { a.state = 'idle'; this.leaveVenue(a); }
    }
  }
  updateFollower(a, dt) {
    const l = a.leader; if (!l) { a.state = 'walk'; return; }
    const k = l.followers.indexOf(a); const tr = l.trail || []; const idx = tr.length - 1 - (k + 1) * 4;
    let tx, tz;
    if (idx >= 0) { [tx, tz] = tr[idx]; } else if (tr.length) { [tx, tz] = tr[0]; } else { tx = l.x; tz = l.z; }
    const dx = tx - a.x, dz = tz - a.z; const d = Math.hypot(dx, dz);
    if (d > 90) { a.x = l.x + (a.rng() - 0.5) * 4; a.z = l.z + (a.rng() - 0.5) * 4; a.moving = false; }
    else if (d > 0.4) { const step = Math.min(d, (l.speed || WALK_SPEED) * 1.05 * dt); a.x += dx / d * step; a.z += dz / d * step; a.moving = true; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; }
    else a.moving = false;
    a.sprite.position.set(a.x, 0.5, a.z);
    if (a.rng() < dt * 0.01) this.say(a, pick(a.rng, LINES.friend || LINES.chat), '', 2);
  }

  arrive(a) {
    const g = this.graph, prev = a.from; a.from = a.to; a.t = 0;
    const node = a.from; const v = this.venueNode.get(node);
    if (!a.ghost) {
      if (a.target != null && node === a.target) {
        a.target = null; a.path = null;
        if (v && (v.type === 'nightclub' || v.type === 'event')) this.startDance(a, 14 + a.rng() * 12, v); else this.startDrink(a, v);
      }
      else if (v && a.rng() < 0.2 && a.thirst < 140) { if (v.type === 'nightclub') this.startDance(a, 10 + a.rng() * 8, v); else this.startDrink(a, v); }
      else if (this.time - a.lastDance > 40 && a.rng() < 0.5) {
        for (const z of this.danceZones) if ((a.x - z[0]) ** 2 + (a.z - z[1]) ** 2 < z[3] * z[3]) { this.startDance(a); break; }
      }
    }
    let next;
    if (a.path && a.path.length) next = a.path.shift();
    else {
      let opts = g.adj[node].filter(e => e.to !== prev);
      const quiet = opts.filter(e => !e.major); if (quiet.length) opts = quiet; // толпа держится тротуаров: на проезжую часть сворачивает, только когда иначе некуда
      if (!opts.length) next = g.adj[node][0].to;
      else {
        // далеко ушёл от своего района — тянет обратно
        const hx = a.home ? a.home.x : this.cx, hz = a.home ? a.home.z : this.cz, hr = a.home ? a.home.r * 1.6 : 900;
        if (Math.hypot(a.x - hx, a.z - hz) > hr && a.rng() < 0.7) {
          let best = opts[0], bd = Infinity;
          for (const e of opts) { const d = (g.x[e.to] - hx) ** 2 + (g.z[e.to] - hz) ** 2; if (d < bd) { bd = d; best = e; } }
          next = best.to;
        } else next = pick(a.rng, opts).to;
      }
    }
    a.to = next; a.len = Math.hypot(g.x[next] - g.x[node], g.z[next] - g.z[node]) || 0.1;
  }

  // выбираем заведение: ближние, с бонусом за афишу и клубы
  goDrink(a) {
    const g = this.graph; const cand = [];
    for (const v of this.active) {
      const d = (g.x[v.node] - a.x) ** 2 + (g.z[v.node] - a.z) ** 2; if (d > 450 * 450) continue;
      const w = 1 + (v.events.length ? 3 : 0) + (v.type === 'nightclub' ? 1 : 0) + (v.type === 'event' ? 2 : 0);
      cand.push([v, w]);
    }
    if (!cand.length) { a.thirst = 60; return; }
    let tot = cand.reduce((s, c) => s + c[1], 0), r = a.rng() * tot, v = cand[0][0];
    for (const c of cand) { r -= c[1]; if (r <= 0) { v = c[0]; break; } }
    const p = g.path(a.to, v.node, 110, { crowd: true }); // к бару тротуарами, проезжая часть — если иначе не дойти
    if (p) { a.path = p; a.target = v.node; } else a.thirst = 40;
  }

  // --- толпа вокруг камеры: прохожие есть везде, где смотрим; где-то мало, у оживлённых мест много
  protectedAgent(a) { return a.custom || a.player || !!a.leader || a.state === 'wait' || a.ghost || (a.partner && (a.partner.custom || a.partner.leader)); }
  crowd(fp, dt) {
    this.crowdTimer -= dt; if (this.crowdTimer > 0 || !fp) return; this.crowdTimer = 0.4;
    const g = this.graph; const m = 40; const x0 = fp[0] - m, z0 = fp[1] - m, x1 = fp[2] + m, z1 = fp[3] + m;
    const areaKm2 = Math.min(10, Math.max(0.02, (x1 - x0) * (z1 - z0) / 1e6));
    // вес оживлённых мест, попавших в кадр
    let hot = 0; for (const h of this.hotspots) if (h.x > x0 - h.r && h.x < x1 + h.r && h.z > z0 - h.r && h.z < z1 + h.r) hot += h.w;
    const target = Math.round(Math.min(this.cap * 0.8, (areaKm2 * 70 + hot * 5) * this.density));
    let inside = 0; for (const a of this.agents) if (a.x > x0 && a.x < x1 && a.z > z0 && a.z < z1 && !a.ghost) inside++;
    if (inside < target) {
      // случайные ячейки сетки графа в кадре; при большом недоборе заполняем всё, иначе края, чтобы не появлялись на глазах
      const c = g.cell; const cx0 = Math.floor(x0 / c), cx1 = Math.floor(x1 / c), cz0 = Math.floor(z0 / c), cz1 = Math.floor(z1 / c);
      const need = Math.min(target - inside, inside < target * 0.5 ? 40 : 12); let tries = need * 12, made = 0;
      const edge = inside >= target * 0.5;
      while (made < need && tries-- > 0) {
        let ix = cx0 + Math.floor(Math.random() * (cx1 - cx0 + 1)), iz = cz0 + Math.floor(Math.random() * (cz1 - cz0 + 1));
        if (edge && Math.random() < 0.8) { const side = Math.random(); if (side < 0.25) ix = cx0; else if (side < 0.5) ix = cx1; else if (side < 0.75) iz = cz0; else iz = cz1; }
        const l = g.grid.get(ix + ',' + iz); if (!l) continue;
        const n = l[Math.floor(Math.random() * l.length)]; if (!g.adj[n].length) continue;
        this.spawnAt(n); made++;
      }
    }
    // лишних убираем далеко за кадром: сначала самых дальних прохожих
    if (this.agents.length > this.cap) {
      const far = this.agents.filter(a => a.ambient && !this.protectedAgent(a) && (a.x < x0 - 300 || a.x > x1 + 300 || a.z < z0 - 300 || a.z > z1 + 300));
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; far.sort((a, b) => ((b.x - cx) ** 2 + (b.z - cz) ** 2) - ((a.x - cx) ** 2 + (a.z - cz) ** 2));
      for (const a of far.slice(0, Math.min(far.length, this.agents.length - this.cap + 20))) this.remove(a);
    }
  }
  // кого кликнули: сначала грубо по расстоянию до точки на земле, потом точный raycast по спрайту
  // slop > 0 (тап пальцем): если луч не попал ни в один спрайт, берём скелет, до середины тела которого луч проходит ближе slop
  pickAgent(ray, gx, gz, slop = 0) {
    const R = (this.H * 3 + 4) ** 2; const hits = []; let best = null, bd = Infinity, near = null, nd = slop;
    for (const a of this.agents) {
      if ((a.x - gx) ** 2 + (a.z - gz) ** 2 > R) continue;
      hits.length = 0; a.sprite.raycast(ray, hits);
      if (hits.length && hits[0].distance < bd) { bd = hits[0].distance; best = a; }
      else if (slop > 0 && !best) { const d = ray.ray.distanceToPoint(PICK_V.set(a.x, this.H * 0.5, a.z)); if (d < nd) { nd = d; near = a; } }
    }
    return best || near;
  }

  update(dt) {
    this.time += dt; const g = this.graph;
    let gone = null;
    for (const a of this.agents) {
      if (a.fade != null) { a.fade -= dt; a.sprite.material.opacity = Math.min(0.85, Math.max(0, a.fade)); if (a.fade <= 0) { (gone ||= []).push(a); continue; } } // тает и исчезает (побитый босс)
      a.anim += dt; a.cooldown -= dt;
      if ((a.player && !a.auto) || a.driven || a.state === 'cut') this.updatePlayer(a, dt);
      else if (a.state === 'follow') this.updateFollower(a, dt);
      else if (a.state === 'walk') {
        a.t += a.speed * dt / a.len;
        while (a.t >= 1 && a.state === 'walk') { this.arrive(a); }
        if (a.state === 'walk') {
          if (a.player) { const tr = a.trail; const last = tr[tr.length - 1]; if (!last || (last[0] - a.x) ** 2 + (last[1] - a.z) ** 2 > 2.25) { tr.push([a.x, a.z]); if (tr.length > 600) tr.splice(0, tr.length - 600); } }
          if (!a.ghost) { a.thirst -= dt; if (a.thirst <= 0 && !a.target) this.goDrink(a); }
          if (a.rng() < dt * (a.ghost ? 0.01 : 0.004)) { if (a.ghost || a.rng() < 0.5) this.say(a, pick(a.rng, LINES.boo), 'boo', 1.6); else this.say(a, pick(a.rng, LINES.named[a.bio?.name] || LINES.mutter), '', 2); } // «бу» или бормотание под нос (у именных — свои реплики)
          this.place(a);
          const dx = g.x[a.to] - g.x[a.from], dz = g.z[a.to] - g.z[a.from];
          a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1;
        }
      } else {
        a.timer -= dt;
        if (a.script) { for (let i = a.script.length - 1; i >= 0; i--) if (a.timer <= a.script[i].at) { this.say(a, a.script[i].text); a.script.splice(i, 1); } }
        if (a.state === 'talk' && a.partner) { const dx = a.partner.x - a.x, dz = a.partner.z - a.z; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; }
        if (a.state === 'wait' && a.waitFor) { const dx = a.waitFor.x - a.x, dz = a.waitFor.z - a.z; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; }
        if (a.timer <= 0) {
          if (a.state === 'talk') { if (a.partner) { a.partner.partner = null; } a.partner = null; a.cooldown = 18 + a.rng() * 20; }
          if (a.state === 'wait') { a.waitFor = null; a.cooldown = 6; }
          this.leaveVenue(a);
          a.state = 'walk'; a.script = null;
        }
      }
      let f;
      if (a.ghost) f = FRAMES.idle[0] + (Math.floor(a.anim * 2) % 2);
      else switch (a.state) {
        case 'walk': case 'approach': case 'cut': f = FRAMES.walk[Math.floor(a.anim * 6) % 4]; break;
        case 'follow': f = a.moving ? FRAMES.walk[Math.floor(a.anim * 6) % 4] : FRAMES.idle[0]; break;
        case 'dance': f = FRAMES.dance[Math.floor(a.anim * 4) % 4]; break;
        case 'drink': f = FRAMES.drink[Math.floor(a.anim * 1.5) % 2]; break;
        case 'talk': f = FRAMES.talk[Math.floor(a.anim * 3) % 2]; break;
        default: f = FRAMES.idle[0];
      }
      if (a.face > 0) { a.tex.repeat.x = 1 / NF; a.tex.offset.x = f / NF; } else { a.tex.repeat.x = -1 / NF; a.tex.offset.x = (f + 1) / NF; }
      a.sprite.position.y = a.ghost ? 1.5 + Math.sin(a.anim * 2.5) * this.H * 0.08 + this.H * 0.1 : a.haunted ? 0.5 + this.H * 0.05 + Math.sin(a.anim * 3) * this.H * 0.04 : a.state === 'dance' ? 0.5 + (Math.floor(a.anim * 4) % 2) * this.H * 0.07 : 0.5;
      if (a.tipsy) a.sprite.position.x = a.x + Math.sin(this.time * 6) * this.H * 0.04; // «штормит»: скелет идёт шатаясь
    }
    if (gone) for (const a of gone) this.remove(a);
    this.meetTimer -= dt;
    if (this.meetTimer <= 0) {
      this.meetTimer = 0.25; const cell = 8, grid = new Map();
      const free = a => a.state === 'walk' && a.cooldown <= 0 && (!a.player || a.auto) && !a.ghost && !a.driven;
      for (const a of this.agents) { if (!free(a)) continue; const k = Math.floor(a.x / cell) + ',' + Math.floor(a.z / cell); (grid.get(k) || grid.set(k, []).get(k)).push(a); }
      for (const a of this.agents) {
        if (!free(a)) continue;
        const cx = Math.floor(a.x / cell), cz = Math.floor(a.z / cell); let found = null;
        for (let i = -1; i <= 1 && !found; i++) for (let j = -1; j <= 1 && !found; j++) {
          const l = grid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
          for (const b of l) if (b !== a && free(b) && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 36) { found = b; break; }
        }
        if (found) { if (a.rng() < 0.45) this.startTalk(a, found); else { a.cooldown = 6; found.cooldown = 6; } }
      }
    }
  }
}
