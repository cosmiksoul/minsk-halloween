// Хранилище: прогресс и свои скелеты лежат в localStorage; если в config.js задан
// Supabase (бесплатный тариф), то же самое уходит в таблицу `skeletons` через PostgREST,
// а чужие скелеты можно показать на карте. Любая ошибка сети — молча остаёмся локальными.
const LS = 'minsk-skeletons.custom';

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
      this.ok = true; return r.status === 204 ? null : await r.json();
    } catch (e) { this.ok = false; this.lastError = String(e); console.warn('remote', e); return null; }
  }
  // сохранить / обновить своего скелета вместе с игровым прогрессом
  upsert(def, game) {
    const row = { id: deviceId() + ':' + def.seed, device: deviceId(), name: def.name, gender: def.gender, age: def.age, job: def.job, arch: def.arch, seed: def.seed,
      hp: game?.hp ?? 3, kills: game?.skulls?.length ?? 0, friends: game?.friends?.length ?? 0, visits: game?.visits?.length ?? 0, deaths: game?.deaths ?? 0, x: game?.x ?? null, z: game?.z ?? null, updated_at: new Date().toISOString() };
    return this.call(this.table + '?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
  }
  // чужие скелеты: последние активные, кроме своих
  others(limit = 30) { return this.call(`${this.table}?select=id,name,gender,age,job,arch,seed,kills,friends,hp,updated_at&device=neq.${encodeURIComponent(deviceId())}&order=updated_at.desc&limit=${limit}`); }
  // доска почёта
  top(limit = 10) { return this.call(`${this.table}?select=name,job,kills,friends,visits,deaths,updated_at&order=kills.desc,friends.desc&limit=${limit}`); }
  remove(def) { return this.call(`${this.table}?id=eq.${encodeURIComponent(deviceId() + ':' + def.seed)}`, { method: 'DELETE' }); }
}

export function makeRemote() {
  const cfg = globalThis.MINSK_CONFIG && globalThis.MINSK_CONFIG.supabase;
  if (!cfg || !cfg.url || !cfg.anonKey) return null;
  return new Remote(cfg);
}
