// Карты часа: рейтинг — колода из 52 карт (место → масть по четвертям и старшинство), каждый час игроку сдаётся рука
// из пяти карт, и пять боссов-копий этих скелетов (или упырей-картёжников) встают на узлах графа вокруг него.
// Здесь колода и сдача, расстановка по кольцу графа, боссы в городе с картой над головой, рука в прогрессе
// скелета и смена часа. Бой, откат и бонус за руку — следующей задачей плана. Числа в rules.js.
import * as THREE from 'three';
import { CARD, TOKEN, POINTS, cardsFromDeck, dealHand, minskHour, hourLeft, handSeed, rngOf, cardOfSlot, bossXp } from './rules.js';
import { cardLabel, cardName, beaten, isRed, handRank } from './poker.js';
import { makeBio, makeRng, pickArchetype } from './bio.js';
import { deviceId } from './store.js';

const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export class Cards {
  constructor({ sim, game, scene, remote, hunters, addSlot, flyTo, showCard }) {
    this.sim = sim; this.game = game; this.scene = scene; this.remote = remote || null; this.hunters = hunters || null;
    this.addSlot = addSlot || (() => false); this.flyToFn = flyTo || null; this.showCard = showCard || null;
    this.deck = []; this.deckHour = null; this.bosses = []; this.acc = 0; this.token = 0; this.dealing = false;
  }
  get hand() { const g = this.game.g; return g ? g.hand : null; }
  get player() { return this.game.player; }
  // вход или смена скелета: рука этого часа из прогресса (узлы проверяются) или новая сдача; с базой первая сдача ждёт рейтинг до трёх секунд
  async start() {
    const g = this.game.g, p = this.player; if (!g || !p) return;
    const token = ++this.token; const hour = minskHour(Date.now());
    if (g.hand && g.hand.hour === hour) { this.verifyHand(g.hand); this.spawnBosses(); this.game.renderHUD(); return; }
    this.dealing = true; await this.loadDeck(hour); this.dealing = false;
    if (token !== this.token || this.game.player !== p || this.game.g !== g) return;
    this.deal(hour);
  }
  // колода на этот час: ответ рейтинга или пусто (упыри); позже трёх секунд ответ на этот час уже не ждём
  async loadDeck(hour) {
    if (!this.remote) { this.deck = []; return; }
    if (this.deckHour === hour) return;
    const rows = await Promise.race([this.remote.top(CARD.slots).catch(() => null), new Promise(r => setTimeout(() => r(null), 3000))]);
    this.deck = Array.isArray(rows) ? rows : []; this.deckHour = hour;
  }
  // сдача: пять мест колоды по часу, устройству и скелету; боссы на узлах кольца 200–700 м (шире на окраине), не у заведений и не посреди проспекта
  deal(hour) {
    const g = this.game.g, p = this.player; if (!g || !p) return;
    const dev = deviceId(), seed = p.def.seed || 1;
    const cards = cardsFromDeck(dealHand(hour, dev, seed), this.deck, hour, dev);
    for (const c of cards) {
      const rng = makeRng(c.seed || 1); const arch = pickArchetype(rng); const bio = makeBio(makeRng(c.seed || 1), arch);
      if (!c.name) c.name = bio.name; if (!c.gender) c.gender = bio.gender; if (!c.age) c.age = bio.age; if (!c.arch) c.arch = arch.id; if (!c.job) c.job = bio.job;
    }
    const rng = rngOf(handSeed(hour, dev, seed) ^ 0x9e3779b9);
    const nodes = this.placeNodes(CARD.hand, rng, []);
    cards.forEach((c, i) => { this.setNode(c, nodes[i]); c.state = 'up'; c.coolUntil = 0; });
    g.hand = { hour, cards, dealtAt: Date.now() };
    this.game.save(); this.spawnBosses(); this.game.renderHUD();
  }
  setNode(c, n) { const g = this.sim.graph; c.node = n; c.x = g.x[n]; c.z = g.z[n]; }
  // узлы для карт: кольцо по цене пути от узла игрока, радиус растёт шагами до потолка, пока кандидатов меньше нужного;
  // сначала именованные, разброс не ближе CARD.spacing; при нехватке pickSpaced добирает ближайшими
  placeNodes(count, rng, used) {
    const g = this.sim.graph, p = this.player; const start = this.sim.nodeOf(p);
    const bad = n => used.includes(n) || this.sim.venueNode.has(n) || !!(this.game.shops && this.game.shops.byNode.has(n)) || g.allMajor(n);
    let cands = [];
    for (let max = CARD.ringMax; ; max += CARD.ringStep) { cands = g.ring(start, CARD.ringMin, max).filter(n => !bad(n)); if (cands.length >= count || max >= CARD.ringCap) break; }
    const named = cands.filter(n => g.names[n]); const pool = named.length >= count ? named : cands;
    return g.pickSpaced(pool, count, CARD.spacing, rng, p.x, p.z);
  }
  // сохранённая рука: узел должен существовать и быть проходимым и не быть заведением, иначе ближайший к сохранённым координатам, иначе снова в кольцо
  verifyHand(hand) {
    const g = this.sim.graph; const okNode = n => Number.isInteger(n) && n >= 0 && n < g.x.length && g.ok[n] && !this.sim.venueNode.has(n);
    const lost = [];
    for (const c of hand.cards) {
      if (okNode(c.node)) continue;
      const n = Number.isFinite(c.x) && Number.isFinite(c.z) ? g.nearest(c.x, c.z, 300) : -1;
      if (n >= 0 && !this.sim.venueNode.has(n)) this.setNode(c, n); else lost.push(c);
    }
    if (lost.length) {
      const rng = rngOf(handSeed(hand.hour, deviceId(), this.player.def.seed || 1) ^ 0x51ed270b);
      const nodes = this.placeNodes(lost.length, rng, hand.cards.filter(c => !lost.includes(c)).map(c => c.node));
      lost.forEach((c, i) => { if (nodes[i] != null) this.setNode(c, nodes[i]); });
      this.game.save();
    }
  }
  // боссы в городе: гости с def.boss, ведомые агенты, стоят на своём узле без желаний толпы; карта над головой
  spawnBosses() {
    this.clearBosses(false);
    const hand = this.hand; if (!hand) return;
    for (const c of hand.cards) {
      const def = { name: c.name, gender: c.gender, age: c.age, job: c.job, arch: c.arch, seed: c.seed, costume: c.costume || undefined, guest: true, boss: true, slot: c.slot, ghoul: !!c.ghoul, owner: c.owner || null };
      const a = this.sim.spawnCustom(def, c.x, c.z); this.sim.drive(a, true); this.sim.teleport(a, c.node); a.to = a.from; a.t = 0; a.state = 'idle'; a.path = null; this.sim.place(a);
      const sprite = this.makeSprite(c); this.scene.add(sprite); const b = { card: c, a, sprite }; this.bosses.push(b); this.placeSprite(b);
    }
  }
  // уход боссов: со словами «карта бита» через две секунды (смена часа) или сразу (смена скелета)
  clearBosses(say) {
    const list = this.bosses; this.bosses = [];
    const drop = b => { if (this.sim.agents.includes(b.a)) this.sim.remove(b.a); this.scene.remove(b.sprite); b.sprite.material.map.dispose(); b.sprite.material.dispose(); };
    for (const b of list) { if (say) { this.sim.say(b.a, 'карта бита', '', 2); setTimeout(() => drop(b), 2000); } else drop(b); }
  }
  onPlayerChange() { this.token++; this.dealing = false; this.clearBosses(false); this.start(); }
  cardOf(agent) { const b = this.bosses.find(b => b.a === agent); return b ? b.card : null; }
  agentOf(card) { const b = this.bosses.find(b => b.card === card); return b ? b.a : null; }
  // своя карта в колоде часа: место своей строки в топ-52 (только с базой)
  myCard() {
    const p = this.player; if (!p || !this.deck.length) return null;
    const i = this.deck.findIndex(r => r.id === deviceId() + ':' + p.def.seed); if (i < 0 || i >= CARD.slots) return null;
    return { slot: i + 1, ...cardOfSlot(i + 1) };
  }
  labelForRank(i) { if (!(i >= 1 && i <= CARD.slots)) return null; const c = cardOfSlot(i); return cardLabel(c.rank, c.suit); }
  // --- спрайт карты над головой: номинал и масть, красные масти красным, рубашка у битой, серая у отдыхающей
  makeSprite(c) {
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 44; this.drawCard(cv, c);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.4, fog: false })); sp.center.set(0.5, 0); sp.renderOrder = 4; return sp;
  }
  drawCard(cv, c) {
    const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    if (c.state === 'down') { rr(1, 1, 30, 42, 4); g.fillStyle = '#2b1b4e'; g.fill(); g.strokeStyle = '#d9c3ff'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#5a3f99'; for (let y = 6; y < 40; y += 6) for (let x = 5 + (y / 6 % 2) * 3; x < 28; x += 6) g.fillRect(x, y, 3, 3); return; }
    rr(1, 1, 30, 42, 4); g.fillStyle = c.state === 'cool' ? '#9a9a9a' : '#fff8e7'; g.fill(); g.strokeStyle = c.state === 'cool' ? '#555' : '#1b1326'; g.lineWidth = 2; g.stroke();
    g.fillStyle = c.state === 'cool' ? '#444' : isRed(c.suit) ? '#ff3a5c' : '#1b1326'; g.textBaseline = 'top'; g.textAlign = 'left';
    g.font = 'bold 12px monospace'; g.fillText(c.rank === 10 ? '10' : cardLabel(c.rank, '').slice(0, 2), 3, 3);
    g.textAlign = 'center'; g.font = '18px serif'; g.fillText(c.suit, 16, 20);
  }
  redraw(card) { const b = this.bosses.find(b => b.card === card); if (!b) return; this.drawCard(b.sprite.material.map.image, card); b.sprite.material.map.needsUpdate = true; }
  placeSprite(b) { const H = this.sim.H; b.sprite.position.set(b.a.x, H * 1.05, b.a.z); b.sprite.scale.set(H * 0.42, H * 0.58, 1); }
  // --- бой: только по явному «сразиться»; скелет идёт к боссу как к прохожему, дуэль стартует по приходу (Game.update)
  fight(card) {
    const game = this.game, p = this.player; if (!p || !card) return false;
    if (card.state !== 'up') { this.sim.say(p, card.state === 'cool' ? 'отдышись' : 'эта карта уже бита', 'boo', 1.6); return false; }
    const a = this.agentOf(card); if (!a) return false;
    game.dropPending(); game.pendingVenue = null; game.pendingShop = null; game.closeDialog();
    if (!this.sim.moveTo(p, a.x, a.z, { cut: true })) { this.sim.say(p, 'не дойти', 'boo', 1.4); game.pendingBoss = null; return false; }
    game.pendingBoss = { card, a }; game.dest.position.set(a.x, 0.56, a.z); game.dest.visible = true; game.destT = 1; return true;
  }
  // исход дуэли с боссом: победа кладёт карту, даёт XP по старшинству и розыск; поражение — укус и минута отката
  settle(h, r, { foe, fb, my, tb }) {
    const game = this.game, g = game.g, me = this.player, a = h.a, card = h.card;
    const base = { uid: a.uid, name: a.bio.name, age: a.bio.age, gender: a.bio.gender, job: a.bio.job, arch: a.arch, ck: a.ck, slot: card.slot, rank: card.rank, suit: card.suit, card: cardLabel(card.rank, card.suit), cardName: cardName(card.rank, card.suit), owner: card.owner || null, ghoul: !!card.ghoul, foe, bonus: fb, roll: my, meBonus: tb };
    if (r.winner === 'me') {
      card.state = 'down'; card.coolUntil = 0; this.redraw(card);
      if (r.crit) game.heal(1);
      g.coins += 4; g.wins++; const xp = bossXp(card.rank); game.points(xp);
      game.log('card', base); this.hunters?.gain('boss'); game.quests?.onEvent('card', xp);
      this.sim.say(me, `🃏 ${base.cardName} ${beaten(card.rank)} · XP +${xp}`, 'music', 2.8);
      setTimeout(() => game.player === me && this.sim.say(me, '🪙 +4', 'beer', 2.2), 2600);
      if (this.hand && this.hand.cards.every(c => c.state === 'down')) this.completeHand();
      game.save(); return 'card';
    }
    g.losses++; game.points(POINTS.loss);
    game.log('cardBit', { ...base, ate: r.eat });
    card.state = 'cool'; card.coolUntil = Date.now() + CARD.cooldown * 1000; this.redraw(card);
    this.sim.say(a, r.crit ? 'АМ-АМ' : 'ам', 'boo', 2.4);
    const res = game.eat(r.eat, 'boss'); game.save();
    return res === 'dead' ? (game.player !== me && me.def.dead ? 'rip' : 'killed') : 'cardBit';
  }
  // все пять карт биты до конца часа: бонус по покерному рангу, жетон и слот скелета
  completeHand() {
    const game = this.game, g = game.g, hand = this.hand, me = this.player; if (!hand || !g) return;
    const hr = handRank(hand.cards); const xp = CARD.handBase * hr.mult; game.points(xp);
    g.hands = (g.hands | 0) + 1; if (!g.bestHand || hr.mult > g.bestHand.mult) g.bestHand = { key: hr.key, name: hr.name, mult: hr.mult };
    g.tokens = (g.tokens | 0) + TOKEN.perHand; const slotNew = this.addSlot();
    game.log('hand', { hand: hr.key, name: hr.name, mult: hr.mult, xp, cards: hand.cards.map(c => cardLabel(c.rank, c.suit)) });
    this.sim.say(me, `🃏 рука собрана: ${hr.name} · +${xp} XP · 🎟 +1${slotNew ? ' · 🦴 новый слот' : ''}`, 'music', 5);
    game.save(); game.renderHUD();
  }
  // --- HUD: полоса из пяти карт (лицом, серая с секундами отката, рубашкой), ранг руки и время до конца часа; своя карта в колоде
  hudHtml() {
    const hand = this.hand; if (!hand) return '';
    const now = Date.now(); const hr = handRank(hand.cards);
    const cards = hand.cards.map(c => `<span class="hc ${c.state}${isRed(c.suit) ? ' red' : ''}" data-slot="${c.slot}" title="${esc(c.name)} · ${cardName(c.rank, c.suit)}${c.state === 'cool' ? ' · отдыхает' : c.state === 'down' ? ' · бита' : ''}">${c.state === 'down' ? '🂠' : cardLabel(c.rank, c.suit)}${c.state === 'cool' ? `<small class="cd">${Math.max(0, Math.ceil((c.coolUntil - now) / 1000))}</small>` : ''}</span>`).join('');
    return `<div class="hand" title="карты часа: клик по карте летит к боссу">${cards}<span class="handR" title="ранг руки по покеру">${hr.name} ×${hr.mult}</span><span class="handT" title="до конца часа">⏳ ${mmss(hourLeft(now))}</span></div>`;
  }
  myCardHtml() { const mc = this.myCard(); return mc ? `<span class="myCard" title="твоя карта в колоде часа: место ${mc.slot} в топ-52">карта ${cardLabel(mc.rank, mc.suit)}</span>` : ''; }
  // камера к боссу карты и его карточка (клик по полосе на HUD)
  flyTo(slot) { const b = this.bosses.find(b => b.card.slot === slot); if (!b) return; if (this.flyToFn) this.flyToFn(b.a.x, b.a.z); if (this.showCard) this.showCard(b.a); }
  // раз в секунду: смена часа (не посреди боя), откаты, таймер на HUD; каждый кадр — спрайты за боссами и ростом
  update(dt) {
    for (const b of this.bosses) this.placeSprite(b);
    this.acc += dt; if (this.acc < 1) return; this.acc = 0;
    const g = this.game.g, p = this.player, hand = this.hand; if (!g || !p || this.dealing) return;
    const now = Date.now(), hour = minskHour(now);
    if ((!hand || hand.hour !== hour) && !this.game.busy && !this.game.pendingBoss) {
      // старая рука закрывается без бонуса, боссы уходят; новая сдаётся вокруг текущего места после свежей колоды
      const token = ++this.token; this.clearBosses(!!hand); this.dealing = true;
      this.loadDeck(hour).then(() => { this.dealing = false; if (token !== this.token || this.game.player !== p || this.game.g !== g) return; this.deal(minskHour(Date.now())); });
      return;
    }
    let changed = false;
    for (const c of hand.cards) if (c.state === 'cool' && now >= (c.coolUntil || 0)) { c.state = 'up'; c.coolUntil = 0; this.redraw(c); changed = true; }
    if (changed) { this.game.save(); this.game.renderHUD(); }
    const t = document.querySelector('#hud .handT'); if (t) t.textContent = '⏳ ' + mmss(hourLeft(now));
    for (const el of document.querySelectorAll('#hud .hc.cool .cd')) { const c = hand.cards.find(c => String(c.slot) === el.parentElement.dataset.slot); if (c) el.textContent = String(Math.max(0, Math.ceil((c.coolUntil - now) / 1000))); }
  }
}
