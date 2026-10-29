// Граф пешеходной сети из OSM без three.js: узлы и рёбра, сетка для поиска ближайших, BFS для коротких прогулок,
// A* для игрока, точка на ребре, ближайшее ребро и улица, план маршрута без побочных эффектов. Гоняется тестами в node.

import { ROAD } from './rules.js';

export class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) { const k = this.k, v = this.v; k.push(key); v.push(val); let i = k.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; } }
  pop() { const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop(); if (k.length) { k[0] = lk; v[0] = lv; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; } } return top; }
}

export class Graph {
  constructor(roads) {
    this.x = []; this.z = []; this.adj = []; this.names = [];
    const idx = new Map();
    const node = (x, z) => { const k = x + '|' + z; let i = idx.get(k); if (i === undefined) { i = this.x.length; idx.set(k, i); this.x.push(x); this.z.push(z); this.adj.push([]); this.names.push(null); } return i; };
    for (const r of roads) {
      // проезжие части тоже проходимы: машин в игре нет, а проспекты связывают дворы и ведут через мосты
      let prev = -1;
      for (let i = 0; i + 1 < r.p.length; i += 2) {
        const n = node(r.p[i], r.p[i + 1]);
        if (r.n && !this.names[n]) this.names[n] = r.n;
        if (prev >= 0 && prev !== n) {
          const len = Math.hypot(this.x[n] - this.x[prev], this.z[n] - this.z[prev]);
          if (len > 0.05) { const major = r.k === 'major'; this.adj[prev].push({ to: n, len, major }); this.adj[n].push({ to: prev, len, major }); } // проезжая часть помечена: толпа её избегает, игрок на ней быстрее
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
    // сетка рёбер: ребро записано во все клетки, через которые проходит, — длинное ребро (проспект, мост в сотни метров)
    // находится по точке рядом с ним, а не только по его концам, которые могут быть дальше радиуса поиска
    this.ea = []; this.eb = []; this.egrid = new Map();
    for (const a of this.walkable) for (const e of this.adj[a]) {
      if (e.to < a) continue; const i = this.ea.length; this.ea.push(a); this.eb.push(e.to);
      const ax = this.x[a], az = this.z[a], bx = this.x[e.to], bz = this.z[e.to]; const steps = Math.ceil(e.len / (this.cell / 2)); let last = null;
      for (let s = 0; s <= steps; s++) { const t = steps ? s / steps : 0; const k = this.ekey(ax + (bx - ax) * t, az + (bz - az) * t); if (k === last) continue; last = k; (this.egrid.get(k) || this.egrid.set(k, []).get(k)).push(i); }
    }
    this.estamp = new Int32Array(this.ea.length); this.egen = 0;
    const n = this.x.length; this.dist = new Float64Array(n); this.stamp = new Int32Array(n); this.closed = new Int32Array(n); this.prevN = new Int32Array(n); this.gen = 0;
  }
  key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  ekey(x, z) { return Math.floor(x / this.cell) * 1e5 + Math.floor(z / this.cell); } // числовой ключ клетки для сетки рёбер (быстрее строк; город ±750 клеток)
  nearest(x, z, maxR = 120) {
    let best = -1, bd = maxR * maxR; const c = this.cell, r = Math.ceil(maxR / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const l = this.grid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
      for (const n of l) { const d = (this.x[n] - x) ** 2 + (this.z[n] - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }
  // ближайший проходимый узел без ограничения радиуса: линейный проход, для запасных случаев (nearest с огромным радиусом перебирал бы всю сетку)
  nearestAny(x, z) { let best = -1, bd = Infinity; for (const n of this.walkable) { const d = (this.x[n] - x) ** 2 + (this.z[n] - z) ** 2; if (d < bd) { bd = d; best = n; } } return best; }
  // все проходимые узлы в радиусе
  within(x, z, R) {
    const out = []; const c = this.cell, r = Math.ceil(R / c); const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const l = this.grid.get((cx + i) + ',' + (cz + j)); if (!l) continue;
      for (const n of l) if ((this.x[n] - x) ** 2 + (this.z[n] - z) ** 2 < R * R) out.push(n);
    }
    return out;
  }
  // поиск в ширину для коротких прогулок до бара
  // с { crowd: true } первый проход без рёбер проезжей части (толпа держится тротуаров), при неудаче — обычный
  path(from, to, maxHops = 110, { crowd = false } = {}) {
    if (from === to) return [];
    const bfs = skipMajor => {
      const prev = new Map([[from, -1]]); let frontier = [from];
      for (let h = 0; h < maxHops && frontier.length; h++) {
        const next = [];
        for (const u of frontier) for (const e of this.adj[u]) { if (skipMajor && e.major) continue; if (!prev.has(e.to)) { prev.set(e.to, u); if (e.to === to) { const p = []; let c = to; while (c !== from) { p.push(c); c = prev.get(c); } return p.reverse(); } next.push(e.to); } }
        frontier = next;
      }
      return null;
    };
    return (crowd && bfs(true)) || bfs(false);
  }
  // ребро между соседями — проезжая часть? и все ли рёбра узла — проезжая часть (карту часа на такой узел не ставят)
  isMajor(from, to) { const e = this.adj[from].find(e => e.to === to); return !!(e && e.major); }
  allMajor(node) { const l = this.adj[node]; return l.length > 0 && l.every(e => e.major); }
  // A* для игрока: любой конец города
  // с { crowd: true } цена ребра проезжей части умножается на ROAD.crowdCost: прохожие выходят на дорогу, только когда иначе не пройти
  route(from, to, { maxExpand = 450000, crowd = false } = {}) {
    if (from === to) return { nodes: [], cost: 0 };
    const gen = ++this.gen, dist = this.dist, stamp = this.stamp, closed = this.closed, prev = this.prevN;
    const tx = this.x[to], tz = this.z[to]; const h = i => Math.hypot(this.x[i] - tx, this.z[i] - tz);
    const heap = new Heap(); dist[from] = 0; stamp[from] = gen; prev[from] = -1; heap.push(h(from), from);
    let expanded = 0;
    while (heap.size) {
      const u = heap.pop();
      if (u === to) { const nodes = []; let c = to; while (c !== from) { nodes.push(c); c = prev[c]; } return { nodes: nodes.reverse(), cost: dist[to] }; }
      if (closed[u] === gen) continue; closed[u] = gen;
      if (++expanded > maxExpand) return null;
      const du = dist[u];
      for (const e of this.adj[u]) { const nd = du + e.len * (crowd && e.major ? ROAD.crowdCost : 1); if (stamp[e.to] !== gen || nd < dist[e.to]) { stamp[e.to] = gen; dist[e.to] = nd; prev[e.to] = u; heap.push(nd + h(e.to), e.to); } }
    }
    return null;
  }
  // кольцо: узлы с ценой пути от node в [minCost, maxCost], без самого старта (ограниченный Дейкстра на тех же массивах, что route)
  ring(node, minCost, maxCost) {
    const gen = ++this.gen, dist = this.dist, stamp = this.stamp, closed = this.closed; const out = [];
    const heap = new Heap(); dist[node] = 0; stamp[node] = gen; heap.push(0, node);
    while (heap.size) {
      const u = heap.pop(); if (closed[u] === gen) continue; closed[u] = gen;
      const du = dist[u]; if (du > maxCost) break;
      if (u !== node && du >= minCost) out.push(u);
      for (const e of this.adj[u]) { const nd = du + e.len; if (nd > maxCost) continue; if (stamp[e.to] !== gen || nd < dist[e.to]) { stamp[e.to] = gen; dist[e.to] = nd; heap.push(nd, e.to); } }
    }
    return out;
  }
  // n узлов из кандидатов попарно не ближе spacing (перемешаны rng); при нехватке добор ближайшими к (fx, fz) проходимыми узлами
  // вне списка с тем же разбросом, в самом конце — без условия: рука всегда из n карт
  pickSpaced(nodes, n, spacing, rng, fx, fz) {
    const pool = nodes.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const out = []; const far = c => out.every(p => Math.hypot(this.x[p] - this.x[c], this.z[p] - this.z[c]) >= spacing);
    for (const c of pool) { if (out.length >= n) break; if (far(c)) out.push(c); }
    if (out.length < n) {
      const inList = new Set(nodes); const seen = new Set(out);
      for (let R = 200; out.length < n && R <= 1e5; R *= 2) {
        const near = this.within(fx, fz, R).filter(c => !inList.has(c) && !seen.has(c)).sort((a, b) => (this.x[a] - fx) ** 2 + (this.z[a] - fz) ** 2 - (this.x[b] - fx) ** 2 - (this.z[b] - fz) ** 2);
        for (const c of near) { if (out.length >= n) break; if (far(c)) { out.push(c); seen.add(c); } }
        if (out.length < n && near.length && R >= 1600) for (const c of near) { if (out.length >= n) break; if (!seen.has(c)) { out.push(c); seen.add(c); } }
        if (this.within(fx, fz, R).length >= this.walkable.length) break;
      }
    }
    return out;
  }

  // точка на ребре у узла node, ближайшая к (x, z): { to, t } или null, если цель по сути в самом узле.
  // Прохожие и конфеты стоят посреди рёбер, а узлы бывают в десятках метров: до узла дойти мало
  edgePoint(node, x, z) {
    let best = null, bd = 20 * 20;
    for (const e of this.adj[node]) {
      const ax = this.x[node], az = this.z[node], dx = this.x[e.to] - ax, dz = this.z[e.to] - az; const l2 = dx * dx + dz * dz; if (l2 < 1) continue;
      const t = ((x - ax) * dx + (z - az) * dz) / l2; if (t < 0.03 || t > 0.97) continue;
      const d2 = (x - ax - dx * t) ** 2 + (z - az - dz * t) ** 2;
      if (d2 < bd) { bd = d2; best = { to: e.to, t }; }
    }
    return best;
  }
  // ближайшая проекция точки на ребро сети в радиусе maxR по сетке рёбер: { from, to, t, x, z, d } или null
  // (цель клика, возврат на дорожку со свободной точки); длинные рёбра находятся, даже если их концы далеко
  nearestEdgePoint(x, z, maxR = 140) {
    let best = null, bd = maxR * maxR; const c = this.cell, r = Math.ceil(maxR / c); const cx = Math.floor(x / c), cz = Math.floor(z / c); const gen = ++this.egen, st = this.estamp;
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const l = this.egrid.get((cx + i) * 1e5 + (cz + j)); if (!l) continue;
      for (const ei of l) {
        if (st[ei] === gen) continue; st[ei] = gen;
        const a = this.ea[ei], b = this.eb[ei]; const ax = this.x[a], az = this.z[a], dx = this.x[b] - ax, dz = this.z[b] - az; const l2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const px = ax + dx * t, pz = az + dz * t;
        const d2 = (x - px) ** 2 + (z - pz) ** 2; if (d2 < bd) { bd = d2; best = { from: a, to: b, t, x: px, z: pz, d: Math.sqrt(d2) }; }
      }
    }
    return best;
  }
  // точка сети, в которую приведёт moveTo к (x, z): узел у концов ребра (как в planRoute), иначе точка на ребре;
  // вход заведения или магазина для игрока — { x, z, node, d } или null, если сети нет в радиусе
  targetPoint(x, z, maxR = 140) {
    const P = this.nearestEdgePoint(x, z, maxR);
    if (!P) { const n = this.nearest(x, z, maxR); return n < 0 ? null : { x: this.x[n], z: this.z[n], node: n, d: Math.hypot(this.x[n] - x, this.z[n] - z) }; }
    if (P.t < 0.03) return { x: this.x[P.from], z: this.z[P.from], node: P.from, d: P.d };
    if (P.t > 0.97) return { x: this.x[P.to], z: this.z[P.to], node: P.to, d: P.d };
    return { x: P.x, z: P.z, node: P.t < 0.5 ? P.from : P.to, d: P.d };
  }
  // имя ближайшего именованного узла в радиусе maxR: улица для журнала у безымянных дворовых дорожек
  nearestNamed(x, z, maxR = 150) {
    let best = null, bd = Infinity;
    for (const n of this.within(x, z, maxR)) { if (!this.names[n]) continue; const d = (this.x[n] - x) ** 2 + (this.z[n] - z) ** 2; if (d < bd) { bd = d; best = this.names[n]; } }
    return best;
  }
  // план маршрута без побочных эффектов: от положения на графе pos = { from, to, t, len } к точке (x, z). Повторяет
  // Sim.moveTo: выбор старта с разворотом, A*, точка на ребре (stopT); cost — длина пути до конечной точки, endX/endZ — её координаты.
  // Цель на текущем ребре: { onEdge: true, swap, stopT, cost, endX, endZ, node }
  planRoute(pos, x, z) {
    // цель — ближайшая точка сети: проекция на ближайшее ребро, а не ближайший узел. Между редкими узлами проспекта
    // ближе оказывался узел тротуара или соседней полосы, и скелет шёл по тротуару, ступая на проезжую часть последним отрезком
    const P = this.nearestEdgePoint(x, z, 140); let node, ep = null;
    if (P) { if (P.t < 0.03) node = P.from; else if (P.t > 0.97) node = P.to; else { node = P.from; ep = { to: P.to, t: P.t }; } }
    else { node = this.nearest(x, z, 140); if (node < 0) return null; }
    const ex = ep ? this.x[node] + (this.x[ep.to] - this.x[node]) * ep.t : this.x[node], ez = ep ? this.z[node] + (this.z[ep.to] - this.z[node]) * ep.t : this.z[node];
    if (ep && pos.from !== pos.to && ((pos.from === node && pos.to === ep.to) || (pos.from === ep.to && pos.to === node))) {
      const s = pos.from === node ? ep.t : 1 - ep.t; const swap = pos.t > s;
      return { onEdge: true, node, ep, swap, stopT: swap ? 1 - s : s, cost: Math.abs(s - pos.t) * pos.len, endX: ex, endZ: ez, nodes: [] };
    }
    let best = null;
    const tryFrom = (start, pre, swap) => { const r = this.route(start, node); if (r && (!best || r.cost + pre < best.cost)) best = { nodes: r.nodes, cost: r.cost + pre, swap }; };
    const atNode = pos.from === pos.to || pos.t <= 0;
    if (atNode) tryFrom(pos.from, 0, false); else { tryFrom(pos.to, (1 - pos.t) * pos.len, false); tryFrom(pos.from, pos.t * pos.len, true); }
    if (!best) return null;
    const nodes = best.nodes.slice(); let stopT = null, cost = best.cost;
    const from = atNode ? pos.from : (best.swap ? pos.to : pos.from), to = atNode ? pos.from : (best.swap ? pos.from : pos.to);
    if (ep) {
      // по какому ребру приходим в узел: если по тому, где лежит точка, встать на ней; иначе дойти до узла и свернуть к точке
      const n = nodes.length; const prev = n >= 2 ? nodes[n - 2] : n === 1 ? (atNode ? from : to) : (atNode ? -1 : from);
      const le = Math.hypot(this.x[ep.to] - this.x[node], this.z[ep.to] - this.z[node]);
      if (prev === ep.to) { stopT = 1 - ep.t; cost -= ep.t * le; } else { nodes.push(ep.to); stopT = ep.t; cost += ep.t * le; }
    }
    return { onEdge: false, node, ep, swap: best.swap, atNode, nodes, cost, stopT, endX: ex, endZ: ez };
  }
}
