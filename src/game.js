// Игровая логика: игрок управляет своим скелетом кликами по карте, собирает конфеты,
// посещает заведения ради щита, бросает d20 на «сладость или гадость» с другими скелетами.
import * as THREE from 'three';
import { rollDice, hideDice, OUTCOMES } from './dice.js';
import { drawCandy, drawPortrait, drawGhostPortrait, CATALOG, SHOP_KINDS, PALETTE, randomItem } from './skeletons.js';
import { PRICES } from './shops.js';
import { LINES, pick, ageWord } from './bio.js';
import { ARCANA, ARCANA_BY_ID, drawArcana, drawCardBack } from './tarot.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = () => { const d = new Date(); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };
export const BASE_HP = 3, MAX_HP = 6, SHIELD_SEC = 20, SHIELD_MAX = 3, CANDY_N = 40;

// --- конфеты и монетки на дорогах
function coinCanvas() {
  const cv = document.createElement('canvas'); cv.width = 10; cv.height = 10; const g = cv.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(3, 0, 4, 1, '#ffd23a'); R(1, 1, 8, 1, '#ffd23a'); R(0, 2, 10, 6, '#ffd23a'); R(1, 8, 8, 1, '#ffd23a'); R(3, 9, 4, 1, '#ffd23a'); R(4, 2, 2, 6, '#b8860b'); R(2, 3, 1, 1, '#fff6c0'); R(1, 2, 1, 1, '#b8860b');
  return cv;
}
class Candies {
  constructor(sim, scene) {
    this.sim = sim; this.scene = scene; this.items = []; this.group = new THREE.Group(); scene.add(this.group);
    const mk = cv => { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.texs = ['#ff5fa2', '#ffd23a', '#4df21e', '#5ad8ff'].map(c => mk(drawCandy(c))); this.coinTex = mk(coinCanvas());
  }
  spawnOne(px, pz, rng = Math.random) {
    const g = this.sim.graph;
    for (let i = 0; i < 12; i++) {
      const ang = rng() * Math.PI * 2, d = 60 + rng() * 650;
      const n = g.nearest(px + Math.cos(ang) * d, pz + Math.sin(ang) * d, 120); if (n < 0 || !g.adj[n].length) continue;
      const e = g.adj[n][Math.floor(rng() * g.adj[n].length)], t = 0.2 + rng() * 0.6;
      const x = g.x[n] + (g.x[e.to] - g.x[n]) * t, z = g.z[n] + (g.z[e.to] - g.z[n]) * t;
      const kind = rng() < 0.18 ? 'coin' : 'candy';
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: kind === 'coin' ? this.coinTex : this.texs[Math.floor(rng() * this.texs.length)], transparent: true, alphaTest: 0.5 }));
      sp.center.set(0.5, 0); sp.position.set(x, 0.6, z); sp.userData.phase = rng() * 6;
      this.group.add(sp); this.items.push({ x, z, sp, kind }); return true;
    }
    return false;
  }
  remove(c) { this.group.remove(c.sp); c.sp.material.dispose(); this.items.splice(this.items.indexOf(c), 1); }
  clear() { for (const c of [...this.items]) this.remove(c); }
  update(player, H, t, onPick) {
    const s = H * 0.55;
    for (const c of this.items) { if (c.kind === 'coin') c.sp.scale.set(s * 0.8, s * 0.8, 1); else c.sp.scale.set(s * 16 / 12, s, 1); c.sp.position.y = 0.6 + Math.sin(t * 3 + c.sp.userData.phase) * 0.4; }
    if (!player) return;
    for (const c of [...this.items]) {
      const d2 = (c.x - player.x) ** 2 + (c.z - player.z) ** 2;
      if (d2 < Math.max(2.2, H * 0.35) ** 2 && player.state !== 'dead') { const k = c.kind; this.remove(c); onPick(k); }
      else if (d2 > 1200 * 1200) this.remove(c);
    }
    let guard = 6; while (this.items.length < CANDY_N && guard-- > 0) this.spawnOne(player.x, player.z);
  }
}

