// Охотники: чужие скелеты из базы (а без базы или когда гости кончились — упыри) выходят с кладбищ по шкале
// угрозы и идут к управляемому скелету как ведомые агенты (sim.drive), без желаний толпы. При контакте дуэль
// в game.duel, после стычки уходят к своему кладбищу и исчезают. Все числа в rules.js.
import { LEVELS, PURSUIT, HEAT, levelOf, decayed, hunterBonus, intentOf, pickCemetery, canReset } from './rules.js';
import { makeRng, pickArchetype, makeBio, LINES, pick } from './bio.js';

const firstName = s => String(s || '').split(' ')[0];
const bare = n => !n || /^кладбище$/i.test(n.trim());
// «Кальварийское кладбище» → «Кальварийского кладбища», «Кладбище Петровщина» → «кладбища Петровщина»
export function genitiveCem(name) {
  const words = name.trim().split(/\s+/); const k = words.findIndex(w => /^кладбище$/i.test(w));
  return words.map((w, i) => /^кладбище$/i.test(w) ? 'кладбища' : /^колумбарий$/i.test(w) ? 'колумбария' : (k > i && /ое$/.test(w)) ? w.replace(/ое$/, 'ого') : (k > i && /ее$/.test(w)) ? w.replace(/ее$/, 'его') : w).join(' ');
}

