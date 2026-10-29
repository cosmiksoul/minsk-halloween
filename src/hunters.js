// Охотники: чужие скелеты из базы (а без базы или когда гости кончились — упыри) выходят с кладбищ по шкале
// угрозы и идут к управляемому скелету как ведомые агенты (sim.drive), без желаний толпы. За кадром идут вчетверо
// быстрее игрока, вблизи по таблице уровня, последние метры по прямой вне графа. При контакте дуэль в game.duel,
// после стычки уходят к своему кладбищу и исчезают. Угроза спадает только под управлением и без живых охотников,
// сбрасывается игрой с хозяином заведения (resetAtVenue). Все числа в rules.js.
import { LEVELS, PURSUIT, HEAT, RPS, levelOf, decayed, hunterBonus, intentOf, pickCemetery, hunterSpeedFactor } from './rules.js';
import { makeRng, pickArchetype, makeBio, LINES, pick } from './bio.js';
import { deviceId } from './store.js';

const VIG_DIST = 120; // м: ближе этого охотника чувствуешь кожей — красная виньетка по краям экрана

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
    this.hunters = []; this.cur = undefined; this.lastSpawn = -1e9; this.decayAcc = 0; this.pendingHalf = 0;
    this.lastLevel = 0; this.rng = Math.random; this.onFinish = null; // onFinish(h, outcome): после записи набега
  }
  get heat() { const g = this.game.g; return g && Number.isFinite(g.heat) ? g.heat : 0; }
  get level() { return levelOf(this.heat); }
  get list() { return this.hunters; }
  get controlled() { return this.game.controlled; }
  nearestDist(p) { let bd = Infinity; for (const h of this.hunters) { if (h.state === 'leave') continue; const d = Math.hypot(h.a.x - p.x, h.a.z - p.z); if (d < bd) bd = d; } return bd; }
  // красная виньетка по краям экрана, когда охотник ближе VIG_DIST м; элемент создаётся сам, разметку и стили не трогаем
  vignette(d) {
    const a = d < VIG_DIST ? Math.min(0.8, (VIG_DIST - d) / VIG_DIST * 0.9) : 0; if (Math.abs(a - (this.vigA || 0)) < 0.02) return; this.vigA = a;
    if (!this.vig) { if (!a) return; this.vig = document.createElement('div'); this.vig.id = 'vig'; this.vig.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;transition:box-shadow .3s'; document.body.appendChild(this.vig); }
    this.vig.style.boxShadow = a ? `inset 0 0 ${Math.round(60 + a * 140)}px rgba(255,58,92,${a.toFixed(2)})` : 'none';
  }
  get active() { return this.hunters.filter(h => h.state !== 'leave'); }
  nearest() {
    const p = this.game.player; if (!p) return null; let best = null, bd = Infinity;
    for (const h of this.hunters) { if (h.state === 'leave') continue; const d = (h.a.x - p.x) ** 2 + (h.a.z - p.z) ** 2; if (d < bd) { bd = d; best = h; } }
    return best;
  }
  // новый прогресс (вход или смена скелета): спад за время отсутствия по настенным часам, метка сим-времени из прошлой
  // сессии сбрасывается; при уровне > 0 охотники уровня выходят сразу с половины дистанции
  onLoad(g) {
    this.decayAcc = 0; this.lastLevel = -1; this.lastSpawn = -1e9; this.pendingHalf = 0;
    if (!g) return;
    const wall = Number(g.heatWall) || Date.now();
    g.heat = decayed(g.heat, (Date.now() - wall) / 1000); g.heatWall = Date.now();
    if (!Number.isFinite(g.heatAt) || g.heatAt > this.sim.time) g.heatAt = this.sim.time - HEAT.idleAfter;
    const lvl = levelOf(g.heat); if (lvl > 0) this.pendingHalf = LEVELS[lvl].hunters;
  }
  // прирост угрозы: череп, друг, аркана, побеждённый охотник; только при управляемом скелете
  gain(kind) {
    const g = this.game.g; if (!g || !this.controlled || !HEAT[kind]) return;
    const l0 = levelOf(g.heat); g.heat = Math.min(HEAT.max, (Number.isFinite(g.heat) ? g.heat : 0) + HEAT[kind]);
    g.heatAt = this.sim.time; g.heatWall = Date.now();
    const l1 = levelOf(g.heat);
    if (l1 > l0) { if (l0 === 0) this.lastSpawn = this.sim.time - LEVELS[l1].pause * 2 / 3; this.sim.say(this.game.player, `🪦 розыск ${l1}`, 'boo', 2.4); this.lastLevel = l1; for (const h of this.active) h.level = l1; this.game.renderHUD(); document.querySelector('#hud .thr')?.classList.add('flash'); }
  }
  // сброс розыска после игры с хозяином: угроза минус amount; охотники дальше 200 м теряют след, ближние видели и продолжают
  resetAtVenue(amount) {
    const g = this.game.g, p = this.game.player; if (!g || !p) return false;
    const active = this.active;
    if (!(g.heat > 0) && !active.length) return false;
    g.heat = Math.max(0, (Number.isFinite(g.heat) ? g.heat : 0) - (+amount || 0)); g.heatAt = this.sim.time; g.heatWall = Date.now();
    for (const h of active) { const d = Math.hypot(h.a.x - p.x, h.a.z - p.z); if (d > PURSUIT.seenDist) this.leave(h, 'lost'); }
    this.lastLevel = levelOf(g.heat); this.game.renderHUD(); return true;
  }
  // смерть или смена скелета: охотники расходятся без записей; keepHeat — угроза остаётся (смена скелета)
  reset(keepHeat = false) {
    const g = this.game.g; if (g && !keepHeat) { g.heat = 0; g.heatAt = this.sim.time; g.heatWall = Date.now(); }
    for (const h of [...this.hunters]) this.leave(h, null);
    this.lastLevel = 0; this.pendingHalf = 0;
  }
  setHeat(n) { const g = this.game.g; if (!g) return; g.heat = Math.max(0, Math.min(HEAT.max, +n || 0)); g.heatAt = this.sim.time; g.heatWall = Date.now(); const l = levelOf(g.heat); if (l > 0 && this.lastLevel <= 0) this.lastSpawn = this.sim.time - LEVELS[l].pause * 2 / 3; this.lastLevel = l; for (const h of this.active) if (l > 0) h.level = l; this.game.renderHUD(); }

  update(dt) {
    const game = this.game, sim = this.sim, p = game.player, g = game.g;
    if (g !== this.cur) { this.cur = g; this.onLoad(g); }
    if (!g || !p) { for (const h of [...this.hunters]) this.leave(h, null); for (const h of [...this.hunters]) this.step(h, dt, false, 0); this.vignette(Infinity); return; }
    const ctrl = this.controlled; const active = this.active;
    // спад −1 за 20 с после 30 с без прироста: только под управлением и только пока в городе нет живых охотников
    if (ctrl && !active.length && g.heat > 0 && sim.time - g.heatAt > HEAT.idleAfter) { this.decayAcc += dt; while (this.decayAcc >= HEAT.decayPer && g.heat > 0) { this.decayAcc -= HEAT.decayPer; g.heat = Math.max(0, g.heat - 1); g.heatWall = Date.now(); } }
    else this.decayAcc = 0;
    const lvl = levelOf(g.heat);
    if (lvl !== this.lastLevel) { if (this.lastLevel <= 0 && lvl > 0) this.lastSpawn = sim.time - LEVELS[lvl].pause * 2 / 3; this.lastLevel = lvl; if (lvl > 0) for (const h of active) h.level = lvl; game.renderHUD(); }
    // бонус живых охотников: по их уровню, лишний от «засветился» несёт ещё +1, пока дебафф активен
    const seen = game.seenActive ? game.seenActive() : false;
    for (const h of active) h.bonus = hunterBonus(h.level) + (h.extra && seen ? RPS.seen.bonus : 0);
    // появление: лишние от «засветился» в лимит не входят; при входе с розыском уровень выходит сразу с половины дистанции
    const L = LEVELS[lvl]; const counted = active.filter(h => !h.extra).length;
    if (ctrl && lvl > 0 && counted < L.hunters) {
      if (this.pendingHalf > 0) { if (this.spawn(lvl, { half: true })) this.pendingHalf--; else this.pendingHalf = 0; }
      else if (sim.time - this.lastSpawn >= L.pause) this.spawn(lvl);
    } else if (lvl === 0) this.pendingHalf = 0;
    for (const h of [...this.hunters]) this.step(h, dt, ctrl, lvl);
    this.vignette(ctrl && p.state !== 'dead' ? this.nearestDist(p) : Infinity);
  }
  step(h, dt, ctrl, lvl) {
    const sim = this.sim, game = this.game, p = game.player, a = h.a;
    if (h.state === 'leave') { if (sim.time - h.leaveAt > PURSUIT.leaveAfter || a.state === 'idle') this.done(h); return; }
    if (!p) { this.leave(h, null); return; }
    if (h.state === 'duel') return;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    // скорость: за кадром вчетверо быстрее игрока, вблизи по таблице уровня; от базовой скорости игрока, без дебаффов
    a.speed = p.speed * hunterSpeedFactor(d, h.level); // плавно от табличной к ×4 между 400 и 800 м, без скачка на границе кадра
    if (!ctrl) {
      // без управления: дальние теряют след через минуту, ближние замирают и ждут до пяти минут
      h.lostSince ||= sim.time;
      if (d > PURSUIT.seenDist) { if (sim.time - h.lostSince > PURSUIT.uncontrolledAfter) this.leave(h, 'lost'); }
      else { if (!h.frozen) { h.frozen = true; sim.stop(a); } if (sim.time - h.lostSince > PURSUIT.waitNear) this.leave(h, 'lost'); }
      return;
    }
    if (h.frozen) { h.frozen = false; h.repathAt = -1e9; }
    h.lostSince = 0;
    // потеря следа: игрок дальше полутора дистанций появления дольше 90 с
    if (d > h.spawnDist * PURSUIT.farFactor) { h.farSince ||= sim.time; if (sim.time - h.farSince > PURSUIT.farAfter) { this.leave(h, 'lost'); return; } } else h.farSince = 0;
    // контакт: дуэль; null (идёт другой бросок, партия, открыта колода) — повтор через полсекунды
    if (p.state !== 'dead' && game.inReach(a, PURSUIT.reach) && sim.time - (h.retryAt || -99) > 0.5) {
      h.state = 'duel'; h.victim = p; sim.stop(a);
      Promise.resolve(game.duel(h)).then(outcome => { if (outcome === null) { h.state = 'hunt'; h.retryAt = sim.time; } else this.finish(h, outcome); }).catch(e => { console.warn('дуэль', e); h.state = 'hunt'; h.retryAt = sim.time; });
      return;
    }
    if (d < PURSUIT.direct) {
      // последние метры по прямой вне графа, как попутчики: с конца пути, цель обновляется, когда игрок ушёл дальше 3 м
      if (a.state === 'idle' || a.state === 'walk' || (a.state === 'approach' && Math.hypot(p.x - a.ax, p.z - a.az) > 3)) sim.approach(a, p.x, p.z);
    } else {
      if (a.state === 'approach') sim.stop(a);
      // путь по графу: перестраиваем раз в 25 с, при уходе игрока от прежней цели на 150 м или когда дошли до старой цели
      if (sim.time - h.repathAt > PURSUIT.repathEvery || Math.hypot(p.x - h.tx, p.z - h.tz) > PURSUIT.repathDist || (a.state === 'idle' && sim.time - h.repathAt > 2)) {
        h.repathAt = sim.time; h.tx = p.x; h.tz = p.z;
        if (!sim.moveTo(a, p.x, p.z)) { this.leave(h, 'lost'); return; }
      }
    }
    // реплики призрака: в 300 м свои слова раз в 12 с, в 80 м ещё и намерение
    if (d < PURSUIT.nearSay && sim.time - (h.saidAt || -99) > 6) { h.saidAt = sim.time; sim.say(a, h.intent === 'kill' ? '👀 ищет тебя' : '🤝 идёт знакомиться', h.intent === 'kill' ? 'boo' : '', 2.4); }
    else if (d < PURSUIT.nearWarn && !a.bubble && sim.time - (h.spokeAt || -99) > 12) { h.spokeAt = sim.time; sim.say(a, pick(a.rng, h.intent === 'kill' ? LINES.hunter : LINES.hunterFriend), 'boo', 2.4); }
  }
  // кандидат на выход: гость из сети, ещё не ходивший в набег (вес по счёту), иначе упырь с этого кладбища.
  // half: стартовый узел с середины отрезка кладбище-игрок; extra: лишний охотник сверх лимита («засветился»)
  spawn(level = Math.max(1, this.level), { half = false, extra = false } = {}) {
    const p = this.game.player, sim = this.sim, g = sim.graph; if (!p) return null;
    const L = LEVELS[level] || LEVELS[1];
    const cem = pickCemetery(this.cemeteries, p.x, p.z, level, this.active.map(h => h.cem)); if (!cem) return null;
    let node = cem.node;
    if (half) { const n = g.nearest((g.x[cem.node] + p.x) / 2, (g.z[cem.node] + p.z) / 2, 600); if (n >= 0) node = n; }
    const rng = this.rng; const street = g.names[cem.node] || '';
    const named = !bare(cem.name);
    const guests = sim.agents.filter(x => x.custom && x.def && x.def.remote && !x.def.hunter && !x.def.boss && !x.def.raided && !x.def.dead && x !== p && !x.ghost);
    let a = null, owner = null;
    if (guests.length) {
      const w = guests.map(x => 1 + (x.def.score || 0) / 10); let r = rng() * w.reduce((s, v) => s + v, 0);
      a = guests[guests.length - 1]; for (let i = 0; i < guests.length; i++) { r -= w[i]; if (r <= 0) { a = guests[i]; break; } }
      sim.drive(a, true); sim.teleport(a, node); a.def.hunter = true; sim.haunt(a);
      owner = { id: a.def.rid, device: a.def.device, name: a.def.name };
    } else {
      const seed = Math.floor(rng() * 1e9); const arch = pickArchetype(makeRng(seed)); const bio = makeBio(makeRng(seed), arch);
      const job = 'упырь с ' + (named ? genitiveCem(cem.name) : 'кладбища' + (street ? ' у ' + street : ''));
      a = sim.spawnCustom({ name: bio.name, gender: bio.gender, age: bio.age, job, arch: arch.id, seed, guest: true, hunter: true, ghoul: true }, g.x[node], g.z[node]);
      sim.drive(a, true); sim.teleport(a, node); sim.haunt(a);
    }
    sim.say(a, pick(a.rng, LINES.hunterSpawn), 'boo', 2.6);
    a.speed = p.speed * L.speed; a.state = 'idle'; a.path = null;
    const st = a.def.stats || {};
    const intent = owner ? intentOf(st.kills || 0, st.friends || 0, rng) : (level >= 3 ? 'kill' : rng() < 0.7 ? 'kill' : 'friend');
    const seen = this.game.seenActive ? this.game.seenActive() : false;
    const h = { a, intent, bonus: hunterBonus(level) + (extra && seen ? RPS.seen.bonus : 0), owner, cem, level, extra, spawnDist: Math.hypot(g.x[cem.node] - p.x, g.z[cem.node] - p.z), state: 'hunt', repathAt: -1e9, tx: p.x, tz: p.z, farSince: 0, lostSince: 0, leaveAt: 0, frozen: false };
    this.hunters.push(h); if (!extra) this.lastSpawn = sim.time;
    const from = named ? 'с ' + genitiveCem(cem.name) : 'с кладбища' + (street ? ' у ' + street : '');
    sim.say(p, `🪦 ${from} вылез${a.bio.gender === 'f' ? 'ла' : ''} ${firstName(a.bio.name)}${extra ? ' · засветился' : ''}`, 'boo', 3.2);
    this.game.log('spawn', { uid: a.uid, name: a.bio.name, cem: named ? cem.name : null, intent, boss: true, owner: owner ? owner.id : null, level, extra: extra || undefined });
    this.game.renderHUD(); return h;
  }
  // лишний охотник от «засветился»: сверх лимита, с половины дистанции, с +1 к кубику, пока дебафф активен
  extra(level = Math.max(1, this.level)) { return this.spawn(Math.max(1, level), { half: true, extra: true }); }
  // после стычки: охотник уходит к своему кладбищу, набег пишется в базу (запись в журнал игрока уже сделала дуэль)
  finish(h, outcome) {
    this.sim.say(h.a, outcome === 'skull' || outcome === 'heart' ? pick(h.a.rng, LINES.scared) : 'ушёл в туман', outcome === 'skull' || outcome === 'heart' ? 'boo' : '', 2.4);
    this.leave(h, null);
    this.record(h, outcome);
  }
  // уход: к кладбищу, пропадает по прибытии или через 60 с; record === 'lost' пишет «потерял след» только в журнал
  leave(h, record) {
    if (h.state === 'leave') return;
    h.state = 'leave'; h.leaveAt = this.sim.time; const a = h.a;
    if (record === 'lost') {
      if (this.game.g) this.game.log('lost', { uid: a.uid, name: a.bio.name, boss: true, intent: h.intent, owner: h.owner ? h.owner.id : null, level: h.level });
      this.sim.say(a, '🌫 потерял след', '', 2.2);
    }
    if (!this.sim.moveTo(a, this.sim.graph.x[h.cem.node], this.sim.graph.z[h.cem.node])) this.done(h);
  }
  // набег в базу: только исходы дуэлей и только охотники с хозяином (упыри никому не принадлежат); пишет клиент жертвы
  record(h, outcome) {
    const p = h.victim || this.game.player; // после пермасмерти игрока уже нет, но набег был
    if (h.owner && this.remote && this.remote.logEncounter && p) {
      this.remote.logEncounter({ hunter: h.owner.id, hunter_device: h.owner.device, hunter_name: h.owner.name, victim: deviceId() + ':' + p.def.seed, victim_device: deviceId(), victim_name: p.def.name, outcome, rolls: h.rolls || null, level: h.level, place: this.sim.streetOf(p), at: new Date().toISOString() });
    }
    if (this.onFinish) this.onFinish(h, outcome);
  }
  done(h) {
    const i = this.hunters.indexOf(h); if (i >= 0) this.hunters.splice(i, 1);
    const a = h.a; if (a.def && a.def.remote) a.def.raided = true;
    if (this.sim.agents.includes(a)) this.sim.remove(a);
  }
}
