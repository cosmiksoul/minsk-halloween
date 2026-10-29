// Квесты онбординга: цепочка из шести шагов на устройство (не на скелета), по одному на активность, виден только
// текущий. Закрытие добавляет столько же XP, сколько дало само действие (без XP — 5), запись «quest» в журнал,
// за всю цепочку — жетон спас-броска тому скелету, который её закрыл. Прогресс в localStorage устройства.
import { questFor, nextQuest, questBonus } from './rules.js';
import { local } from './store.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export class Quests {
  constructor({ game, sim }) { this.game = game; this.sim = sim; }
  get done() { const d = local.get('quests', []); return Array.isArray(d) ? d : []; }
  current() { return nextQuest(this.done); }
  // событие игры: kill, friend, candy, coin, win (охотник), card (босс); xp — что дало само действие
  onEvent(kind, xp) {
    const game = this.game, g = game.g, p = game.player; if (!g || !p) return null;
    const done = this.done; const q = questFor(done, kind); if (!q) return null;
    done.push(q.id); local.set('quests', done);
    const bonus = questBonus(xp); game.points(bonus);
    game.log('quest', { id: q.id, title: q.title, bonus });
    this.sim.say(p, `🎯 ${q.title} · +${bonus} XP за квест`, 'music', 3);
    if (nextQuest(done) === null) { g.tokens = (g.tokens | 0) + 1; setTimeout(() => game.player === p && this.sim.say(p, '🎯 цепочка пройдена · 🎟 +1', 'music', 3.5), 3100); }
    game.save(); game.renderHUD(); return q;
  }
  hudHtml() { const q = this.current(); return q ? `<div class="hudQuest" title="квест: закрытие даёт ещё столько же XP, сколько само действие, не меньше пяти">🎯 ${esc(q.title)} · ${esc(q.hint)}</div>` : ''; }
}
