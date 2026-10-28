// Симуляция: граф улиц из OSM, по которому ходят скелеты; встречи, бары, танцы.
import * as THREE from 'three';
import { FRAMES, FW, FH, NF, randomCostume, drawStrip } from './skeletons.js';
import { LINES, makeRng, pick, pickArchetype, makeBio, ARCHETYPES } from './bio.js';

const WALK_SPEED = 3.4; // м/с: скелеты выше людей, поэтому и шаг шире

class Graph {
  constructor(data) {
    this.x = []; this.z = []; this.adj = [];
    const idx = new Map();
    const node = (x, z) => { const k = x + '|' + z; let i = idx.get(k); if (i === undefined) { i = this.x.length; idx.set(k, i); this.x.push(x); this.z.push(z); this.adj.push([]); } return i; };
    for (const r of data.roads) {
      if (r.k === 'major') continue;
      let prev = -1;
      for (let i = 0; i + 1 < r.p.length; i += 2) {
        const n = node(r.p[i], r.p[i + 1]);
        if (prev >= 0 && prev !== n) {
          const len = Math.hypot(this.x[n] - this.x[prev], this.z[n] - this.z[prev]);
          if (len > 0.05) { this.adj[prev].push({ to: n, len }); this.adj[n].push({ to: prev, len }); }
        }
        prev = n;
      }
    }
    // оставляем самую большую компоненту связности
    const comp = new Int32Array(this.x.length).fill(-1); let best = -1, bestN = 0;
    for (let s = 0, c = 0; s < this.x.length; s++) {
      if (comp[s] >= 0 || !this.adj[s].length) continue;
      const st = [s]; comp[s] = c; let n = 0;
      while (st.length) { const u = st.pop(); n++; for (const e of this.adj[u]) if (comp[e.to] < 0) { comp[e.to] = c; st.push(e.to); } }
      if (n > bestN) { bestN = n; best = c; }
      c++;
    }
    this.ok = comp.map(c => c === best);
    this.walkable = []; for (let i = 0; i < this.x.length; i++) if (this.ok[i]) this.walkable.push(i);
    this.cell = 40; this.grid = new Map();
    for (const i of this.walkable) { const k = this.key(this.x[i], this.z[i]); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(i); }
  }
  key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  nearest(x, z, maxR = 120) {
    let best = -1, bd = maxR * maxR; const c = this.cell, r = Math.ceil(maxR / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const l = this.grid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
      for (const n of l) { const d = (this.x[n] - x) ** 2 + (this.z[n] - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }
  path(from, to, maxHops = 110) {
    if (from === to) return [];
    const prev = new Map([[from, -1]]); let frontier = [from];
    for (let h = 0; h < maxHops && frontier.length; h++) {
      const next = [];
      for (const u of frontier) for (const e of this.adj[u]) if (!prev.has(e.to)) { prev.set(e.to, u); if (e.to === to) { const p = []; let c = to; while (c !== from) { p.push(c); c = prev.get(c); } return p.reverse(); } next.push(e.to); }
      frontier = next;
    }
    return null;
  }
}

export class Sim {
  constructor(scene, data, venues, opts = {}) {
    this.scene = scene; this.data = data; this.H = opts.skelH || 8;
    this.graph = new Graph(data);
    this.agents = []; this.sprites = []; this.stats = { meetings: 0, beers: 0, dances: 0 };
    this.seed = 1; this.time = 0; this.meetTimer = 0;
    this.camRight = new THREE.Vector3(1, 0, 0);
    // заведения привязываем к узлам графа
    this.venues = venues; this.venueNode = new Map();
    for (const v of venues) { v.node = this.graph.nearest(v.x, v.z, 80); if (v.node >= 0) this.venueNode.set(v.node, v); }
    this.active = venues.filter(v => v.node >= 0);
    const [lat0, lon0] = data.center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
    const pr = (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz];
    this.danceZones = [[...pr(53.9025, 27.5620), 'Октябрьская площадь', 50], [...pr(53.9083, 27.5752), 'площадь Победы', 50], [...pr(53.9045, 27.5560), 'площадь Свободы', 45], [...pr(53.9010, 27.5490), 'Зыбицкая', 60], [...pr(53.8980, 27.5530), 'Немига', 45]];
    [this.cx, this.cz] = pr(53.9030, 27.5600); // центр тусовки
  }

  makeTexture(costume) {
    const tex = new THREE.CanvasTexture(drawStrip(costume));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(1 / NF, 1); return tex;
  }
  addAgent(arch, costume, bio, rng, from, custom) {
    const g = this.graph; const tex = this.makeTexture(costume);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
    sprite.center.set(0.5, 0); sprite.scale.set(this.H * FW / FH, this.H, 1);
    const e = pick(rng, g.adj[from]);
    const a = { id: this.seed++, arch: arch.id, costume, bio, tex, sprite, rng, from, to: e.to, len: e.len, t: rng(), speed: WALK_SPEED * (0.8 + rng() * 0.5),
      state: 'walk', timer: 0, anim: rng() * 10, face: 1, cooldown: rng() * 10, thirst: 30 + rng() * 180, path: null, target: null, bubble: null, script: null, partner: null, x: 0, z: 0, lastDance: -100, venue: null, custom: !!custom };
    sprite.userData.agent = a;
    this.place(a); this.scene.add(sprite); this.agents.push(a); this.sprites.push(sprite);
    return a;
  }
  spawn() {
    const rng = makeRng(this.seed * 7919 + 13);
    const arch = pickArchetype(rng); const costume = randomCostume(rng, arch); const bio = makeBio(rng, arch);
    return this.addAgent(arch, costume, bio, rng, this.spawnNode(rng), false);
  }
  // пользовательский скелет: имя, пол, возраст, работа, архетип и зерно для костюма
  spawnCustom(def, nearX, nearZ) {
    const rng = makeRng((def.seed || 1) * 2654435761 + 7);
    const arch = ARCHETYPES.find(a => a.id === def.arch) || pickArchetype(rng);
    const costume = randomCostume(rng, arch);
    const bio = { name: def.name, gender: def.gender, age: def.age, job: def.job, status: makeBio(makeRng(def.seed || 1), arch).status };
    let from = nearX != null ? this.graph.nearest(nearX, nearZ, 300) : -1; if (from < 0) from = this.spawnNode(rng);
    const a = this.addAgent(arch, costume, bio, rng, from, true); a.def = def; return a;
  }
  spawnNode(rng) {
    const g = this.graph;
    for (let i = 0; i < 40; i++) {
      const n = pick(rng, g.walkable);
      const d = Math.hypot(g.x[n] - this.cx, g.z[n] - this.cz);
      if (d < 700 || rng() < 0.12) return n;
    }
    return pick(rng, g.walkable);
  }
  remove(a) {
    this.scene.remove(a.sprite); a.tex.dispose(); a.sprite.material.dispose();
    this.agents.splice(this.agents.indexOf(a), 1); this.sprites.splice(this.sprites.indexOf(a.sprite), 1);
    if (a.partner) { a.partner.partner = null; a.partner.state = 'walk'; a.partner.cooldown = 5; }
    if (a.venue) { a.venue.inside--; a.venue = null; }
  }
  setPopulation(n) {
    const count = () => this.agents.filter(a => !a.custom).length;
    while (count() < n) this.spawn();
    while (count() > n) { const a = [...this.agents].reverse().find(x => !x.custom); this.remove(a); }
  }
  setHeight(h) { this.H = h; for (const a of this.agents) a.sprite.scale.set(h * FW / FH, h, 1); }

  place(a) {
    const g = this.graph; a.x = g.x[a.from] + (g.x[a.to] - g.x[a.from]) * a.t; a.z = g.z[a.from] + (g.z[a.to] - g.z[a.from]) * a.t;
    a.sprite.position.set(a.x, 0.5, a.z);
  }
  say(a, text, kind = '', dur = 2.6) { a.bubble = { text, kind, until: this.time + dur }; }

  startTalk(a, b) {
    a.state = b.state = 'talk'; a.partner = b; b.partner = a;
    const dur = 5.5 + a.rng() * 3; a.timer = b.timer = dur;
    let pool = LINES.chat;
    if (a.custom || b.custom) pool = LINES.chat.concat(LINES.toYou);
    const lines = [pick(a.rng, pool), pick(b.rng, pool), pick(a.rng, LINES.chat)];
    a.script = [{ at: dur - 0.2, text: lines[0] }, { at: dur - 4.6, text: lines[2] }]; b.script = [{ at: dur - 2.4, text: lines[1] }];
    this.stats.meetings++;
  }
  enterVenue(a, v) { if (!v) return; a.venue = v; v.inside++; v.visits++; }
  leaveVenue(a) { if (a.venue) { a.venue.inside--; a.venue = null; } }
  startDance(a, dur, v) { a.state = 'dance'; a.timer = dur || 8 + a.rng() * 8; a.path = null; a.target = null; this.say(a, pick(a.rng, LINES.dance), 'music', 2.2); this.stats.dances++; a.lastDance = this.time; this.enterVenue(a, v); }
  startDrink(a, v) { a.state = 'drink'; a.timer = 6 + a.rng() * 7; a.path = null; a.target = null; this.say(a, pick(a.rng, LINES.beer), 'beer', 2.8); this.stats.beers++; a.thirst = 50 + a.rng() * 220; this.enterVenue(a, v); }

  party(cx, cz, r) { for (const a of this.agents) if (a.state !== 'talk' && (a.x - cx) ** 2 + (a.z - cz) ** 2 < r * r) this.startDance(a, 12 + a.rng() * 10); }

  arrive(a) {
    const g = this.graph, prev = a.from; a.from = a.to; a.t = 0;
    const node = a.from; const v = this.venueNode.get(node);
    if (a.target != null && node === a.target) {
      a.target = null; a.path = null;
      if (v && (v.type === 'nightclub' || v.type === 'event')) this.startDance(a, 14 + a.rng() * 12, v); else this.startDrink(a, v);
    }
    else if (v && a.rng() < 0.2 && a.thirst < 140) { if (v.type === 'nightclub') this.startDance(a, 10 + a.rng() * 8, v); else this.startDrink(a, v); }
    else if (this.time - a.lastDance > 40 && a.rng() < 0.5) {
      for (const z of this.danceZones) if ((a.x - z[0]) ** 2 + (a.z - z[1]) ** 2 < z[3] * z[3]) { this.startDance(a); break; }
    }
    let next;
    if (a.path && a.path.length) next = a.path.shift();
    else {
      const opts = g.adj[node].filter(e => e.to !== prev);
      if (!opts.length) next = g.adj[node][0].to;
      else if (Math.hypot(a.x - this.cx, a.z - this.cz) > 900 && a.rng() < 0.7) {
        let best = opts[0], bd = Infinity;
        for (const e of opts) { const d = (g.x[e.to] - this.cx) ** 2 + (g.z[e.to] - this.cz) ** 2; if (d < bd) { bd = d; best = e; } }
        next = best.to;
      } else next = pick(a.rng, opts).to;
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
    const p = g.path(a.to, v.node);
    if (p) { a.path = p; a.target = v.node; } else a.thirst = 40;
  }

  update(dt) {
    this.time += dt; const g = this.graph;
    for (const a of this.agents) {
      a.anim += dt; a.cooldown -= dt;
      if (a.state === 'walk') {
        a.t += a.speed * dt / a.len;
        while (a.t >= 1 && a.state === 'walk') { this.arrive(a); }
        if (a.state === 'walk') {
          a.thirst -= dt; if (a.thirst <= 0 && !a.target) this.goDrink(a);
          if (a.rng() < dt * 0.004) this.say(a, pick(a.rng, LINES.boo), 'boo', 1.6);
          this.place(a);
          const dx = g.x[a.to] - g.x[a.from], dz = g.z[a.to] - g.z[a.from];
          a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1;
        }
      } else {
        a.timer -= dt;
        if (a.script) { for (let i = a.script.length - 1; i >= 0; i--) if (a.timer <= a.script[i].at) { this.say(a, a.script[i].text); a.script.splice(i, 1); } }
        if (a.state === 'talk' && a.partner) { const dx = a.partner.x - a.x, dz = a.partner.z - a.z; a.face = dx * this.camRight.x + dz * this.camRight.z >= 0 ? 1 : -1; }
        if (a.timer <= 0) {
          if (a.state === 'talk') { if (a.partner) { a.partner.partner = null; } a.partner = null; a.cooldown = 18 + a.rng() * 20; }
          this.leaveVenue(a);
          a.state = 'walk'; a.script = null;
        }
      }
      let f;
      switch (a.state) {
        case 'walk': f = FRAMES.walk[Math.floor(a.anim * 6) % 4]; break;
        case 'dance': f = FRAMES.dance[Math.floor(a.anim * 4) % 4]; break;
        case 'drink': f = FRAMES.drink[Math.floor(a.anim * 1.5) % 2]; break;
        case 'talk': f = FRAMES.talk[Math.floor(a.anim * 3) % 2]; break;
        default: f = FRAMES.idle[0];
      }
      if (a.face > 0) { a.tex.repeat.x = 1 / NF; a.tex.offset.x = f / NF; } else { a.tex.repeat.x = -1 / NF; a.tex.offset.x = (f + 1) / NF; }
      a.sprite.position.y = a.state === 'dance' ? 0.5 + (Math.floor(a.anim * 4) % 2) * this.H * 0.07 : 0.5;
    }
    this.meetTimer -= dt;
    if (this.meetTimer <= 0) {
      this.meetTimer = 0.25; const cell = 8, grid = new Map();
      for (const a of this.agents) { if (a.state !== 'walk' || a.cooldown > 0) continue; const k = Math.floor(a.x / cell) + ',' + Math.floor(a.z / cell); (grid.get(k) || grid.set(k, []).get(k)).push(a); }
      for (const a of this.agents) {
        if (a.state !== 'walk' || a.cooldown > 0) continue;
        const cx = Math.floor(a.x / cell), cz = Math.floor(a.z / cell); let found = null;
        for (let i = -1; i <= 1 && !found; i++) for (let j = -1; j <= 1 && !found; j++) {
          const l = grid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
          for (const b of l) if (b !== a && b.state === 'walk' && b.cooldown <= 0 && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 36) { found = b; break; }
        }
        if (found) { if (a.rng() < 0.45) this.startTalk(a, found); else { a.cooldown = 6; found.cooldown = 6; } }
      }
    }
  }
}