export class Hunters {
  constructor({ sim, game, cemeteries, remote }) {
    this.sim = sim; this.game = game; this.cemeteries = cemeteries || []; this.remote = remote || null;
    this.hunters = []; this.cur = undefined; this.lastSpawn = -1e9; this.spawnedOnce = false; this.walkAcc = 0; this.decayAcc = 0;
    this.lastLevel = 0; this.rng = Math.random; this.onFinish = null; // onFinish(h, outcome, rolls): запись набега в базу (задача 7)
  }
  get heat() { const g = this.game.g; return g && Number.isFinite(g.heat) ? g.heat : 0; }
  get level() { return levelOf(this.heat); }
  get list() { return this.hunters; }
  get controlled() { const p = this.game.player; return !!(p && this.game.selected && p.state !== 'dead'); }
  nearest() {
    const p = this.game.player; if (!p) return null; let best = null, bd = Infinity;
    for (const h of this.hunters) { if (h.state === 'leave') continue; const d = (h.a.x - p.x) ** 2 + (h.a.z - p.z) ** 2; if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // новый прогресс (вход или смена скелета): спад за время отсутствия по настенным часам, метки сим-времени из прошлой сессии сбрасываются
  onLoad(g) {
    this.walkAcc = 0; this.decayAcc = 0; this.lastLevel = -1; this.spawnedOnce = false; this.lastSpawn = -1e9;
    if (!g) return;
    const wall = Number(g.heatWall) || Date.now();
    g.heat = decayed(g.heat, (Date.now() - wall) / 1000); g.heatWall = Date.now();
    if (!Number.isFinite(g.heatAt) || g.heatAt > this.sim.time) g.heatAt = this.sim.time - HEAT.idleAfter;
    if (!Number.isFinite(g.resetAt) || g.resetAt > this.sim.time) g.resetAt = -1e9;
  }
  // прирост угрозы: только при управляемом скелете; «минута» не трогает heatAt, чтобы ходьба не останавливала спад
  gain(kind) {
    const g = this.game.g; if (!g || !this.controlled || !HEAT[kind]) return;
    const l0 = levelOf(g.heat); g.heat = Math.min(HEAT.max, (Number.isFinite(g.heat) ? g.heat : 0) + HEAT[kind]);
    if (kind !== 'minute') g.heatAt = this.sim.time;
    g.heatWall = Date.now();
    const l1 = levelOf(g.heat);
    if (l1 > l0) { if (l0 === 0) this.lastSpawn = this.sim.time - LEVELS[l1].pause * 2 / 3; this.sim.say(this.game.player, `🪦 угроза ${l1}`, 'boo', 2.4); this.lastLevel = l1; this.game.renderHUD(); document.querySelector('#hud .thr')?.classList.add('flash'); }
  }
  // сброс в заведении: не чаще раза в три минуты, охотники дальше 200 м теряют след; костюм обманывает всех и без ограничения
  resetAtVenue(kind) {
    const g = this.game.g, p = this.game.player; if (!g || !p || !this.controlled) return false;
    const active = this.hunters.filter(h => h.state !== 'leave');
    if (!(g.heat > 0) && !active.length) return false;
    if (kind === 'venue' && !canReset(g, this.sim.time)) return false;
    g.heat = 0; g.heatAt = this.sim.time; g.resetAt = this.sim.time; g.heatWall = Date.now();
    for (const h of active) { const d = Math.hypot(h.a.x - p.x, h.a.z - p.z); if (kind === 'costume' || d > PURSUIT.seenDist) this.leave(h, 'lost'); else h.stubborn = true; }
    setTimeout(() => this.game.player === p && this.sim.say(p, kind === 'costume' ? '🎭 не узнают' : '🪦 залёг на дно', 'beer', 2.4), 2400);
    this.lastLevel = 0; this.game.renderHUD(); return true;
  }
  // смерть или смена скелета: охотники расходятся без записей; keepHeat — угроза остаётся (смена скелета)
  reset(keepHeat = false) {
    const g = this.game.g; if (g && !keepHeat) { g.heat = 0; g.heatAt = this.sim.time; g.heatWall = Date.now(); }
    for (const h of [...this.hunters]) this.leave(h, null);
    this.lastLevel = 0;
  }
  setHeat(n) { const g = this.game.g; if (!g) return; g.heat = Math.max(0, Math.min(HEAT.max, +n || 0)); g.heatAt = this.sim.time; g.heatWall = Date.now(); const l = levelOf(g.heat); if (l > 0 && this.lastLevel === 0) this.lastSpawn = this.sim.time - LEVELS[l].pause * 2 / 3; this.lastLevel = l; this.game.renderHUD(); }

  update(dt) {
    const game = this.game, sim = this.sim, p = game.player, g = game.g;
    if (g !== this.cur) { this.cur = g; this.onLoad(g); }
    if (!g || !p) { for (const h of [...this.hunters]) this.leave(h, null); for (const h of [...this.hunters]) this.step(h, dt, false, 0); return; }
    const ctrl = this.controlled;
    // спад: −1 за 20 с после 30 с без прироста (и без управления тоже)
    if (g.heat > 0 && sim.time - g.heatAt > HEAT.idleAfter) { this.decayAcc += dt; while (this.decayAcc >= HEAT.decayPer && g.heat > 0) { this.decayAcc -= HEAT.decayPer; g.heat = Math.max(0, g.heat - 1); g.heatWall = Date.now(); } }
    else this.decayAcc = 0;
    const lvl = levelOf(g.heat);
    if (lvl !== this.lastLevel) { if (this.lastLevel <= 0 && lvl > 0) this.lastSpawn = sim.time - LEVELS[lvl].pause * 2 / 3; this.lastLevel = lvl; game.renderHUD(); }
    // минута управления с движением
    if (ctrl && p.state === 'walk') { this.walkAcc += dt; if (this.walkAcc >= 60) { this.walkAcc -= 60; this.gain('minute'); } } else if (!ctrl) this.walkAcc = 0;
    // появление
    const L = LEVELS[lvl]; const active = this.hunters.filter(h => h.state !== 'leave');
    if (ctrl && lvl > 0 && active.length < L.hunters && sim.time - this.lastSpawn >= L.pause) this.spawn(lvl);
    for (const h of [...this.hunters]) this.step(h, dt, ctrl, lvl);
  }
  step(h, dt, ctrl, lvl) {
    const sim = this.sim, game = this.game, p = game.player, a = h.a;
    if (h.state === 'leave') { if (sim.time - h.leaveAt > PURSUIT.leaveAfter || a.state === 'idle') this.done(h); return; }
    if (!p) { this.leave(h, null); return; }
    if (h.state === 'duel') return;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    if (!ctrl) { h.lostSince ||= sim.time; if (sim.time - h.lostSince > PURSUIT.uncontrolledAfter) { this.leave(h, 'lost'); return; } } else h.lostSince = 0;
    if (lvl === 0 && !h.stubborn) { this.leave(h, 'lost'); return; } // угроза спала до нуля
    // путь к игроку: перестраиваем раз в 25 с, при уходе игрока от прежней цели на 150 м или когда дошли до старой цели
    if (ctrl && (sim.time - h.repathAt > PURSUIT.repathEvery || Math.hypot(p.x - h.tx, p.z - h.tz) > PURSUIT.repathDist || (a.state === 'idle' && d > 12 && sim.time - h.repathAt > 2))) {
      h.repathAt = sim.time; h.tx = p.x; h.tz = p.z;
      if (!sim.moveTo(a, p.x, p.z)) { this.leave(h, 'lost'); return; }
    }
    if (d < PURSUIT.nearSay && sim.time - (h.saidAt || -99) > 6) { h.saidAt = sim.time; sim.say(a, h.intent === 'kill' ? '👀 ищет тебя' : '🤝 идёт знакомиться', h.intent === 'kill' ? 'boo' : '', 2.4); }
    if (d > LEVELS[Math.max(1, lvl)].dist * PURSUIT.farFactor) { h.farSince ||= sim.time; if (sim.time - h.farSince > PURSUIT.farAfter) { this.leave(h, 'lost'); return; } } else h.farSince = 0;
    if (ctrl && p.state !== 'dead' && game.inReach(a) && sim.time - (h.retryAt || -99) > 0.5) {
      h.state = 'duel'; sim.stop(a);
      Promise.resolve(game.duel(h)).then(outcome => { if (outcome === null) { h.state = 'hunt'; h.retryAt = sim.time; } else this.finish(h, outcome); }).catch(e => { console.warn('дуэль', e); h.state = 'hunt'; h.retryAt = sim.time; });
    }
  }
  // кандидат на выход: гость из сети, ещё не ходивший в набег (вес по счёту), иначе упырь с этого кладбища
  spawn(level = Math.max(1, this.level)) {
    const p = this.game.player, sim = this.sim, g = sim.graph; if (!p) return null;
    const L = LEVELS[level] || LEVELS[1]; const cem = pickCemetery(this.cemeteries, p.x, p.z, level); if (!cem) return null;
    const rng = this.rng; const street = g.names[cem.node] || '';
    const named = !bare(cem.name);
    const guests = sim.agents.filter(x => x.custom && x.def && x.def.remote && !x.def.hunter && !x.def.raided && x !== p && !x.ghost);
    let a = null, owner = null;
    if (guests.length) {
      const w = guests.map(x => 1 + (x.def.score || 0) / 10); let r = rng() * w.reduce((s, v) => s + v, 0);
      a = guests[guests.length - 1]; for (let i = 0; i < guests.length; i++) { r -= w[i]; if (r <= 0) { a = guests[i]; break; } }
      sim.drive(a, true); sim.teleport(a, cem.node); a.def.hunter = true;
      owner = { id: a.def.rid, device: a.def.device, name: a.def.name };
    } else {
      const seed = Math.floor(rng() * 1e9); const arch = pickArchetype(makeRng(seed)); const bio = makeBio(makeRng(seed), arch);
      const job = 'упырь с ' + (named ? genitiveCem(cem.name) : 'кладбища' + (street ? ' у ' + street : ''));
      a = sim.spawnCustom({ name: bio.name, gender: bio.gender, age: bio.age, job, arch: arch.id, seed, guest: true, hunter: true, ghoul: true }, g.x[cem.node], g.z[cem.node]);
      sim.drive(a, true); sim.teleport(a, cem.node);
    }
    a.speed = p.speed * L.speed; a.state = 'idle'; a.path = null;
    const st = a.def.stats || {};
    const intent = owner ? intentOf(st.kills || 0, st.friends || 0, rng) : (level >= 3 ? 'kill' : rng() < 0.7 ? 'kill' : 'friend');
    const h = { a, intent, bonus: hunterBonus(level), owner, cem, level, state: 'hunt', repathAt: -1e9, tx: p.x, tz: p.z, farSince: 0, lostSince: 0, leaveAt: 0, stubborn: false };
    this.hunters.push(h); this.lastSpawn = sim.time; this.spawnedOnce = true;
    const from = named ? 'с ' + genitiveCem(cem.name) : 'с кладбища' + (street ? ' у ' + street : '');
    sim.say(p, `🪦 ${from} вылез${a.bio.gender === 'f' ? 'ла' : ''} ${firstName(a.bio.name)}`, 'boo', 3.2);
    this.game.log('spawn', { uid: a.uid, name: a.bio.name, cem: named ? cem.name : null, intent, boss: true, owner: owner ? owner.id : null, level });
    this.game.renderHUD(); return h;
  }
  // после стычки: охотник уходит к своему кладбищу (запись в журнал игрока уже сделала дуэль)
  finish(h, outcome) {
    this.sim.say(h.a, outcome === 'skull' || outcome === 'heart' ? pick(h.a.rng, LINES.scared) : 'ушёл в туман', outcome === 'skull' || outcome === 'heart' ? 'boo' : '', 2.4);
    this.leave(h, null);
    if (this.onFinish) this.onFinish(h, outcome);
  }
  // уход: к кладбищу, пропадает по прибытии или через 60 с; record === 'lost' пишет «потерял след»
  leave(h, record) {
    if (h.state === 'leave') return;
    h.state = 'leave'; h.leaveAt = this.sim.time; const a = h.a;
    if (record === 'lost') {
      if (this.game.g) this.game.log('lost', { uid: a.uid, name: a.bio.name, boss: true, intent: h.intent, owner: h.owner ? h.owner.id : null, level: h.level });
      this.sim.say(a, '🌫 потерял след', '', 2.2);
      if (this.onFinish) this.onFinish(h, 'lost');
    }
    if (!this.sim.moveTo(a, this.sim.graph.x[h.cem.node], this.sim.graph.z[h.cem.node])) this.done(h);
  }
  done(h) {
    const i = this.hunters.indexOf(h); if (i >= 0) this.hunters.splice(i, 1);
    const a = h.a; if (a.def && a.def.remote) a.def.raided = true;
    if (this.sim.agents.includes(a)) this.sim.remove(a);
  }
}