export class Game {
  constructor(sim, scene, opts) {
    this.sim = sim; this.scene = scene; this.o = opts; // opts: flyTo, showCard, save, onChange, remote
    this.player = null; this.selected = false; this.pending = null; this.busy = false; this.pendingVenue = null; this.restored = false; this.shields = [];
    this.candies = new Candies(sim, scene); this.tips = {}; this.debugRoll = null; this.respawnAt = 0;
    const ringG = new THREE.RingGeometry(0.7, 1, 24); ringG.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x4df21e, transparent: true, opacity: 0.9, depthWrite: false })); this.ring.visible = false; this.ring.position.y = 0.55; scene.add(this.ring);
    this.dest = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9, depthWrite: false })); this.dest.visible = false; this.dest.position.y = 0.56; scene.add(this.dest); this.destT = 0;
    sim.onArrive = (a, node) => this.onArrive(a, node);
    this.tarot = opts.tarot || null; this.shops = opts.shops || null; this.pendingShop = null; this.shopAt = null;
    $('shClose').onclick = () => { $('shop').hidden = true; this.shopAt = null; };
    $('shopBtns').onclick = e => { const b = e.target.closest('button[data-kind]'); if (b) this.buy(b.dataset.kind); };
    $('shopFree').onclick = e => { const b = e.target.closest('button[data-off]'); if (b) this.takeOff(b.dataset.off); };
    $('tClose').onclick = () => this.closeTarot(); $('tDeck').onclick = () => { this.closeTarot(); this.openDeck(); }; $('dClose').onclick = () => { $('deck').hidden = true; };
    $('dGrid').onclick = e => { const el = e.target.closest('.slot.on'); if (el) this.showTarot(ARCANA_BY_ID[el.dataset.id], false); };
    drawCardBack($('tBackCv'));
    this.hudAcc = 0;
    $('askSweet').onclick = () => this.choose('friend'); $('askTrick').onclick = () => this.choose('kill'); $('askNo').onclick = () => this.closeDialog();
    addEventListener('keydown', e => { if (e.key === 'Escape') { this.closeDialog(); if (this.selected) this.select(false); } });
  }
  get g() { return this.player ? this.player.def.game : null; }
  // --- игрок
  setPlayer(a) {
    if (this.player === a) return;
    if (this.player) { this.sim.unsetPlayer(this.player); this.player.def.player = false; this.select(false); }
    this.player = a; a.def.player = true; this.sim.setPlayer(a);
    if (!a.def.game) a.def.game = { hp: BASE_HP, maxHp: BASE_HP, skulls: [], friends: [], visits: [], deaths: 0, kills: 0 };
    const g = a.def.game; g.maxHp = Math.min(MAX_HP, Math.max(BASE_HP, g.maxHp || BASE_HP)); g.hp = Math.min(g.maxHp, Math.max(0, g.hp ?? BASE_HP)); if (g.hp <= 0) g.hp = BASE_HP;
    g.skulls ||= []; g.friends ||= []; g.visits ||= []; g.deaths ||= 0; g.kills ||= 0; g.tarot ||= []; g.coins ||= 0; g.tokens ||= 0; g.shared ||= null;
    if (this.tarot) { this.tarot.reset(); for (const t of g.tarot) this.tarot.markDone(t.id); }
    this.shields = []; this.pending = null; this.closeDialog();
    this.restore(); this.save(); this.renderHUD();
  }
  clearPlayer() {
    if (!this.player) return;
    const p = this.player; this.select(false); this.pending = null; this.closeDialog();
    for (const f of [...(p.followers || [])]) this.sim.unfriend(f);
    this.sim.unsetPlayer(p); p.def.player = false; this.player = null; this.shields = []; this.candies.clear(); if (this.tarot) this.tarot.reset(); this.renderHUD();
  }
  // после перезагрузки: убитые снова призраки, друзья снова идут следом
  restore() {
    const g = this.g; if (!g) return;
    const byUid = new Map(); for (const a of this.sim.agents) if (a.uid) byUid.set(a.uid, a);
    for (const s of g.skulls) { const a = byUid.get(s.uid); if (a && !a.ghost && a.bio.name === s.name) this.sim.ghostify(a); }
    for (const f of g.friends) { const a = byUid.get(f.uid); if (a && !a.leader && !a.ghost && a.bio.name === f.name && !a.player) { this.sim.befriend(a, this.player); a.x = this.player.x + (Math.random() - 0.5) * 6; a.z = this.player.z + (Math.random() - 0.5) * 6; } }
  }
  save() { const g = this.g; if (!g) return; g.x = Math.round(this.player.x); g.z = Math.round(this.player.z); this.o.save(); if (this.o.onChange) this.o.onChange(); }
  select(on) {
    this.selected = !!on && !!this.player; this.ring.visible = this.selected; this.renderHUD();
    document.body.classList.toggle('playing', this.selected);
  }
  // --- клики
  clickGround(x, z) {
    if (!this.selected || !this.player || this.busy || this.player.state === 'dead') return false;
    this.pending = null; this.pendingVenue = null; this.closeDialog();
    if (this.sim.moveTo(this.player, x, z)) { this.dest.position.set(x, 0.56, z); this.dest.visible = true; this.destT = 1; return true; }
    this.sim.say(this.player, 'туда не пройти', 'boo', 1.4); return true;
  }
  clickAgent(a) {
    if (!this.player || !this.selected || this.busy) return false;
    if (a === this.player) return false;
    if (a.ghost || a.leader === this.player || a.player || a.custom) return false; // призраки, друзья и чужие скелеты — только карточка
    this.openDialog(a); return true;
  }
  clickVenue(v) {
    if (!this.selected || !this.player || this.busy || v.node < 0 || this.player.state === 'dead') return false;
    this.pending = null; this.closeDialog();
    if (this.sim.moveTo(this.player, v.x, v.z)) { this.pendingVenue = v; this.dest.position.set(this.sim.graph.x[v.node], 0.56, this.sim.graph.z[v.node]); this.dest.visible = true; this.destT = 1; }
    return true;
  }
  clickShop(sh) {
    if (!this.selected || !this.player || this.busy || sh.node < 0 || this.player.state === 'dead') return false;
    this.pending = null; this.pendingVenue = null; this.closeDialog();
    if (this.sim.moveTo(this.player, sh.x, sh.z)) { this.pendingShop = sh; const g = this.sim.graph; this.dest.position.set(g.x[sh.node], 0.56, g.z[sh.node]); this.dest.visible = true; this.destT = 1; }
    return true;
  }
  // --- диалог «сладость или гадость»
  openDialog(npc) {
    this.dialogNpc = npc; const box = $('ask'); box.hidden = false;
    drawPortrait(npc.costume, $('askPic'));
    $('askName').textContent = npc.bio.name; $('askMeta').textContent = `${npc.bio.age} ${ageWord(npc.bio.age)} · ${npc.bio.job}`;
    this.sim.say(npc, pick(npc.rng, LINES.ask), '', 2);
  }
  closeDialog() { $('ask').hidden = true; this.dialogNpc = null; }
  choose(action) {
    const npc = this.dialogNpc; this.closeDialog(); if (!npc || !this.player || this.busy) return;
    if (npc.ghost || npc.leader) return;
    this.sim.wait(npc, this.player, 30);
    this.pending = { npc, action, tries: 0 }; this.pendingVenue = null;
    if (!this.inReach(npc)) { if (!this.sim.moveTo(this.player, npc.x, npc.z)) { this.sim.say(this.player, 'не дойти', 'boo', 1.4); this.sim.release(npc); this.pending = null; } }
  }
  inReach(npc) { return (npc.x - this.player.x) ** 2 + (npc.z - this.player.z) ** 2 < Math.max(5, this.sim.H * 0.8) ** 2; }
  onArrive(a, node) {
    if (a !== this.player) return;
    const v = this.sim.venueNode.get(node);
    if (v && (this.pendingVenue === v || !this.pendingVenue)) this.visit(v);
    this.pendingVenue = null;
    const sh = this.shops && this.shops.byNode.get(node);
    if (sh && (this.pendingShop === sh || !this.pendingShop)) this.openShop(sh);
    this.pendingShop = null;
    const p = this.pending;
    if (p && !p.rolling && !this.inReach(p.npc)) { if (p.tries++ < 3 && p.npc.state === 'wait') this.sim.moveTo(this.player, p.npc.x, p.npc.z); else { this.sim.release(p.npc); this.pending = null; this.sim.say(this.player, 'ушёл…', 'boo', 1.4); } }
  }
  // --- заведения: щит на 20 секунд, до трёх мест
  visit(v) {
    const g = this.g; const now = this.sim.time; this.shields = this.shields.filter(s => s.until > now);
    g.visits.unshift({ name: v.name, at: clock(), id: v.id }); if (g.visits.length > 40) g.visits.length = 40;
    v.visits++;
    const have = this.shields.find(s => s.id === v.id);
    if (have) { have.until = now + SHIELD_SEC; this.sim.say(this.player, '🎃 щит обновлён', 'beer', 2); }
    else if (this.shields.length < SHIELD_MAX) { this.shields.push({ id: v.id, name: v.name, until: now + SHIELD_SEC }); this.sim.say(this.player, `🎃 +щит (${this.shields.length}/${SHIELD_MAX})`, 'beer', 2.2); }
    else this.sim.say(this.player, '🎃 щитов уже три', 'beer', 2);
    this.player.state = 'drink'; this.player.timer = 2.2; this.sim.enterVenue(this.player, v);
    this.save(); this.renderHUD(); this.o.showCard(this.player, true);
  }
  // --- урон и лечение
  damage(n) {
    const g = this.g; const now = this.sim.time; this.shields = this.shields.filter(s => s.until > now);
    let absorbed = 0;
    while (n > 0 && this.shields.length) { this.shields.sort((a, b) => a.until - b.until).shift(); n--; absorbed++; }
    if (absorbed) this.sim.say(this.player, `🎃 щит принял ${absorbed}`, 'beer', 2);
    if (n > 0) { g.hp = Math.max(0, g.hp - n); if (g.hp <= 0) this.die(); }
  }
  heal(n, raiseMax = false) { const g = this.g; if (raiseMax) g.maxHp = Math.min(MAX_HP, g.maxHp + n); g.hp = Math.min(g.maxHp, g.hp + n); }
  die() {
    const g = this.g; g.deaths++; this.pending = null; this.pendingVenue = null; this.closeDialog();
    const p = this.player; this.sim.stop(p); p.state = 'dead'; p.timer = 1e9; p.sprite.material.opacity = 0.35; p.sprite.material.transparent = true;
    this.sim.say(p, 'рассыпался на кости…', 'boo', 3); this.respawnAt = performance.now() + 3500;
  }
  respawn() {
    const p = this.player, g = this.g; g.hp = BASE_HP; this.shields = [];
    // встаём у ближайшего заведения, если оно рядом, иначе на том же месте
    let best = null, bd = 400 * 400; for (const v of this.sim.active) { const d = (v.x - p.x) ** 2 + (v.z - p.z) ** 2; if (d < bd) { bd = d; best = v; } }
    this.sim.teleport(p, best ? best.node : this.sim.nodeOf(p)); p.to = p.from; p.state = 'idle'; p.trail = []; p.sprite.material.opacity = 1;
    this.sim.say(p, 'собрался заново', '', 2.2); this.save(); this.renderHUD(); this.o.showCard(p, true);
  }
  // --- бросок кубика и его исход
  async roll() {
    const p = this.pending; if (!p) return; p.rolling = true; this.busy = true; this.sim.stop(this.player);
    const npc = p.npc, me = this.player;
    const title = (p.action === 'kill' ? '💀 Гадость · ' : '🍬 Сладость · ') + npc.bio.name;
    let res; const g = this.g;
    try {
      res = await rollDice(title, this.debugRoll ?? undefined, true);
      if ((res.kind === 'fail' || res.kind === 'critfail') && g.tokens > 0) {
        const again = await this.offerSave(res);
        if (again) { g.tokens--; this.save(); this.renderHUD(); res = await rollDice('🎟 Спас-бросок · ' + npc.bio.name, this.debugRoll2 ?? undefined, false); }
        else hideDice();
      } else setTimeout(hideDice, 1800);
    } catch (e) { console.warn(e); hideDice(); res = { n: 10, kind: 'fail' }; }
    this.pending = null; this.busy = false;
    if (!this.player || this.player !== me) return;
    this.resolve(p.action, npc, res);
  }
  resolve(action, npc, res) {
    const g = this.g, me = this.player; const info = { uid: npc.uid, name: npc.bio.name, age: npc.bio.age, gender: npc.bio.gender, job: npc.bio.job, arch: npc.arch, at: clock(), street: this.sim.streetOf(npc), roll: res.n };
    if (res.kind === 'critfail') {
      this.sim.release(npc); this.sim.say(npc, pick(npc.rng, LINES.mock), 'boo', 2.4);
      if (action === 'kill' && g.skulls.length) { g.skulls.pop(); this.sim.say(me, '−2 ❤ и −1 💀', 'boo', 2.6); }
      else if (action === 'friend' && g.friends.length) { const f = g.friends.pop(); const a = this.sim.agents.find(x => x.uid === f.uid && x.leader === me); if (a) { this.sim.unfriend(a); this.sim.say(a, 'Ну и дружи сам', 'boo', 2.4); } this.sim.say(me, '−2 ❤ и −1 💚', 'boo', 2.6); }
      else this.sim.say(me, '−2 ❤', 'boo', 2.4);
      this.damage(2);
    } else if (res.kind === 'fail') {
      this.sim.release(npc); this.sim.say(npc, pick(npc.rng, LINES.mock), 'boo', 2.4); this.sim.say(me, '−1 ❤', 'boo', 2); this.damage(1);
    } else {
      if (action === 'kill') { this.sim.say(npc, pick(npc.rng, LINES.scared), 'boo', 2.4); this.sim.ghostify(npc); g.skulls.push(info); g.kills++; this.sim.say(me, '💀 +1 череп', '', 2.4); }
      else { this.sim.befriend(npc, me); this.sim.say(npc, pick(npc.rng, LINES.yes), 'music', 2.4); g.friends.push(info); this.sim.say(me, '💚 новый друг', '', 2.4); }
      const coins = res.kind === 'crit' ? 4 : 2; g.coins += coins; setTimeout(() => this.player === me && this.sim.say(me, `🪙 +${coins}`, 'beer', 2), 2600);
      if (res.kind === 'crit') { this.heal(1, true); setTimeout(() => this.player === me && this.sim.say(me, '❤ +1 за крит', 'music', 2.2), 1200); }
    }
    this.save(); this.renderHUD(); this.o.showCard(me, true);
  }
  // --- каждый кадр
  update(dt, t) {
    const p = this.player, H = this.sim.H;
    if (p) {
      if (this.ring.visible) { this.ring.position.set(p.x, 0.55, p.z); const s = H * 0.42; this.ring.scale.set(s, 1, s); }
      if (this.dest.visible) { this.destT -= dt * 1.2; const s = H * 0.3 * (1 + (1 - Math.max(0, this.destT)) * 0.8); this.dest.scale.set(s, 1, s); this.dest.material.opacity = Math.max(0, this.destT); if (this.destT <= 0) this.dest.visible = false; }
      if (p.state === 'dead' && performance.now() >= this.respawnAt) this.respawn();
      const pr = this.pending;
      if (pr && !pr.rolling) {
        if (pr.npc.ghost || pr.npc.state !== 'wait') { this.pending = null; this.sim.say(p, 'ушёл…', 'boo', 1.4); }
        else if (this.inReach(pr.npc) && p.state !== 'dead') this.roll();
      }
      const now = this.sim.time; const n0 = this.shields.length; this.shields = this.shields.filter(s => s.until > now); if (n0 !== this.shields.length) this.renderHUD();
    }
    if (this.tarot) this.tarot.update(t, p, Math.max(9, H * 0.9), it => this.collect(it));
    this.candies.update(p, H, t, kind => {
      const g = this.g;
      if (kind === 'coin') { g.coins++; this.sim.say(p, '🪙 +1', 'beer', 1.6); }
      else if (g.hp < g.maxHp) { this.heal(1); this.sim.say(p, pick(p.rng, LINES.candy), 'beer', 1.6); } else this.sim.say(p, 'сладко, но сыт', 'beer', 1.4);
      this.save(); this.renderHUD();
    });
    this.hudAcc += dt; if (this.hudAcc > 0.5) { this.hudAcc = 0; if (this.shields.length) this.renderHUD(); }
  }
  // --- арканы таро
  collect(it) {
    const g = this.g; if (!g || it.done || this.busy || !this.player) return;
    if (g.tarot.some(t => t.id === it.a.id)) { this.tarot.markDone(it.a.id); return; }
    g.tarot.push({ id: it.a.id, at: clock() }); this.tarot.markDone(it.a.id);
    this.sim.say(this.player, `🃏 ${it.a.roman} ${it.a.name}`, 'music', 3);
    this.save(); this.renderHUD(); this.o.showCard(this.player, true); this.showTarot(it.a, true);
  }
  showTarot(a, isNew) {
    const box = $('tarot'); box.hidden = false; const inner = $('tInner');
    drawArcana(a.id, $('tCv'));
    const rec = this.g && this.g.tarot.find(t => t.id === a.id);
    $('tKicker').textContent = isNew ? 'новая аркана!' : rec ? `найдена в ${rec.at}` : 'аркана';
    $('tName').textContent = `${a.roman} · ${a.name}`; $('tPlace').textContent = a.place; $('tWhy').textContent = a.why; $('tLegend').textContent = a.legend;
    inner.classList.remove('flipped');
    if (isNew) { setTimeout(() => inner.classList.add('flipped'), 120); } else inner.classList.add('flipped');
  }
  closeTarot() { $('tarot').hidden = true; }
  openDeck() {
    const g = this.g; const have = new Set(g ? g.tarot.map(t => t.id) : []);
    $('dCount').textContent = `${have.size}/${ARCANA.length}`;
    $('dGrid').innerHTML = ARCANA.map(a => have.has(a.id) ? `<div class="slot on" data-id="${a.id}"><canvas width="40" height="60"></canvas><div class="sn">${a.roman} ${esc(a.name)}</div></div>` : `<div class="slot"><canvas width="40" height="60"></canvas><div class="sn">${a.roman} · ?</div><div class="sp">${esc(a.place)}</div></div>`).join('');
    const cvs = $('dGrid').querySelectorAll('.slot canvas'); ARCANA.forEach((a, i) => { if (have.has(a.id)) drawArcana(a.id, cvs[i]); else drawCardBack(cvs[i]); });
    $('deck').hidden = false;
  }
  // --- спас-бросок: предложить перебросить неудачный кубик
  offerSave(res) {
    const g = this.g; const box = $('diceSave'); box.hidden = false;
    $('dsYes').textContent = `🎟 спас-бросок (${g.tokens})`; $('dsNo').textContent = `оставить ${res.n}`;
    return new Promise(resolve => {
      let left = 8; const tick = () => { $('dsHint').textContent = `перебросить? ${left} с`; };
      tick(); const iv = setInterval(() => { left--; tick(); if (left <= 0) done(false); }, 1000);
      const done = v => { clearInterval(iv); box.hidden = true; $('dsYes').onclick = $('dsNo').onclick = null; resolve(v); };
      $('dsYes').onclick = () => done(true); $('dsNo').onclick = () => done(false);
    });
  }
  // --- публикация карточки: первый раз даёт жетон
  onShared(net) {
    const g = this.g; if (!g) return false;
    if (!g.shared) { g.shared = { net, at: clock() }; g.tokens++; this.sim.say(this.player, '🎟 +1 спас-бросок', 'music', 3); this.save(); this.renderHUD(); this.o.showCard(this.player, true); return true; }
    return false;
  }
  // --- магазин одежды
  openShop(sh) {
    const g = this.g; if (!g) return; this.shopAt = sh; $('shop').hidden = false; $('shName').textContent = sh.name;
    drawPortrait(this.player.costume, $('shBefore')); drawPortrait(this.player.costume, $('shAfter'));
    $('shMsg').textContent = 'выбери, что купить: вещь выпадает случайно';
    this.renderShop();
  }
  renderShop() {
    const g = this.g; $('shCoins').textContent = `🪙 ${g.coins}`;
    $('shopBtns').innerHTML = Object.entries(SHOP_KINDS).map(([k, label]) => `<button data-kind="${k}" ${g.coins < PRICES[k] ? 'disabled' : ''}>${label} · ${PRICES[k]} 🪙</button>`).join('');
    const c = this.player.costume; const off = [['hat', 'снять шляпу'], ['prop', 'убрать предмет'], ['pattern', 'без узора'], ['face', 'снять с лица'], ['extra', 'снять аксессуар']].filter(([k]) => c[k] && c[k] !== 'none');
    $('shopFree').innerHTML = off.map(([k, l]) => `<button data-off="${k}">${l}</button>`).join('');
  }
  buy(kind) {
    const g = this.g, p = this.player; if (!g || !p || $('shop').hidden) return;
    const price = PRICES[kind]; if (g.coins < price) { $('shMsg').textContent = 'не хватает монет'; return; }
    g.coins -= price; const c = { ...p.costume }; let got;
    if (kind === 'colors') { c.c1 = pick(p.rng, PALETTE); c.c2 = pick(p.rng, PALETTE); c.c3 = pick(p.rng, PALETTE); c.shoes = p.rng() < 0.6 ? pick(p.rng, PALETTE) : null; got = 'новые цвета'; }
    else { let id = randomItem(kind, p.rng); for (let i = 0; i < 5 && id === c[kind]; i++) id = randomItem(kind, p.rng); c[kind] = id; got = CATALOG[kind][id]; }
    drawPortrait(p.costume, $('shBefore')); this.sim.recostume(p, c); p.def.costume = c; drawPortrait(c, $('shAfter'));
    $('shMsg').textContent = `выпало: ${got} (−${price} 🪙)`; this.sim.say(p, `🛍 ${got}`, 'music', 2.4);
    this.save(); this.renderHUD(); this.renderShop(); this.o.showCard(p, true);
  }
  takeOff(kind) {
    const p = this.player; if (!p) return; const c = { ...p.costume }; c[kind] = 'none';
    drawPortrait(p.costume, $('shBefore')); this.sim.recostume(p, c); p.def.costume = c; drawPortrait(c, $('shAfter')); $('shMsg').textContent = 'снято';
    this.save(); this.renderShop(); this.o.showCard(p, true);
  }
  // --- интерфейс
  hearts(g) { let s = ''; for (let i = 0; i < g.maxHp; i++) s += i < g.hp ? '<i class="hp on">♥</i>' : '<i class="hp">♥</i>'; return s; }
  renderHUD() {
    const hud = $('hud'); const p = this.player;
    if (!p) { hud.innerHTML = `<div class="hudHint">создай своего скелета во вкладке «Свой скелет» — и играй</div>`; hud.classList.remove('has'); return; }
    const g = this.g; const now = this.sim.time; const sh = this.shields.filter(s => s.until > now);
    hud.classList.add('has');
    hud.innerHTML = `<div class="hudName">${esc(p.bio.name)}</div>
      <div class="hudRow">${this.hearts(g)}${sh.map(s => `<span class="sh" title="${esc(s.name)}">🎃<small>${Math.ceil(s.until - now)}</small></span>`).join('')}</div>
      <div class="hudRow"><span class="skc">💀 ${g.skulls.length}</span><span class="frc">💚 ${g.friends.length}</span><span class="vc">🎃 ${g.visits.length}</span><span class="tc">🃏 ${g.tarot.length}/${ARCANA.length}</span><span class="cn">🪙 ${g.coins}</span>${g.tokens ? `<span class="tk">🎟 ${g.tokens}</span>` : ''}${g.deaths ? `<span class="dc">☠ ${g.deaths}</span>` : ''}</div>
      <div class="hudHint">${p.state === 'dead' ? 'собираем кости…' : this.pending ? 'идём к цели…' : this.selected ? 'клик по карте — идти · по скелету — сладость или гадость · по тыкве — зайти' : 'клик по своему скелету, чтобы управлять'}</div>`;
  }
  // блок в карточке скелета
  cardHtml(a) {
    if (a === this.player) {
      const g = this.g; let id = 0; this.tips = {};
      const sk = g.skulls.map(s => { const k = 's' + id++; this.tips[k] = `<b>${esc(s.name)}</b><br>${s.age} ${ageWord(s.age)} · ${s.gender === 'm' ? 'мужчина' : 'женщина'}<br>при жизни: ${esc(s.job)}<br>убит в ${esc(s.at)}${s.street ? ', ' + esc(s.street) : ''} · d20: ${s.roll ?? '?'}`; return `<span class="sk" data-tip="${k}">💀</span>`; }).join('');
      const fr = g.friends.map(s => { const k = 'f' + id++; this.tips[k] = `<b>${esc(s.name)}</b><br>${s.age} ${ageWord(s.age)} · ${s.gender === 'm' ? 'мужчина' : 'женщина'}<br>при жизни: ${esc(s.job)}<br>подружились в ${esc(s.at)}${s.street ? ', ' + esc(s.street) : ''} · d20: ${s.roll ?? '?'}`; return `<span class="fr" data-tip="${k}">💚</span>`; }).join('');
      const vis = g.visits.slice(0, 6).map(v => `<div class="vis">${esc(v.at)} · 🎃 ${esc(v.name)}</div>`).join('');
      return `<div class="gm"><div class="line">${this.hearts(g)} <span class="muted">${g.hp}/${g.maxHp}</span></div>
        <div class="line">черепа: ${sk || '<span class="muted">пока нет</span>'}</div>
        <div class="line">друзья: ${fr || '<span class="muted">пока нет</span>'}</div>
        <div class="line">арканы: <span class="tc">🃏 ${g.tarot.length}/${ARCANA.length}</span>${g.tarot.length ? ' · ' + g.tarot.slice(-5).map(t => esc(ARCANA_BY_ID[t.id].roman)).join(' ') : ''}</div>
        <div class="line">монеты: <span class="cn">🪙 ${g.coins}</span> · спас-броски: <span class="tk">🎟 ${g.tokens}</span>${g.shared ? ' <span class="muted">· карточка опубликована</span>' : ''}</div>
        <div class="line muted">посещения: ${g.visits.length}${g.deaths ? ` · смертей: ${g.deaths}` : ''}</div>${vis}</div>`;
    }
    if (a.ghost) { const s = this.g && this.g.skulls.find(x => x.uid === a.uid); return `<div class="gm"><div class="line ghost">призрак${s ? ` · убит вами в ${esc(s.at)}` : ''}</div></div>`; }
    if (a.leader === this.player) { const f = this.g && this.g.friends.find(x => x.uid === a.uid); return `<div class="gm"><div class="line friend">ваш друг${f ? ` с ${esc(f.at)}` : ''} · идёт следом</div></div>`; }
    return '';
  }
  portrait(a, canvas) { if (a.ghost) drawGhostPortrait(canvas); else drawPortrait(a.costume, canvas); }
}
export { OUTCOMES };
