// Хранилище: прогресс и свои скелеты лежат в localStorage; если в config.js задан
// Supabase (бесплатный тариф), то же самое уходит в таблицу `skeletons` через PostgREST,
// а чужие скелеты можно показать на карте. Любая ошибка сети — молча остаёмся локальными.
const LS = 'minsk-skeletons.custom';

// счёт для доски почёта считается в rules.js (накопитель у v2, старая формула у прежнего прогресса)
import { scoreOf, statsOf } from './rules.js';
export { scoreOf };

export const local = {
  load() { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } },
  save(list) { try { localStorage.setItem(LS, JSON.stringify(list)); } catch { } },
  get(k, d) { try { const v = localStorage.getItem('minsk-skeletons.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('minsk-skeletons.' + k, JSON.stringify(v)); } catch { } },
};

// устойчивый анонимный идентификатор устройства: по нему скелет обновляется, а не дублируется
export function deviceId() {
  let id = local.get('device', null);
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)); local.set('device', id); }
  return id;
}

export class Remote {
  constructor(cfg) { this.url = cfg.url.replace(/\/$/, ''); this.key = cfg.anonKey; this.table = cfg.table || 'skeletons'; this.ok = true; this.lastError = null; }
  headers(extra = {}) { return { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', ...extra }; }
  async call(path, init = {}) {
    try {
      const r = await fetch(this.url + '/rest/v1/' + path, { ...init, headers: this.headers(init.headers || {}) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
      this.ok = true; const text = await r.text(); return text ? JSON.parse(text) : null; // на return=minimal сервер отвечает 201 с пустым телом
    } catch (e) { this.ok = false; this.lastError = String(e); console.warn('remote', e); return null; }
  }
  // сохранить / обновить своего скелета вместе с игровым прогрессом: костюм, стак и счётчики; позиция в сеть не уходит
  upsert(def, game) {
    const st = statsOf(game);
    const row = { id: deviceId() + ':' + def.seed, device: deviceId(), name: def.name, gender: def.gender, age: def.age, job: def.job, arch: def.arch, seed: def.seed, costume: def.costume ?? null,
      hp: game?.hp ?? 3, kills: st.kills, friends: st.friends, visits: st.visits, deaths: st.deaths, tarot: st.tarot, coins: game?.coins ?? 0, score: st.score, wins: st.wins, losses: st.losses, hearts: st.hearts, tail: st.tail, updated_at: new Date().toISOString() };
    return this.call(this.table + '?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  }
  // чужие скелеты: последние активные, кроме своих; с костюмом и счётом — это же пул охотников
  others(limit = 30) { return this.call(`${this.table}?select=id,device,name,gender,age,job,arch,seed,costume,kills,friends,hp,score,updated_at&device=neq.${encodeURIComponent(deviceId())}&order=updated_at.desc&limit=${limit}`); }
  // доска почёта: счёт и живой стак
  top(limit = 10) { return this.call(`${this.table}?select=id,device,name,job,arch,kills,friends,visits,deaths,tarot,score,hearts,tail,wins,losses,updated_at&order=score.desc,kills.desc,friends.desc&limit=${limit}`); }
  // набег: стычка чужого охотника с моим скелетом (пишет клиент жертвы)
  logEncounter(row) { return this.call('encounters', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) }); }
  // набеги с моим участием (как охотник или жертва) новее отметки
  raids(sinceIso, limit = 50) { const me = encodeURIComponent(deviceId()); return this.call(`encounters?or=(hunter_device.eq.${me},victim_device.eq.${me})&at=gt.${encodeURIComponent(sinceIso)}&order=at.desc&limit=${limit}`); }
  remove(def) { return this.call(`${this.table}?id=eq.${encodeURIComponent(deviceId() + ':' + def.seed)}`, { method: 'DELETE' }); }
}

export function makeRemote() {
  const cfg = globalThis.MINSK_CONFIG && globalThis.MINSK_CONFIG.supabase;
  if (!cfg || !cfg.url || !cfg.anonKey) return null;
  return new Remote(cfg);
}
