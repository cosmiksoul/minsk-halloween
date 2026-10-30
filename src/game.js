// Игровая логика: игрок управляет своим скелетом кликами по карте, собирает конфеты,
// посещает заведения ради щита, бросает d20 на «сладость или гадость» с другими скелетами.
import * as THREE from 'three';
import { rollDice, hideDice, showDuelResult, OUTCOMES } from './dice.js';
import { Sfx } from './sfx.js';
import { icon, toast, escHtml, statLine } from './ui.js';
import { classDie, classSpeed, CAPS, POINTS, PURSUIT, RPS, THROWS, THROW_ICON, THROW_NAME, rpsBeats, hostThrow, stakeOf, resetAmount, migrate, addPoints, growHearts, eatStack, logPush, statsOf, tailBonus, duel, deathCoins, ROAD, roadHeat, TOKEN, canBuyToken, buyToken, bossBonus, bossXp } from './rules.js';
import { cardLabel, isRed } from './poker.js';
import { hostOf } from './hosts.js';
import { drawCandy, drawPortrait, drawGhostPortrait, GHOSTS, CATALOG, SHOP_KINDS, PALETTE, randomItem } from './skeletons.js';
import { PRICES } from './shops.js';
import { LINES, pick, ageWord } from './bio.js';
import { ARCANA, ARCANA_BY_ID, drawArcana, drawCardBack } from './tarot.js';
import { Chests } from './chests.js';
import { chestOutcome, chestLoot, sprintStep, minskHour } from './rules.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = () => { const d = new Date(); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };
export const BASE_HP = CAPS.baseHearts, MAX_HP = CAPS.hearts, SHIELD_MAX = RPS.shieldMax, CANDY_N = 40;
const firstName = s => String(s || '').split(' ')[0];
// время записи: старые записи хранят «ЧЧ:ММ», новые ISO; сегодняшние показываем временем, прочие с датой
export const fmtAt = at => { if (!at) return ''; if (/^\d\d:\d\d$/.test(at)) return at; const d = new Date(at); if (isNaN(d)) return String(at); const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); return d.toDateString() === new Date().toDateString() ? hm : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`; };

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
      if (d2 < Math.max(3, H * 0.45) ** 2 && player.state !== 'dead') { const k = c.kind; this.remove(c); onPick(k); }
      else if (d2 > 1200 * 1200) this.remove(c);
    }
    let guard = 6; while (this.items.length < CANDY_N && guard-- > 0) this.spawnOne(player.x, player.z);
  }
}

export class Game {
  constructor(sim, scene, opts) {
    this.sim = sim; this.scene = scene; this.o = opts; // opts: flyTo, showCard, save, onChange, remote
    this.player = null; this.selected = false; this.pending = null; this.busy = false; this.pendingVenue = null; this.pendingBoss = null; this.restored = false; this.modal = null;
    this.candies = new Candies(sim, scene); this.chests = new Chests(sim, scene); this.stamina = 1; this.sprinting = false; this.exhausted = false; this.tips = {}; this.debugRoll = null; this.debugRollFoe = null; this.respawnAt = 0; this.hunters = null; this.speedMul = 1; this.roadAcc = 0; this.roadSaid = false; this.onRoadLast = false; // проезжая часть: накопленные секунды розыска, пузырь-подсказка раз за сессию, значок 🚗
    // игра с хозяином заведения и дебаффы: плашка, откат по заведению, «штормит» и «засветился» по сим-времени (не переживают перезагрузку)
    this.host = null; this.hostTimer = null; this.lastPlay = new Map(); this.tipsyUntil = 0; this.seenUntil = 0; this.debugThrow = null; this.ikAt = 0; this.hadDebuff = false;
    $('hostRock').onclick = () => this.playRps('rock'); $('hostScissors').onclick = () => this.playRps('scissors'); $('hostPaper').onclick = () => this.playRps('paper'); $('hostNo').onclick = () => { if (this.modal === 'host') this.closeHost(); };
    const ringG = new THREE.RingGeometry(0.7, 1, 24); ringG.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0x4df21e, transparent: true, opacity: 0.9, depthWrite: false })); this.ring.visible = false; this.ring.position.y = 0.55; scene.add(this.ring);
    this.dest = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.9, depthWrite: false })); this.dest.visible = false; this.dest.position.y = 0.56; scene.add(this.dest); this.destT = 0;
    sim.onArrive = (a, node) => this.onArrive(a, node);
    sim.onEnter = (a, v) => this.onEnter(a, v);
    this.tarot = opts.tarot || null; this.shops = opts.shops || null; this.pendingShop = null; this.shopAt = null;
    $('shClose').onclick = () => { if (this.modal === 'shop') this.setModal(null); this.shopAt = null; };
    $('shopBtns').onclick = e => { const b = e.target.closest('button[data-kind]'); if (b) this.buy(b.dataset.kind); };
    $('shopFree').onclick = e => { const b = e.target.closest('button[data-off]'); if (b) this.takeOff(b.dataset.off); };
    $('tClose').onclick = () => this.closeTarot(); $('tDeck').onclick = () => { this.closeTarot(); this.openDeck(this.deckG || this.g); }; $('dClose').onclick = () => { if (this.modal === 'deck') this.setModal(null); };
    $('dGrid').onclick = e => { const el = e.target.closest('.slot.on'); if (el) this.showTarot(ARCANA_BY_ID[el.dataset.id], false, this.deckG || this.g); };
    drawCardBack($('tBackCv'));
    this.hudAcc = 0;
    $('askSweet').onclick = () => this.choose('friend'); $('askTrick').onclick = () => this.choose('kill'); $('askNo').onclick = () => this.closeDialog();
    // спринт: пробел зажат — ×SPRINT.mul (не Shift: несколько быстрых нажатий включают залипание клавиш в Windows), пока есть выносливость; кольцо выбора оранжевое на бегу и серое, когда выдохся
    addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) this.sprinting = true; });
    addEventListener('keyup', e => { if (e.code === 'Space') this.sprinting = false; });
    addEventListener('blur', () => { this.sprinting = false; });
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      // сначала закрываем открытую модалку, управление отпускаем только когда ничего не открыто; кубик и партию Esc не прерывает
      if (this.modal) {
        if (this.modal === 'dice' || this.modal === 'rps') return;
        if (this.modal === 'host') { if (this.closeHost) this.closeHost(); return; }
        if (this.modal === 'ask') this.dialogNpc = null; if (this.modal === 'shop') this.shopAt = null;
        this.setModal(null); return;
      }
      if (this.selected) this.select(false);
    });
  }
  get g() { return this.player ? this.player.def.game : null; }
  get controlled() { return !!(this.player && this.selected && this.player.state !== 'dead'); }
  // единственная истина о том, что открыто: ask, host, rps, dice, shop, deck, tarot, share или null.
  // Элементы ask/host/shop/deck/tarot/share переключаются здесь; кубиком управляет dice.js, партия живёт в #host
  setModal(name) {
    const elOf = { ask: 'ask', host: 'host', rps: 'host', shop: 'shop', deck: 'deck', tarot: 'tarot', share: 'share' };
    const prev = this.modal; this.modal = name || null;
    if (prev && elOf[prev] && elOf[prev] !== elOf[name]) { const el = $(elOf[prev]); if (el) el.hidden = true; }
    if (name && elOf[name]) { const el = $(elOf[name]); if (el) el.hidden = false; }
    if ((name === 'ask' || name === 'host' || name === 'rps') && this.o.onDialog) this.o.onDialog(); // плашка НПС вытесняет карточку: на экране одна
  }
  // закрыть то, что не мешает дуэли (плашки и меню магазина); false, если идёт партия, кубик или открыта колода/карта/шаринг
  closeBlocking() {
    if (!this.modal) return true;
    if (this.modal === 'host') { if (this.closeHost) this.closeHost(); else this.setModal(null); return true; }
    if (this.modal === 'ask') { this.closeDialog(); return true; }
    if (this.modal === 'shop') { this.setModal(null); this.shopAt = null; return true; }
    return false;
  }
  // сбросить текущую цель броска и отпустить скелета, который её ждал
  // снимает и приказ «сразиться»: без управления скелет не должен сам дойти до босса и начать бой
  dropPending() { const p = this.pending; this.pending = null; this.pendingBoss = null; if (p && !p.rolling && p.npc.state === 'wait') this.sim.release(p.npc); }
  // --- игрок
  setPlayer(a) {
    if (this.player === a) return;
    if (this.player) { this.sim.unsetPlayer(this.player); this.player.def.player = false; this.select(false); }
    this.hunters?.reset(true); // смена скелета: охотники прежнего расходятся без записей, угроза остаётся в его прогрессе
    this.player = a; a.def.player = true; this.lastPerished = null; this.tipsyUntil = 0; this.seenUntil = 0; this.sim.setPlayer(a); a.baseSpeed = a.speed; a.speed = a.baseSpeed * classSpeed(a.def.cls); // исследователь быстрее; охотники считают от baseSpeed
    const g = a.def.game = migrate(a.def.game); // старый прогресс один раз превращается в v2: счёт, хвост, журнал
    if (g.hp <= 0) g.hp = g.maxHp; // сохранились мёртвым: собираемся заново с полным здоровьем
    if (this.tarot) { this.tarot.reset(); for (const t of g.tarot) this.tarot.markDone(t.id); }
    this.pending = null; this.pendingBoss = null; this.closeDialog();
    this.restore(); this.save(); this.renderHUD();
    this.cards?.onPlayerChange(); // карты часа нового скелета: его сохранённая рука или новая сдача
  }
  clearPlayer() {
    if (!this.player) return;
    const p = this.player; this.select(false); this.pending = null; this.closeDialog(); this.hunters?.reset(true);
    for (const f of [...(p.followers || [])]) this.sim.unfriend(f);
    this.sim.unsetPlayer(p); p.def.player = false; this.player = null; this.candies.clear(); if (this.tarot) this.tarot.reset(); this.renderHUD();
    this.cards?.onPlayerChange();
  }
  // после перезагрузки: убитые из журнала снова призраки, хвост снова идёт следом
  restore() {
    const g = this.g; if (!g) return;
    const byUid = new Map(); for (const a of this.sim.agents) if (a.uid) byUid.set(a.uid, a);
    for (const e of g.log) { if (e.kind !== 'kill' || e.boss) continue; const a = byUid.get(e.uid); if (a && !a.ghost && a.bio.name === e.name) this.sim.ghostify(a); }
    for (const f of g.tail) {
      let a = byUid.get(f.uid); if (a && a.leader === this.player) continue; // уже идёт следом (вернулись к этому скелету)
      if (a && (a.leader || a.ghost || a.player || a.bio.name !== f.name)) a = null;
      if (!a && f.name && f.arch) a = this.sim.spawnFriend(f, this.player.x, this.player.z);
      if (a) { this.sim.befriend(a, this.player); a.x = this.player.x + (Math.random() - 0.5) * 6; a.z = this.player.z + (Math.random() - 0.5) * 6; }
    }
  }
  save() { const g = this.g; if (!g) return; g.x = Math.round(this.player.x); g.z = Math.round(this.player.z); this.o.save(); if (this.o.onChange) this.o.onChange(); }
  select(on) {
    if (on && this.player && this.player.state === 'dead') return; // мёртвым не управляют: ждём респауна
    this.selected = !!on && !!this.player; this.ring.visible = this.selected;
    if (this.player) { if (!this.selected) this.dropPending(); this.closeDialog(); this.sim.setAuto(this.player, !this.selected); }
    this.renderHUD(); document.body.classList.toggle('playing', this.selected);
  }
  // на автопилоте свой скелет заходит в бары сам: записываем как посещение, но без щита
  onEnter(a, v) {
    if (a !== this.player || !a.auto || !v) return; const g = this.g; if (!g) return;
    g.visits.unshift({ name: v.name, at: clock(), id: v.id, auto: true }); if (g.visits.length > 40) g.visits.length = 40;
    this.sim.say(a, `🎃 заглянул${a.bio.gender === 'm' ? '' : 'а'} в ${v.name}`, 'beer', 2.4); this.save(); this.renderHUD(); this.o.showCard(a, true);
  }
  // --- клики
  clickGround(x, z) {
    if (this.modal === 'host') this.closeHost();
    if (!this.selected || !this.player || this.busy || this.player.state === 'dead') return false;
    this.dropPending(); this.pendingVenue = null; this.pendingBoss = null; this.closeDialog();
    // клик рядом с меткой арканы ведёт точно в точку подбора: иначе соседний узел в 20 м оставляет карту неподобранной
    if (this.tarot) { let best = null, bd = 25 * 25; for (const it of this.tarot.items) { if (it.done || it.node < 0) continue; const d = (it.nx - x) ** 2 + (it.nz - z) ** 2; if (d < bd) { bd = d; best = it; } } if (best) { x = best.nx; z = best.nz; } }
    // клик рядом с конфетой или монетой ведёт точно в её точку: радиус подбора меньше погрешности клика
    if (this.candies) { let best = null, bd = 12 * 12; for (const c of this.candies.items) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } if (best) { x = best.x; z = best.z; } }
    if (this.sim.moveTo(this.player, x, z, { cut: true })) { this.dest.position.set(x, 0.56, z); this.dest.visible = true; this.destT = 1; return true; }
    Sfx.play('boo'); this.sim.say(this.player, 'туда не пройти', 'boo', 1.4); return true;
  }
  clickAgent(a) {
    if (this.modal === 'host') this.closeHost();
    if (!this.player || !this.selected || this.busy) return false;
    if (this.modal && this.modal !== 'ask' && this.modal !== 'host') return false; // поверх меню, колоды и кубика диалог не открываем
    if (a === this.player) return false;
    if (a.ghost || a.leader === this.player || a.player || a.custom) return false; // призраки, друзья и чужие скелеты — только карточка
    this.openDialog(a); return true;
  }
  clickVenue(v) {
    if (this.modal === 'host') this.closeHost();
    if (!this.selected || !this.player || this.busy || v.node < 0 || v.tx == null || this.player.state === 'dead') return false;
    this.dropPending(); this.pendingBoss = null; this.closeDialog();
    if (this.sim.moveTo(this.player, v.tx, v.tz, { cut: true })) { this.pendingVenue = v; this.dest.position.set(v.tx, 0.56, v.tz); this.dest.visible = true; this.destT = 1; }
    else Sfx.play('boo'); this.sim.say(this.player, 'туда не пройти', 'boo', 1.4);
    return true;
  }
  clickShop(sh) {
    if (this.modal === 'host') this.closeHost();
    if (!this.selected || !this.player || this.busy || sh.node < 0 || sh.tx == null || this.player.state === 'dead') return false;
    this.dropPending(); this.pendingVenue = null; this.pendingBoss = null; this.closeDialog();
    if (this.sim.moveTo(this.player, sh.tx, sh.tz, { cut: true })) { this.pendingShop = sh; this.dest.position.set(sh.tx, 0.56, sh.tz); this.dest.visible = true; this.destT = 1; }
    else Sfx.play('boo'); this.sim.say(this.player, 'туда не пройти', 'boo', 1.4);
    return true;
  }
  // --- диалог «сладость или гадость»
  openDialog(npc) {
    this.dialogNpc = npc; this.setModal('ask');
    drawPortrait(npc.costume, $('askPic'));
    $('askName').textContent = npc.bio.name; $('askMeta').textContent = `${npc.bio.age} ${ageWord(npc.bio.age)} · ${npc.bio.job}`;
    this.sim.say(npc, pick(npc.rng, LINES.ask), '', 2);
  }
  closeDialog() { if (this.modal === 'ask') this.setModal(null); this.dialogNpc = null; }
  choose(action) {
    const npc = this.dialogNpc; this.closeDialog(); if (!npc || !this.player || this.busy) return;
    if (npc.ghost || npc.leader) return;
    if (this.pending && this.pending.npc !== npc) this.dropPending();
    // скелет ждёт столько, сколько нужно дойти до него (плюс запас), иначе дальние цели «уходили» раньше, чем игрок добирался
    const dist = Math.hypot(npc.x - this.player.x, npc.z - this.player.z);
    this.sim.wait(npc, this.player, Math.min(150, 30 + dist / 2.5));
    this.pending = { npc, action, tries: 0 }; this.pendingVenue = null; this.pendingBoss = null;
    if (!this.inReach(npc)) {
      if (!this.sim.moveTo(this.player, npc.x, npc.z, { cut: true })) { Sfx.play('boo'); this.sim.say(this.player, 'не дойти', 'boo', 1.4); this.sim.release(npc); this.pending = null; }
      else this.sim.wait(npc, this.player, Math.min(240, 30 + (this.player.routeCost || dist) / 3)); // ждёт по длине дороги, а не по прямой
    }
  }
  // досягаемость в долях роста: прохожие 0.8, охотники PURSUIT.reach (около двух ростов)
  inReach(npc, mult = 0.8) { return (npc.x - this.player.x) ** 2 + (npc.z - this.player.z) ** 2 < Math.max(5, this.sim.H * mult) ** 2; }
  onArrive(a, node) {
    if (a !== this.player) return;
    // явный визит — по входу (tx, tz) того бара, к которому шли: узел бывает общий на несколько баров; случайный проход через узел бара — визит без плашки
    const atEntry = t => !!t && t.tx != null && Math.hypot(a.x - t.tx, a.z - t.tz) < 3;
    const pv = this.pendingVenue, v = this.sim.venueNode.get(node);
    if (atEntry(pv)) { this.visit(pv); this.offerGame(pv, 'bar'); }
    else if (v && !pv) this.visit(v);
    this.pendingVenue = null;
    const ps = this.pendingShop;
    if (atEntry(ps)) this.offerGame(ps, 'shop', () => this.openShop(ps)); // случайный проход через узел магазина меню не открывает
    this.pendingShop = null;
    const p = this.pending;
    if (p && !p.rolling && !this.inReach(p.npc)) { if (p.tries++ < 3 && p.npc.state === 'wait') this.sim.moveTo(this.player, p.npc.x, p.npc.z, { cut: true }); else { this.sim.release(p.npc); this.pending = null; this.sim.say(this.player, 'ушёл…', 'boo', 1.4); } }
  }
  // --- заведения: первое посещение под управлением даёт очко (множество seenVenues); щиты и сброс розыска теперь в игре с хозяином
  visit(v) {
    const g = this.g, me = this.player;
    const first = this.controlled && !g.seenVenues.includes(v.id);
    g.visits.unshift({ name: v.name, at: clock(), id: v.id }); if (g.visits.length > 40) g.visits.length = 40; // список для карточки
    v.visits++;
    if (first) { g.seenVenues.push(v.id); this.points(POINTS.visit); this.log('visit', { name: v.name, id: v.id }); this.notify(`${escHtml(v.name)} · XP +${POINTS.visit}`, 'places'); }
    else this.notify(escHtml(v.name), 'places', 1800);
    me.state = 'drink'; me.timer = 2.2; this.sim.enterVenue(me, v);
    this.save(); this.renderHUD(); this.o.showCard(me, true);
  }
  // --- игра с хозяином: плашка при явном визите, партия в камень-ножницы-бумагу за ставку по уровню розыска
  seenActive() { return this.sim.time < this.seenUntil; }
  offerGame(place, kind, onDone = null) {
    const g = this.g, p = this.player;
    if (!g || !this.controlled || this.modal !== null) { if (onDone) onDone(); return; }
    const host = hostOf(kind, place); const stake = stakeOf(this.hunters ? this.hunters.level : 0, kind);
    if (g.coins < stake) { this.sim.say(p, `🎲 ставка ${stake} 🪙, не хватает`, 'boo', 2.4); if (onDone) onDone(); return; }
    if (this.sim.time - (this.lastPlay.get(host.key) ?? -1e9) < RPS.cooldown) { this.sim.say(p, '🎲 только что играли', '', 2); if (onDone) onDone(); return; }
    this.host = { place, kind, host, stake, ties: 0, onDone, busy: false };
    this.setModal('host'); $('host').className = '';
    drawPortrait(host.costume, $('hostPic')); $('hostName').textContent = host.name; $('hostMeta').textContent = `${host.age} ${ageWord(host.age)} · ${host.job} · ${place.name}`;
    $('hostAsk').textContent = `сыграем за ${stake} 🪙?`; $('hostFav').textContent = g.hosts[host.key] ? `любит ${THROW_NAME[g.hosts[host.key]]}` : '';
    $('hostRes').hidden = true; $('hostBtns').hidden = false; for (const b of $('hostBtns').querySelectorAll('button')) b.disabled = false;
    // плашка гаснет сама через 10 с: тонкая полоска времени по настенным часам
    this.stopHostTimer(); const t0 = performance.now(); $('hostBar').style.width = '100%';
    this.hostTimer = setInterval(() => { const left = 1 - (performance.now() - t0) / (RPS.promptSec * 1000); $('hostBar').style.width = Math.max(0, left * 100) + '%'; if (left <= 0) this.closeHost(); }, 100);
  }
  stopHostTimer() { if (this.hostTimer) { clearInterval(this.hostTimer); this.hostTimer = null; } }
  // закрыть плашку или результат партии; отказ ничего не стоит; для магазина onDone открывает меню покупок
  closeHost() {
    if (this.modal !== 'host' && this.modal !== 'rps') return;
    this.stopHostTimer(); const h = this.host; this.host = null; this.setModal(null);
    if (h && h.onDone) h.onDone();
  }
  playRps(mine) {
    const h = this.host, g = this.g, p = this.player;
    if (!h || !g || !p || (this.modal !== 'host' && this.modal !== 'rps') || h.busy || !THROWS.includes(mine)) return;
    this.setModal('rps'); this.stopHostTimer(); h.busy = true; $('hostBar').style.width = '0%';
    const theirs = THROWS.includes(this.debugThrow) ? this.debugThrow : hostThrow(h.host.fav, Math.random);
    const btns = $('hostBtns').querySelectorAll('button'); for (const b of btns) b.disabled = true;
    $('hostRes').hidden = false; $('hostVs').textContent = `${THROW_ICON[mine]} ${THROW_ICON[theirs]}`;
    const fem = p.bio.gender === 'f';
    if (mine === theirs) {
      h.ties++;
      if (h.ties >= RPS.maxTies) { $('hostText').textContent = 'хозяин машет рукой: без ставки'; setTimeout(() => this.closeHost(), 1500); return; }
      $('hostText').textContent = 'ничья, ещё раз'; setTimeout(() => { if (this.host === h) { h.busy = false; for (const b of btns) b.disabled = false; } }, 900); return;
    }
    const won = rpsBeats(mine, theirs); const { place, kind, stake } = h; const key = h.host.key;
    g.coins -= stake; let bonus, bubble;
    if (kind === 'bar') { if (g.shields < RPS.shieldMax) { g.shields++; bonus = 'shield'; bubble = '🎃 +щит'; } else { g.coins += stake; bonus = 'refund'; bubble = '🪙 ставка обратно'; } }
    else {
      // случайная вещь из каталога бесплатно: случайный вид, не совпадающая с надетой
      const kk = pick(Math.random, Object.keys(SHOP_KINDS).filter(k => k !== 'colors'));
      let id = randomItem(kk, p.rng); for (let i = 0; i < 5 && id === p.costume[kk]; i++) id = randomItem(kk, p.rng);
      const c = { ...p.costume, [kk]: id }; this.sim.recostume(p, c); p.def.costume = c; bonus = CATALOG[kk][id]; bubble = `🛍 ${bonus}`;
    }
    const lvl0 = this.hunters ? this.hunters.level : 0; // уровень до сброса розыска: лишний охотник приходит прежней силы
    const amount = resetAmount(kind, won); if (this.hunters) this.hunters.resetAtVenue(amount);
    if (!won) {
      this.tipsyUntil = this.sim.time + RPS.tipsy.sec;
      if (kind === 'shop') { const wasSeen = this.seenActive(); this.seenUntil = this.sim.time + RPS.seen.sec; if (!wasSeen && this.hunters) this.hunters.extra(lvl0); } // повтор продлевает срок, второго лишнего не зовёт
    }
    g.hosts[key] = h.host.fav; this.lastPlay.set(key, this.sim.time);
    this.log('rps', { place: place.name, venueKind: kind, host: h.host.name, hostGender: h.host.gender, mine, theirs, won, bonus, reset: amount });
    $('host').className = won ? 'won' : 'lost';
    $('hostText').textContent = (won ? `выиграл${fem ? 'а' : ''}` : `проиграл${fem ? 'а' : ''}`) + ` · −${stake} 🪙` + (won ? '' : kind === 'shop' ? ' · 🍺 штормит · 👀 засветился' : ' · 🍺 штормит');
    const heat = this.hunters ? this.hunters.heat : 0;
    this.sim.say(p, bubble, 'beer', 2.2); setTimeout(() => this.player === p && this.sim.say(p, heat <= 0 ? '🪦 чист' : `🪦 розыск −${amount / 20}`, 'beer', 2.2), 1400);
    setTimeout(() => { if (this.host === h) this.closeHost(); }, 1500);
    this.save(); this.renderHUD();
  }
  // чипы дебаффов в HUD: «🍺 0:38», «👀 1:12»
  chipsHtml() {
    const now = this.sim.time; const mmss = s => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60)).padStart(2, '0')}`; let s = '';
    if (now < this.tipsyUntil) s += `<span class="dbf" title="штормит: скорость ×0,65">${icon('beer', 1)} ${mmss(this.tipsyUntil - now)}</span>`;
    if (now < this.seenUntil) s += `<span class="dbf" title="засветился: лишний охотник с +1">${icon('wanted', 1)} ${mmss(this.seenUntil - now)}</span>`;
    return s;
  }
  // --- урон и лечение
  // щит 🎃 из запаса (g.shields, до трёх, переживает смерть) принимает одну рану; остаток бьёт по здоровью
  useShields(n) {
    const g = this.g; const used = Math.min(n, Math.max(0, g.shields | 0)); if (!used) return 0;
    g.shields -= used; this.notify(used > 1 ? `щит принял ${used}` : 'щит принял', 'shield', 2000); return used;
  }
  damage(n) {
    const g = this.g; n -= this.useShields(n);
    if (n > 0) { g.hp = Math.max(0, g.hp - n); Sfx.play('bite'); this.heartLostAt = Date.now(); this.renderHUD(); if (g.hp <= 0) this.die(); }
  }
  heal(n, raiseMax = false) { const g = this.g; if (raiseMax) g.maxHp = Math.min(CAPS.hearts, g.maxHp + n); g.hp = Math.min(g.maxHp, g.hp + n); }
  // охотник ест стак: щиты поглощают позиции, потом убегает последний друг из хвоста, потом уходит сердце насовсем.
  // tailOnly: только хвост (крит-провал с прохожим). Возвращает 'dead', если укус добил
  eat(n, by, tailOnly = false) {
    const g = this.g, me = this.player; if (!g || !me || me.state === 'dead') return me && me.state === 'dead' ? 'dead' : 'alive';
    if (tailOnly) n = Math.min(n, g.tail.length); // побег друга при крит-провале щиты не блокируют
    else n -= this.useShields(n);
    const lost = n > 0 ? eatStack(g, n) : [];
    if (lost.some(l => l.kind !== 'friend')) { this.heartLostAt = Date.now(); this.renderHUD(); } // сердце мигает и исчезает
    lost.forEach((l, i) => {
      const say = text => setTimeout(() => this.player === me && this.sim.say(me, text, 'boo', 2.4), 400 + i * 1300);
      if (l.kind === 'friend') {
        const f = l.who; const a = (me.followers || []).find(x => x.uid === f.uid);
        if (a) { this.sim.unfriend(a); this.sim.say(a, 'ай', 'boo', 2); }
        say(`💚 ${firstName(f.name)} убежал${f.gender === 'f' ? 'а' : ''}`);
      } else say('❤ −1 насовсем');
    });
    this.renderHUD();
    if (g.hp <= 0) { this.die(); return 'dead'; }
    return 'alive';
  }
  die() {
    const g = this.g, p = this.player; if (!p || p.state === 'dead') return;
    // цена смерти: половина монет; совсем без монет — пермасмерть
    const { left, perma } = deathCoins(g.coins); const lost = g.coins - left; g.coins = left;
    if (perma) { this.perish(); return; }
    g.deaths++; this.pending = null; this.pendingVenue = null; this.pendingBoss = null; this.closeDialog();
    // стак рассыпается вместе с костями: хвост разбегается, максимум сердец −2 (не ниже трёх), угроза и охотники обнуляются; щиты остаются
    for (const f of [...(p.followers || [])]) { this.sim.unfriend(f); this.sim.say(f, 'ой', 'boo', 1.6); }
    g.tail = []; g.maxHp = Math.max(CAPS.baseHearts, g.maxHp - 2); g.hp = 0;
    this.log('death', { coinsLost: lost }); this.hunters?.reset();
    this.sim.stop(p); p.state = 'dead'; p.timer = 1e9; p.sprite.material.opacity = 0.35; p.sprite.material.transparent = true;
    this.sim.say(p, 'рассыпался на кости…', 'boo', 3); if (lost > 0) setTimeout(() => this.player === p && this.sim.say(p, `☠ −${lost} 🪙`, 'boo', 2.2), 1200);
    this.respawnAt = performance.now() + 3500;
  }
  // пермасмерть: без монет скелет рассыпается навсегда — вечный призрак в городе, dead в прогрессе и в базе, управлять им нельзя
  perish() {
    const g = this.g, p = this.player; if (!p) return;
    g.deaths++; this.dropPending(); this.pendingVenue = null; this.pendingShop = null; this.pendingBoss = null; this.stopHostTimer(); this.host = null; this.setModal(null); this.dialogNpc = null; this.shopAt = null; this.tipsyUntil = 0; this.seenUntil = 0;
    for (const f of [...(p.followers || [])]) { this.sim.unfriend(f); this.sim.say(f, 'ой', 'boo', 1.6); }
    g.tail = []; g.hp = 0; g.score = 0; // пермасмерть обнуляет XP: строка уходит в базу с dead и нулём
    this.log('rip', {}); this.hunters?.reset();
    p.def.dead = true; p.def.diedAt = new Date().toISOString(); p.def.diedStreet = this.sim.streetOf(p); p.def.player = false;
    this.selected = false; this.ring.visible = false; document.body.classList.remove('playing');
    this.sim.unsetPlayer(p); this.sim.ghostify(p, 'player'); this.sim.say(p, '☠ упокоен навсегда', 'boo', 4); // золотой призрак
    this.save(); // до обнуления игрока: прогресс и строка в базе уходят с dead
    this.lastPerished = p.bio.name; this.player = null; this.candies.clear(); if (this.tarot) this.tarot.reset();
    this.cards?.onPlayerChange(); // боссы упокоенного уходят, рука остаётся в его прогрессе
    if (this.o.onPerish) this.o.onPerish(p);
    this.renderHUD();
  }
  respawn() {
    const p = this.player, g = this.g; g.hp = g.maxHp;
    // встаём у ближайшего заведения, если оно рядом, иначе на том же месте
    let best = null, bd = 400 * 400; for (const v of this.sim.active) { const d = (v.x - p.x) ** 2 + (v.z - p.z) ** 2; if (d < bd) { bd = d; best = v; } }
    this.sim.teleport(p, best ? best.node : this.sim.nodeOf(p)); p.to = p.from; p.state = 'idle'; p.trail = []; p.sprite.material.opacity = 1;
    this.sim.say(p, 'собрался заново', '', 2.2); this.save(); this.renderHUD(); this.o.showCard(p, true);
  }
  // счёт-накопитель: победа +2, поражение −1, аркана +5, новое заведение +1, не ниже нуля
  points(n) { const s = addPoints(this.g, n); this.save(); this.renderHUD(); return s; }
  // запись в журнал персонажа: вид, улица, время и всё, что передали; новые сверху, хранится 200
  log(kind, extra = {}) { const e = logPush(this.g, { kind, street: this.sim.streetOf(this.player), ...extra }); if (this.o.onLog) this.o.onLog(); return e; }
  // --- бросок кубика и его исход
  async roll() {
    const p = this.pending; if (!p) return; p.rolling = true; this.busy = true; this.sim.stop(this.player); this.setModal('dice');
    const npc = p.npc, me = this.player;
    const title = (p.action === 'kill' ? '💀 Гадость · ' : '🍬 Сладость · ') + npc.bio.name;
    let res; const g = this.g;
    try {
      res = await rollDice(title, this.debugRoll ?? undefined, true, { bonus: classDie(me.def.cls) }); // воин: +1 к порогу успеха
      if ((res.kind === 'fail' || res.kind === 'critfail') && g.tokens > 0) {
        const again = await this.offerSave(res);
        if (again) { g.tokens--; this.save(); this.renderHUD(); res = await rollDice('🎟 Спас-бросок · ' + npc.bio.name, this.debugRoll2 ?? undefined, false, { bonus: classDie(me.def.cls) }); }
        else hideDice();
      } else setTimeout(hideDice, 1800);
    } catch (e) { console.warn(e); hideDice(); res = { n: 10, kind: 'fail' }; }
    this.pending = null; this.busy = false; if (this.modal === 'dice') this.setModal(null);
    if (!this.player || this.player !== me) return;
    this.resolve(p.action, npc, res);
  }
  resolve(action, npc, res) {
    const g = this.g, me = this.player;
    const info = { uid: npc.uid, name: npc.bio.name, age: npc.bio.age, gender: npc.bio.gender, job: npc.bio.job, arch: npc.arch, ck: npc.ck, roll: res.n, action, at: new Date().toISOString() };
    const later = (text, kind, ms) => setTimeout(() => this.player === me && this.sim.say(me, text, kind, 2.2), ms);
    if (res.kind === 'fail' || res.kind === 'critfail') {
      // провал ранит здоровье, которое лечится; крит-провал ещё пугает последнего друга из хвоста
      this.sim.release(npc); this.sim.say(npc, pick(npc.rng, LINES.mock), 'boo', 2.4);
      const dmg = res.kind === 'critfail' ? 2 : 1;
      g.losses++; this.points(POINTS.loss); this.log('fail', info);
      this.notify(`−${dmg} ${icon('heart', 1)} · XP −${-POINTS.loss}`, 'skull');
      this.damage(dmg); if (this.player !== me) return; // упокоен навсегда: дальше нечего начислять
      if (res.kind === 'critfail' && me.state !== 'dead' && g.tail.length) this.eat(1, 'critfail', true);
    } else {
      if (action === 'kill') {
        this.sim.say(npc, pick(npc.rng, LINES.scared), 'boo', 2.4); this.sim.ghostify(npc);
        g.kills++; const grew = growHearts(g);
        this.sim.say(me, grew ? '💀 +1 череп · ❤ +1' : '💀 +1 череп', '', 2.4);
        this.log('kill', info); this.hunters?.gain('kill'); this.quests?.onEvent('kill', POINTS.win);
      } else {
        // хвост до десяти: одиннадцатый остаётся другом в городе, в журнал и очки попадает, следом не идёт
        const inTail = g.tail.length < CAPS.tail;
        this.sim.say(npc, pick(npc.rng, LINES.yes), 'music', 2.4);
        if (inTail) { this.sim.befriend(npc, me); g.tail.push({ ...info }); this.sim.say(me, `💚 новый друг · хвост ${g.tail.length}/${CAPS.tail}`, '', 2.4); }
        else { this.sim.release(npc); this.sim.say(me, '💚 друзей уже десять, помашет из толпы', '', 2.8); }
        g.friendsTotal = (g.friendsTotal | 0) + 1; this.log('friend', { ...info, inTail }); this.hunters?.gain('friend'); this.quests?.onEvent('friend', POINTS.win);
      }
      g.wins++; this.points(POINTS.win); Sfx.play('win');
      const coins = res.kind === 'crit' ? 4 : 2; g.coins += coins; later(`🪙 +${coins} · XP +${POINTS.win}`, 'beer', 2600);
      if (res.kind === 'crit') { this.heal(1); later('❤ +1 за крит', 'music', 1200); }
    }
    this.save(); this.renderHUD(); this.o.showCard(me, true);
  }
  // --- дуэль с охотником: встречный бросок d20 против d20 с бонусами. null, если сейчас нельзя начать
  // (идёт другой бросок, игрок мёртв, открыта модалка): охотник подождёт и повторит
  async duel(h) {
    const g = this.g, me = this.player;
    if (!g || !me || this.busy || me.state === 'dead' || !this.closeBlocking()) return null;
    this.busy = true; this.dropPending(); this.sim.stop(me); this.setModal('dice');
    const a = h.a, name = a.bio.name, fb = h.bonus || 0, tb = tailBonus(g.tail.length) + classDie(me.def.cls); // бонус хвоста плюс класс (воин)
    const titleFoe = (h.card ? '🃏 ' + cardLabel(h.card.rank, h.card.suit) + ' · ' : h.intent === 'kill' ? '⚔ ' : '🤝 ') + name + (fb ? ' +' + fb : ''), titleMe = 'ты' + (tb ? ' +' + tb : '');
    const won = x => x.bio.gender === 'f' ? 'выиграла' : 'выиграл';
    const cmp = (foe, m) => `${foe}${fb ? '+' + fb : ''} против ${m}${tb ? '+' + tb : ''}`;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let foe = 0, my = 0, r = { winner: 'tie', crit: false, eat: 0 }, saveOffered = false;
    try {
      for (let i = 0; i < 10; i++) {
        foe = (await rollDice(titleFoe, this.debugRollFoe ?? undefined, true, { plain: true })).n;
        my = (await rollDice(titleMe, this.debugRoll ?? undefined, true, { plain: true })).n;
        r = duel(foe, fb, my, tb);
        // жетон спас-броска: после сравнения, перебрасывает только кубик игрока, один раз за дуэль
        if (r.winner === 'foe' && !saveOffered && g.tokens > 0) {
          saveOffered = true; showDuelResult(cmp(foe, my) + ' · ' + firstName(name) + ' ' + won(a), 'fail', true);
          const again = await this.offerSave({ n: my });
          if (again) { g.tokens--; this.save(); this.renderHUD(); my = (await rollDice('🎟 Спас-бросок · ' + titleMe, this.debugRoll2 ?? undefined, true, { plain: true })).n; r = duel(foe, fb, my, tb); }
        }
        if (r.winner !== 'tie') break;
        showDuelResult(cmp(foe, my) + ' · ничья, ещё раз', 'tie', true); await sleep(900);
      }
    } catch (e) { console.warn(e); hideDice(); this.busy = false; if (this.modal === 'dice') this.setModal(null); return null; }
    if (this.modal === 'dice') this.setModal(null);
    if (r.winner === 'tie') r = { winner: 'me', crit: false, eat: 0 }; // десять ничьих подряд: считаем победой игрока
    if (this.player !== me) { hideDice(); this.busy = false; return null; }
    h.rolls = [foe, fb, my + tb]; // для записи набега в базу: кубик охотника, его бонус, кубик игрока с бонусом
    showDuelResult(cmp(foe, my) + ' · ' + (r.winner === 'me' ? 'ты ' + won(me) : firstName(name) + ' ' + won(a)), r.winner === 'me' ? (r.crit ? 'crit' : 'success') : (r.crit ? 'critfail' : 'fail'));
    if (h.card && this.cards) { // босс часа: исход считает cards.settle (карта, XP по старшинству, откат)
      const outcome = this.cards.settle(h, r, { foe, fb, my, tb });
      if (this.player !== me) { this.busy = false; return outcome; }
      this.save(); this.renderHUD(); this.busy = false; this.o.showCard(me, true); return outcome;
    }
    const base = { uid: a.uid, name, age: a.bio.age, gender: a.bio.gender, job: a.bio.job, arch: a.arch, ck: a.ck, boss: true, intent: h.intent, owner: h.owner ? h.owner.id : null, ghoul: !!(a.def && a.def.ghoul), foe, bonus: fb, roll: my, meBonus: tb, level: this.hunters ? this.hunters.level : 0 };
    const later = (text, kind, ms) => setTimeout(() => this.player === me && this.sim.say(me, text, kind, 2.2), ms);
    let outcome;
    if (r.winner === 'me') {
      // босс-трофей: тип по намерению охотника; максимум сердец не растёт, при крите +1 здоровья
      outcome = h.intent === 'kill' ? 'skull' : 'heart';
      if (r.crit) this.heal(1);
      g.coins += 4; g.wins++; this.points(POINTS.win); Sfx.play('win');
      this.log('win', base); this.hunters?.gain('raidWin'); this.quests?.onEvent('win', POINTS.win);
      this.sim.say(me, h.intent === 'kill' ? '👑💀 босс-череп' : '👑💚 босс-сердечко', 'music', 2.8);
      later(`🪙 +4 · XP +${POINTS.win}`, 'beer', 2600);
    } else {
      // укус: позиция стака насовсем (две при крите), −1 очко; если здоровье кончилось — смерть
      g.losses++; this.points(POINTS.loss);
      this.sim.say(a, r.crit ? 'АМ-АМ' : 'ам', 'boo', 2.4);
      this.log('bit', { ...base, ate: r.eat }); Sfx.play('bite');
      outcome = this.eat(r.eat, 'hunter') === 'dead' ? (this.player !== me && me.def.dead ? 'rip' : 'killed') : 'bit';
    }
    if (this.player !== me) { this.busy = false; return outcome; } // упокоен внутри дуэли: игрока уже нет
    this.save(); this.renderHUD(); this.busy = false; this.o.showCard(me, true);
    return outcome;
  }
  // --- каждый кадр
  update(dt, t) {
    const p = this.player, H = this.sim.H;
    if (p) {
      // «штормит» живёт отдельным множителем: охотники и хвост считают скорость от базовой
      // проезжая часть под управлением: быстрее, но розыск растёт по очку за ROAD.heatPer секунд ходьбы; стоять на дороге бесплатно
      const road = !!this.selected && this.sim.onRoad(p); const tipsy = this.sim.time < this.tipsyUntil;
      const spr = sprintStep(this.stamina, dt, this.sprinting && this.selected && (p.state === 'walk' || p.state === 'cut'), this.exhausted); this.stamina = spr.stamina; this.exhausted = spr.exhausted;
      this.speedMul = (tipsy ? RPS.tipsy.speed : 1) * (road ? ROAD.speed : 1) * spr.mul; p.speedMul = this.speedMul; p.tipsy = tipsy;
      this.ring.material.color.setHex(spr.mul > 1 ? 0xff8a2a : this.exhausted ? 0x777777 : 0x4df21e);
      if (road) { const r = roadHeat(this.roadAcc, dt); this.roadAcc = r.acc; for (let i = 0; i < r.points; i++) this.hunters?.gain('road'); if (!this.roadSaid) { this.roadSaid = true; this.sim.say(p, 'по проезжей части быстрее, но заметнее', '', 2.6); } }
      else this.roadAcc = 0;
      if (road !== this.onRoadLast) { this.onRoadLast = road; this.renderHUD(); }
      if (p.tipsy && this.sim.time - this.ikAt > 10) { this.ikAt = this.sim.time; if (!p.bubble) this.sim.say(p, 'ик', 'beer', 1.4); }
      const dbf = this.sim.time < this.tipsyUntil || this.sim.time < this.seenUntil; this.hudAcc += dt;
      if ((dbf || this.hadDebuff) && this.hudAcc > 1) { this.hudAcc = 0; this.hadDebuff = dbf; this.renderHUD(); }
      if (this.ring.visible) { this.ring.position.set(p.x, 0.55, p.z); const s = H * 0.42; this.ring.scale.set(s, 1, s); }
      if (this.dest.visible) { this.destT -= dt * 1.2; const s = H * 0.3 * (1 + (1 - Math.max(0, this.destT)) * 0.8); this.dest.scale.set(s, 1, s); this.dest.material.opacity = Math.max(0, this.destT); if (this.destT <= 0) this.dest.visible = false; }
      if (p.state === 'dead' && performance.now() >= this.respawnAt) this.respawn();
      const pr = this.pending;
      if (pr && !pr.rolling) {
        if (pr.npc.ghost || pr.npc.state !== 'wait') { this.pending = null; this.sim.say(p, 'ушёл…', 'boo', 1.4); }
        else if (this.inReach(pr.npc) && p.state !== 'dead') this.roll();
      }
      // босс часа: дошли на дистанцию дуэли — бой; карта отдохнула не до конца или босс ушёл со сменой часа — приказ снимается
      const pb = this.pendingBoss;
      if (pb && !this.busy) {
        // бой только под управлением и без открытой модалки: отпустили — приказ снимается, модалка — ждём у босса
        const gone = this.cards ? this.cards.agentOf(pb.card) !== pb.a : !this.sim.agents.includes(pb.a);
        if (!this.controlled || gone || pb.card.state !== 'up') this.pendingBoss = null;
        else if (this.modal === null && this.inReach(pb.a, PURSUIT.reach)) { this.pendingBoss = null; this.duel({ a: pb.a, intent: 'kill', bonus: bossBonus(pb.card.rank), card: pb.card }); }
      }
    }
    if (this.tarot) this.tarot.update(t, p, 12, it => this.collect(it));
    this.chests.update(p, H, t, this.g, this.controlled && !this.busy && this.modal === null, c => this.openChest(c));
    this.candies.update(p, H, t, kind => {
      const g = this.g;
      if (kind === 'coin') { g.coins++; Sfx.play('coin'); this.sim.say(p, '🪙 +1', 'beer', 1.6); }
      else { Sfx.play('pick'); if (g.hp < g.maxHp) { this.heal(1); this.sim.say(p, pick(p.rng, LINES.candy), 'beer', 1.6); } else this.sim.say(p, 'сладко, но сыт', 'beer', 1.4); }
      this.save(); this.renderHUD(); this.quests?.onEvent(kind === 'coin' ? 'coin' : 'candy', 0); // конфеты и монеты журнал не пишут: квест отсюда
    });
  }
  // --- арканы таро
  collect(it) {
    const g = this.g; if (!g || it.done || this.busy || !this.player) return;
    if (g.tarot.some(t => t.id === it.a.id)) { this.tarot.markDone(it.a.id); return; }
    g.tarot.push({ id: it.a.id, at: new Date().toISOString() }); this.tarot.markDone(it.a.id); // дата и время находки; старые записи «ЧЧ:ММ» fmtAt показывает как есть
    this.points(POINTS.tarot); this.log('tarot', { id: it.a.id, name: it.a.name }); this.hunters?.gain('tarot');
    this.notify(`${it.a.roman} ${escHtml(it.a.name)} · XP +${POINTS.tarot}`, 'arcana', 3000);
    this.save(); this.renderHUD(); this.o.showCard(this.player, true);
    // на автопилоте карта ложится в колоду молча: модалка посреди чужих дел только мешает
    if (!this.player.auto) this.showTarot(it.a, true);
  }
  // карта с текстами от прогресса любого своего скелета (g): из профиля и журнала открывается не только у текущего игрока
  showTarot(a, isNew, g = this.g) {
    this.deckG = g; this.setModal('tarot'); const inner = $('tInner'); // кнопка «колода» в модалке открывает колоду этого же скелета
    drawArcana(a.id, $('tCv'));
    const rec = g && Array.isArray(g.tarot) && g.tarot.find(t => t.id === a.id);
    $('tKicker').textContent = isNew ? 'новая аркана!' : rec ? `найдена ${fmtAt(rec.at)}` : 'аркана';
    $('tName').textContent = `${a.roman} · ${a.name}`; $('tPlace').textContent = a.place; $('tWhy').textContent = a.why; $('tLegend').textContent = a.legend;
    inner.classList.remove('flipped');
    if (isNew) { setTimeout(() => inner.classList.add('flipped'), 120); } else inner.classList.add('flipped');
  }
  closeTarot() { if (this.modal === 'tarot') this.setModal(null); }
  openDeck(g = this.g) {
    this.deckG = g; const have = new Set(g && Array.isArray(g.tarot) ? g.tarot.map(t => t.id) : []); // колода того скелета, чей профиль открыт
    $('dCount').textContent = `${have.size}/${ARCANA.length}`;
    $('dGrid').innerHTML = ARCANA.map(a => have.has(a.id) ? `<div class="slot on" data-id="${a.id}"><canvas width="40" height="60"></canvas><div class="sn">${a.roman} ${esc(a.name)}</div></div>` : `<div class="slot"><canvas width="40" height="60"></canvas><div class="sn">${a.roman} · ?</div><div class="sp">${esc(a.place)}</div></div>`).join('');
    const cvs = $('dGrid').querySelectorAll('.slot canvas'); ARCANA.forEach((a, i) => { if (have.has(a.id)) drawArcana(a.id, cvs[i]); else drawCardBack(cvs[i]); });
    this.setModal('deck');
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
  // --- сундук у достопримечательности: бросок d20, от 8 открыт (монеты, иногда жетон), 20 — вдвое и жетон, 1 — мимик (+2 розыска);
  // закрытый и мимик ждут следующего часа
  async openChest(c) {
    const g = this.g, p = this.player; if (!g || !p || this.busy || this.modal !== null || p.state === 'dead') return;
    this.busy = true; this.sim.stop(p); this.setModal('dice'); (g.chests ||= {})[c.id] = minskHour(Date.now()); this.chests.sync(g);
    let res;
    try { res = await rollDice('🧰 ' + c.name, this.debugRoll ?? undefined, true, { plain: true }); } catch (e) { console.warn(e); res = { n: 10 }; }
    const out = chestOutcome(res.n), loot = chestLoot(Math.random, out);
    if (loot.coins) g.coins += loot.coins; if (loot.token) g.tokens = (g.tokens | 0) + 1;
    if (out === 'mimic') { this.hunters?.gain('road'); this.hunters?.gain('road'); }
    Sfx.play(out === 'locked' ? 'boo' : out === 'mimic' ? 'bite' : out === 'crit' ? 'token' : 'chest');
    const text = out === 'locked' ? 'заперто до следующего часа' : out === 'mimic' ? 'мимик! визг на весь район' : `+${loot.coins} 🪙${loot.token ? ' · 🎟 +1' : ''}`;
    showDuelResult(`🧰 ${c.name} · ${text}`, out === 'locked' ? 'fail' : out === 'mimic' ? 'critfail' : out === 'crit' ? 'crit' : 'success');
    this.log('chest', { name: c.name, roll: res.n, outcome: out, coins: loot.coins, token: loot.token });
    this.busy = false; if (this.modal === 'dice') this.setModal(null); this.save(); this.renderHUD();
  }
  // --- публикация карточки: первый раз даёт жетон
  onShared(net) {
    const g = this.g; if (!g) return false;
    this.quests?.onEvent('share', 0); // квест онбординга «карточка»: засчитывается любая публикация
    if (!g.shared) { g.shared = { net, at: clock() }; g.tokens++; Sfx.play('token'); this.notify('+1 спас-бросок за публикацию', 'token', 3000); this.save(); this.renderHUD(); this.o.showCard(this.player, true); return true; }
    return false;
  }
  // --- магазин одежды
  openShop(sh) {
    const g = this.g; if (!g) return; this.shopAt = sh; this.setModal('shop'); $('shName').textContent = sh.name;
    drawPortrait(this.player.costume, $('shBefore')); drawPortrait(this.player.costume, $('shAfter'));
    $('shMsg').textContent = 'выбери, что купить: вещь выпадает случайно';
    this.renderShop();
  }
  renderShop() {
    const g = this.g; $('shCoins').innerHTML = `${icon('coin', 1)} ${g.coins}`;
    $('shopBtns').innerHTML = Object.entries(SHOP_KINDS).map(([k, label]) => `<button data-kind="${k}" ${g.coins < PRICES[k] ? 'disabled' : ''}>${label} · ${PRICES[k]} ${icon('coin', 1)}</button>`).join('')
      + `<button data-kind="token" ${canBuyToken(g) ? '' : 'disabled'}>${icon('token', 1)}спас-бросок · ${TOKEN.price} ${icon('coin', 1)}${(g.tokens | 0) >= TOKEN.cap ? ` · ${g.tokens | 0}/${TOKEN.cap}` : ''}</button>`; // жетон рядом с одеждой, потолок на покупку
    const c = this.player.costume; const off = [['hat', 'снять шляпу'], ['prop', 'убрать предмет'], ['pattern', 'без узора'], ['face', 'снять с лица'], ['extra', 'снять аксессуар'], ['pet', 'отпустить питомца']].filter(([k]) => c[k] && c[k] !== 'none');
    $('shopFree').innerHTML = off.map(([k, l]) => `<button data-off="${k}">${l}</button>`).join('');
  }
  buy(kind) {
    const g = this.g, p = this.player; if (!g || !p || this.modal !== 'shop') return;
    if (kind === 'token') {
      if (!buyToken(g)) { Sfx.play('boo'); $('shMsg').textContent = (g.tokens | 0) >= TOKEN.cap ? 'жетонов уже три' : 'не хватает монет'; return; }
      Sfx.play('token'); $('shMsg').textContent = `спас-бросок в кармане (−${TOKEN.price} 🪙)`; this.notify(`+1 спас-бросок · −${TOKEN.price} монет`, 'token'); this.log('buy', { kind: 'token', item: 'спас-бросок' });
      this.save(); this.renderHUD(); this.renderShop(); this.o.showCard(p, true); return;
    }
    const price = PRICES[kind]; if (g.coins < price) { Sfx.play('boo'); $('shMsg').textContent = 'не хватает монет'; return; }
    g.coins -= price; Sfx.play('coin'); const c = { ...p.costume }; let got;
    if (kind === 'colors') { c.c1 = pick(p.rng, PALETTE); c.c2 = pick(p.rng, PALETTE); c.c3 = pick(p.rng, PALETTE); c.shoes = p.rng() < 0.6 ? pick(p.rng, PALETTE) : null; got = 'новые цвета'; }
    else { let id = randomItem(kind, p.rng); for (let i = 0; i < 5 && id === c[kind]; i++) id = randomItem(kind, p.rng); c[kind] = id; got = CATALOG[kind][id]; }
    drawPortrait(p.costume, $('shBefore')); this.sim.recostume(p, c); p.def.costume = c; drawPortrait(c, $('shAfter'));
    $('shMsg').textContent = `выпало: ${got} (−${price} 🪙)`; this.notify(`${escHtml(got)} · −${price} монет`, 'coin');
    this.log('buy', { kind, item: got });
    this.save(); this.renderHUD(); this.renderShop(); this.o.showCard(p, true);
  }
  takeOff(kind) {
    const p = this.player; if (!p) return; const c = { ...p.costume }; c[kind] = 'none';
    drawPortrait(p.costume, $('shBefore')); this.sim.recostume(p, c); p.def.costume = c; drawPortrait(c, $('shAfter')); $('shMsg').textContent = 'снято';
    this.save(); this.renderShop(); this.o.showCard(p, true);
  }
  // --- интерфейс
  // сердца иконками: hp полных и maxHp − hp пустых; только что потерянное 300 мс мигает со сдвигом (класс lost); при maxHp > 10 — одно с числом
  hearts(g) {
    const hp = Math.max(0, g.hp | 0), max = Math.max(hp, g.maxHp | 0); const lost = Date.now() - (this.heartLostAt || 0) < 400;
    if (max > 10) return `<span class="hearts" title="сердца ${hp}/${max}">${icon('heart', 1)} ×${hp}/${max}</span>`;
    let s = ''; for (let i = 0; i < max; i++) s += i < hp ? icon('heart', 1) : i === hp && lost ? icon('heartEmpty', 1).replace('class="ic ', 'class="ic lost ') : icon('heartEmpty', 1);
    return `<span class="hearts" title="сердца ${hp}/${max}">${s}</span>`;
  }
  // индикатор угрозы: надгробия по уровню, мигает, когда охотник ближе 300 м
  threatHtml() {
    const h = this.hunters, p = this.player; const lvl = h ? h.level : 0; const near = h && p ? h.nearest() : null;
    const hot = !!near && Math.hypot(near.a.x - p.x, near.a.z - p.z) < PURSUIT.nearWarn;
    // полоса 60×6: заливка по розыску, цвет по уровню от зелёного через оранжевый к красному, деления по 20; 🚗 иконкой, пока игрок на проезжей части
    const heat = h ? Math.max(0, Math.min(100, h.heat)) : 0; const col = lvl >= 4 ? '#ff3a5c' : lvl >= 2 ? 'var(--accent)' : 'var(--green)';
    const ticks = [20, 40, 60, 80].map(v => `<i class="tick" style="left:${v}%"></i>`).join('');
    return `<span class="thr thrWrap${lvl ? ' on' : ''}${hot ? ' hot' : ''}" title="розыск ${Math.round(heat)}/100${lvl ? ` · уровень ${lvl}${hot ? ' · охотник рядом' : ''}` : ''}">${icon('wanted', 1)}<span class="thrBar"><i class="fill" style="width:${heat}%;background:${col}"></i>${ticks}</span></span>${this.onRoadLast ? `<span class="road" title="проезжая часть: скорость ×1.2, розыск +1 за 4 с">${icon('car', 1)}</span>` : ''}`;
  }
  renderHUD() {
    const hud = $('hud'); const p = this.player; const own = this.o.own ? this.o.own() : [];
    if (!p) {
      hud.innerHTML = this.lastPerished ? `<div class="hudName">☠ ${esc(this.lastPerished)} упокоен навсегда</div><div class="hudRow"><button class="hudPick">взять другого</button><button class="green hudNew">создать нового</button></div>` : `<button class="green hudNew">создать своего скелета</button><div class="hudHint">ходи по городу, бросай d20, собирай арканы</div>`;
      hud.classList.remove('has'); return;
    }
    const g = this.g; const st = statsOf(g);
    hud.classList.add('has');
    const cap = this.o.slots ? this.o.slots() : 5; // слоты скелетов на устройстве: по одному, дальше за собранные руки, до пяти
    const avatars = own.length > 1 || own.length < cap ? `<div class="hudOwn">${own.map(o => `<canvas class="av${o.agent === p ? ' cur' : ''}" width="24" height="36" data-seed="${o.def.seed}" title="${esc(o.def.name)}"></canvas>`).join('')}${own.length < cap ? `<button class="avAdd" title="ещё скелет (слотов ${cap}, до пяти за собранные руки)">+</button>` : ''}</div>` : '';
    const hc = this.cards?.hand; const hdown = hc ? hc.cards.filter(c => c.state === 'down').length : 0; const lvl = this.hunters?.level || 0;
    // строка статуса (свёрнуто): имя, сердца, XP, монеты, рука, розыск; клик по ней разворачивает карточку
    hud.innerHTML = `<div class="hudMini" title="развернуть карточку"><span class="hudName">${esc(p.bio.name)}</span>${this.hearts(g)}<span class="pts">${icon('xp', 1)} ${g.score}</span><span class="cn">${icon('coin', 1)} ${g.coins}</span>${hc ? `<span class="hm" title="Мёртвая рука">${icon('hand', 1)} ${hdown}/${hc.cards.length}</span>` : ''}${lvl ? this.threatHtml() : ''}<span class="hudArrow">▼</span></div><div class="hudTop"><canvas class="hudPic" width="48" height="72" title="При жизни: ${esc(p.bio.job)}"></canvas><div class="hudHead"><div class="hudName">${esc(p.bio.name)}</div><div class="hudMeta">${this.o.metaText ? esc(this.o.metaText(p)) : ''}</div><div class="hudState">${this.o.stateText ? esc(this.o.stateText(p)) : ''}</div></div>${avatars}<button class="x hudFold" title="свернуть">–</button></div>
      <div class="hudRow">${this.hearts(g)}${`<span class="sh" title="щит: примет одну рану или укус">${icon('shield', 1)}</span>`.repeat(Math.max(0, g.shields | 0))}</div>
      <div class="hudRow"><span class="tl" title="друзья в хвосте">${icon('friend', 1)} ${g.tail.length}/${CAPS.tail}</span><span class="pts" title="XP: победа +2, поражение −1, аркана +5, новое заведение +1, босс 2 × старшинство">${icon('xp', 1)} ${g.score}</span>${this.threatHtml()}${this.chipsHtml()}</div>
      <div class="hudRow">${statLine({ kills: st.kills, friends: st.friends, visits: g.seenVenues.length })}<button class="deck tc" title="арканы: открыть колоду">${icon('arcana', 1)} ${g.tarot.length}/${ARCANA.length}</button>${statLine({ coins: g.coins, tokens: g.tokens | 0, deaths: g.deaths })}${this.cards ? this.cards.myCardHtml() : ''}</div>
      ${this.cards ? this.cards.hudHtml() : ''}
      <div class="hudCtlRow">${p.state === 'dead' ? '' : `<button class="hudCtl${this.selected ? '' : ' green'}">${this.selected ? 'отпустить' : 'управлять'}</button>`}<button class="hudFollow${this.o.isFollowing && this.o.isFollowing(p) ? ' on' : ''}" title="камера идёт за скелетом">следить</button><span class="hudHint">${p.state === 'dead' ? 'собираем кости…' : this.pending ? 'идём к цели…' : this.selected ? 'клик по карте — идти · по скелету — сладость или гадость · по тыкве — зайти · зажатый пробел — бег · Esc — отпустить' : 'гуляет сам · клик по карточке — профиль'}</span></div>`;
    for (const cv of hud.querySelectorAll('canvas.av')) { const o = own.find(x => String(x.def.seed) === cv.dataset.seed); if (o) drawPortrait(o.agent.costume, cv); }
    const pic = hud.querySelector('canvas.hudPic'); if (pic) this.portrait(p, pic); // портрет своего скелета — карточки у него больше нет
    this.cards?.drawHandCards();
  }
  // системное сообщение тостом справа сверху (начисления, визиты, щиты, квесты); пузыри над головой остаются речи
  notify(text, iconName = null, ms = 2500) { toast(text, iconName, ms); }
  // блок в карточке скелета
  cardHtml(a) {
    if (a.def && a.def.boss && this.cards) { // босс часа: карта, бонус к кубику и XP за победу, чья копия
      const c = this.cards.cardOf(a);
      if (c) return `<div class="gm"><div class="line">карта часа <b class="bcard${isRed(c.suit) ? ' red' : ''}">${cardLabel(c.rank, c.suit)}</b> · бонус +${bossBonus(c.rank)} · за победу XP ${bossXp(c.rank)}</div><div class="line muted">${c.ghoul ? 'упырь с карточного стола' : 'копия скелета из рейтинга'}${c.state === 'cool' ? ' · отдыхает' : c.state === 'down' ? ' · бита' : ''}</div></div>`;
    }
    if (a === this.player) {
      const g = this.g, st = statsOf(g); const lvl = this.hunters?.level || 0;
      return `<div class="gm"><div class="line">${this.hearts(g)} <span class="muted">${g.hp}/${g.maxHp}</span></div>
        <div class="line"><span class="pts">${icon('xp', 1)} ${g.score}</span> · ${icon('heart', 1)} max ${g.maxHp} · <span class="tl">${icon('friend', 1)} хвост ${g.tail.length}/${CAPS.tail}</span>${lvl ? ` · <span class="thr on" title="розыск">${icon('wanted', 1)} ${lvl}</span>` : ''}</div>
        <div class="line"><span class="skc">${icon('skull', 1)} ${st.kills}</span> · <span class="frc">${icon('friend', 1)} ${st.friends}</span> · <span class="tc">${icon('arcana', 1)} ${g.tarot.length}/${ARCANA.length}</span> · <span class="vc" title="заведений">${icon('places', 1)} ${g.seenVenues.length}</span> · <span class="cn">${icon('coin', 1)} ${g.coins}</span>${g.tokens ? ` · <span class="tk">${icon('token', 1)} ${g.tokens}</span>` : ''}</div></div>`;
    }
    if (a.custom && !a.def.guest && a.def.game) { const st = statsOf(a.def.game); return `<div class="gm"><div class="line muted">${statLine({ score: st.score, hearts: st.hearts, tail: st.tail, kills: st.kills, tarot: st.tarot }, { arcana: ARCANA.length })} · гуляет сам</div></div>`; }
    if (a.ghost) { const s = this.g && this.g.log.find(x => x.kind === 'kill' && x.uid === a.uid); return `<div class="gm"><div class="line ghost">призрак${s ? ` · убит вами в ${esc(fmtAt(s.at))}` : ''}</div></div>`; }
    if (this.player && a.leader === this.player) { const f = this.g && this.g.tail.find(x => x.uid === a.uid); return `<div class="gm"><div class="line friend">ваш друг${f ? ` с ${esc(fmtAt(f.at))}` : ''} · идёт следом</div></div>`; }
    return '';
  }
  // окно профиля своего скелета: стак и счёт, черепа и друзья из журнала с подсказками, посещения
  profileHtml(a) {
    const g = a.def.game ? migrate(a.def.game) : null; if (!g) return '<div class="hint">этот скелет ещё не играл</div>';
    let id = 0; this.tips = {};
    const who = s => `<b>${esc(s.name)}</b><br>${s.age} ${ageWord(s.age)} · ${s.gender === 'm' ? 'мужчина' : 'женщина'}<br>при жизни: ${esc(s.job)}`;
    const when = s => `${esc(fmtAt(s.at))}${s.street ? ', ' + esc(s.street) : ''} · d20: ${s.roll ?? '?'}`;
    const kills = g.log.filter(e => e.kind === 'kill' || (e.kind === 'win' && e.intent === 'kill')).slice(0, 30);
    const friends = g.log.filter(e => e.kind === 'friend' || (e.kind === 'win' && e.intent === 'friend')).slice(0, 30);
    const sk = kills.map(s => { const k = 's' + id++; this.tips[k] = `${who(s)}<br>${s.boss ? '👑 босс · ' : ''}убит в ${when(s)}`; return `<span class="sk${s.boss ? ' boss' : ''}" data-tip="${k}">${s.boss ? icon('boss', 1) : icon('skull', 1)}</span>`; }).join('');
    const fr = friends.map(s => { const k = 'f' + id++; this.tips[k] = `${who(s)}<br>${s.boss ? '👑 босс · ' : ''}подружились в ${when(s)}${s.kind === 'friend' && !s.inTail ? ' · машет из толпы' : ''}`; return `<span class="fr${s.boss ? ' boss' : ''}" data-tip="${k}">${s.boss ? icon('boss', 1) : icon('friend', 1)}</span>`; }).join('');
    const vis = g.visits.slice(0, 10).map(v => `<div class="vis">${esc(v.at)} · ${icon('places', 1)} ${esc(v.name)}${v.auto ? ' <span class="muted">(сам)</span>' : ''}</div>`).join('');
    return `<div class="pf">
      <div class="line">${this.hearts(g)} <span class="muted">${g.hp}/${g.maxHp}</span> · ${statLine({ score: g.score, kills: g.kills | 0, friends: g.friendsTotal | 0, tarot: g.tarot.length, visits: g.seenVenues.length }, { arcana: ARCANA.length })} <span class="muted">· побед ${g.wins} · поражений ${g.losses}</span></div>
      <div class="line">хвост: <span class="tl">${icon('friend', 1)} ${g.tail.length}/${CAPS.tail}</span>${g.tail.length ? ' <span class="muted">· ' + g.tail.map(f => esc(firstName(f.name))).join(', ') + '</span>' : ''}</div>
      <div class="line">черепа: ${sk || '<span class="muted">пока нет</span>'}</div>
      <div class="line">друзья: ${fr || '<span class="muted">пока нет</span>'}</div>
      <div class="line">арканы: <span class="tc">${icon('arcana', 1)} ${g.tarot.length}/${ARCANA.length}</span>${g.tarot.length ? ' · ' + g.tarot.map(t => { const a = ARCANA_BY_ID[t.id]; return a ? `<span class="arc" data-arc="${a.id}" title="открыть карту">${a.roman} ${esc(a.name)}</span>` : ''; }).join(' ') : ''}</div>
      <div class="line">монеты: <span class="cn">${icon('coin', 1)} ${g.coins}</span> · спас-броски: <span class="tk">${icon('token', 1)} ${g.tokens}</span>${g.shared ? ' <span class="muted">· карточка опубликована</span>' : ''}</div>
      <div class="line muted">заведений: ${g.seenVenues.length} · щиты: ${icon('places', 1)} ${g.shields | 0}${g.deaths ? ` · смертей: ${g.deaths}` : ''}</div>${vis}</div>`;
  }
  portrait(a, canvas) { if (a.ghost) drawGhostPortrait(canvas, GHOSTS[a.ghostKind] || GHOSTS.npc); else drawPortrait(a.costume, canvas, a.haunted ? { ghost: GHOSTS.hunter } : undefined); }
}
export { OUTCOMES };
